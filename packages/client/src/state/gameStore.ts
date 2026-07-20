/**
 * Authoritative-mirror game store (plan §3).
 *
 * The server owns all state; this store only mirrors server snapshots + events
 * so React can render. It NEVER mutates game state locally and NEVER runs a
 * clock: countdowns are derived in components by diffing the absolute
 * `roundDeadline`/`turnDeadline` against the client clock.
 *
 * Built on zustand's framework-agnostic `createStore` so the exact same store
 * drives both the React app and the headless integration test.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';

import {
  ServerEvents,
  type RoomSnapshot,
  type GameStartedPayload,
  type RoundStartedPayload,
  type TurnStartedPayload,
  type TurnAcceptedPayload,
  type TurnRejectedPayload,
  type RoundEndedPayload,
  type GameEndedPayload,
  type RoomListResultPayload,
  type ErrorPayload,
} from '@subway/shared';

import type { SocketClient } from '../net/socket.js';

/** A UI-level phase the App routes on. Derived from server signals. */
export type UiPhase = 'landing' | 'waiting' | 'in-game' | 'ended';

/** One accepted station in the current round's route (for the ribbon). */
export interface RouteStop {
  /** Integer stationIdx. */
  station: number;
  /** Display name (server-provided). */
  name: string;
  /** Seat index that answered it (undefined for the round-start station). */
  byPlayerIdx?: number;
  /** Line id slugs this station is on (for transfer indicators). */
  lineNames?: string[];
}

/** A transient score pop (cleared by the UI after it animates). */
export interface ScorePop {
  /** Monotonic id so repeated identical pops still re-trigger. */
  id: number;
  seatIdx: number;
  delta: number;
  stationName: string;
}

/** A surfaced turn rejection (cleared shortly after by the UI). */
export interface Rejection {
  id: number;
  reason: TurnRejectedPayload['reason'];
}

/** Full store shape. */
export interface GameState {
  // --- connection / session ---
  connected: boolean;
  token: string | undefined;
  /** Our own seat index, resolved from the snapshot by matching the host/join. */
  mySeatIdx: number | undefined;

  // --- room ---
  room: RoomSnapshot | undefined;

  // --- live game ---
  game: GameStartedPayload | undefined;
  round: RoundStartedPayload | undefined;
  turn: TurnStartedPayload | undefined;
  /** Accepted stations this round, oldest→newest (index 0 = round start). */
  route: RouteStop[];
  /** Current active line slugs (updated on each TurnAccepted). */
  activeLineNames: string[];

  // --- transient UI signals ---
  scorePop: ScorePop | undefined;
  rejection: Rejection | undefined;
  lastError: ErrorPayload | undefined;

  // --- results ---
  roundResult: RoundEndedPayload | undefined;
  gameResult: GameEndedPayload | undefined;

  // --- lobby list ---
  roomList: RoomListResultPayload['rooms'];

  // --- nickname (for room creation from RoomList) ---
  myNickname: string | undefined;

  // --- derived ---
  phase: UiPhase;
}

/** Actions the socket layer / UI invoke. */
export interface GameActions {
  setConnected(connected: boolean): void;
  setToken(token: string | undefined): void;
  onRoomState(snap: RoomSnapshot): void;
  onGameStarted(p: GameStartedPayload): void;
  onRoundStarted(p: RoundStartedPayload): void;
  onTurnStarted(p: TurnStartedPayload): void;
  onTurnAccepted(p: TurnAcceptedPayload): void;
  onTurnRejected(p: TurnRejectedPayload): void;
  onRoundEnded(p: RoundEndedPayload): void;
  onGameEnded(p: GameEndedPayload): void;
  onRoomList(p: RoomListResultPayload): void;
  onError(p: ErrorPayload): void;
  /** Remember which nickname we sent so we can resolve our own seat. */
  setMyNickname(nickname: string): void;
  clearScorePop(): void;
  clearRejection(): void;
  /** Leave the current room — resets all room/game state to landing phase. */
  resetToLanding(): void;
}

export type GameStore = GameState & GameActions;

/** Compute the UI phase from the current snapshot/results. */
function derivePhase(s: {
  room: RoomSnapshot | undefined;
  gameResult: GameEndedPayload | undefined;
}): UiPhase {
  if (!s.room) return 'landing';
  if (s.gameResult) return 'ended';
  if (s.room.phase === 'ended') return 'ended';
  if (s.room.phase === 'playing') return 'in-game';
  return 'waiting';
}

const initialState = (): GameState => ({
  connected: false,
  token: undefined,
  mySeatIdx: undefined,
  room: undefined,
  game: undefined,
  round: undefined,
  turn: undefined,
  route: [],
  activeLineNames: [],
  scorePop: undefined,
  rejection: undefined,
  lastError: undefined,
  roundResult: undefined,
  gameResult: undefined,
  roomList: [],
  myNickname: undefined,
  phase: 'landing',
});

/** Create a fresh, framework-agnostic game store. */
export function createGameStore(): StoreApi<GameStore> {
  let popSeq = 0;
  let rejSeq = 0;
  // Remembered nickname (set at create/join) used to resolve our seat.
  let myNickname: string | undefined;

  return createStore<GameStore>((set, get) => ({
    ...initialState(),

    setConnected: (connected) => set({ connected }),
    setToken: (token) => set({ token }),
    setMyNickname: (nickname) => {
      myNickname = nickname;
      set({ myNickname: nickname });
    },

    onRoomState: (snap) => {
      // Resolve our seat by nickname (stable within a room for the slice).
      let mySeatIdx = get().mySeatIdx;
      if (myNickname !== undefined) {
        const mine = snap.players.find((p) => p.nickname === myNickname);
        if (mine) mySeatIdx = mine.seatIdx;
      }

      // Keep live round/turn in sync from the snapshot (reconnect resync).
      const round = snap.round ?? get().round;
      const turn = snap.turn ?? get().turn;

      // Seed the route from the snapshot's round start if we have none yet
      // (e.g. reconnect mid-round — we can't reconstruct intermediate stops,
      //  but at least anchor the ribbon on the current start station).
      let route = get().route;
      if (route.length === 0 && snap.round) {
        route = [{ station: snap.round.startStation, name: snap.round.startStationName }];
      }

      // If the room has been reset to waiting after a game, clear the result
      // so derivePhase transitions back to 'waiting' instead of staying on 'ended'.
      const gameResult = snap.phase === 'waiting' ? undefined : get().gameResult;
      set({
        room: snap,
        round: snap.phase === 'waiting' ? undefined : round,
        turn: snap.phase === 'waiting' ? undefined : turn,
        mySeatIdx,
        route: snap.phase === 'waiting' ? [] : route,
        gameResult,
        phase: derivePhase({ room: snap, gameResult }),
      });
    },

    onGameStarted: (p) => {
      set({
        game: p,
        gameResult: undefined,
        roundResult: undefined,
      });
    },

    onRoundStarted: (p) => {
      // New round: reset the route to the start station and clear stale results.
      set({
        round: p,
        route: [{ station: p.startStation, name: p.startStationName, lineNames: p.startStationLineNames }],
        activeLineNames: p.startLineNames,
        roundResult: undefined,
        scorePop: undefined,
        rejection: undefined,
        phase: derivePhase({ room: get().room, gameResult: get().gameResult }),
      });
    },

    onTurnStarted: (p) => {
      const cur = get().turn;
      // Dedupe a late re-delivery of the same turn (turnIndex is the key).
      if (cur && p.turnIndex === cur.turnIndex && p.playerIdx === cur.playerIdx) return;
      set({ turn: p });
    },

    onTurnAccepted: (p) => {
      const route = [
        ...get().route,
        { station: p.station, name: p.stationName, byPlayerIdx: p.byPlayerIdx, lineNames: p.stationLineNames },
      ];
      // The server does not re-broadcast room:state on the normal submit path,
      // so mirror the score delta locally onto the answerer for live display.
      // This is a projection of an authoritative event (never a local rule),
      // and is overwritten by the next room:state broadcast.
      const room = get().room;
      let nextRoom = room;
      if (room) {
        nextRoom = {
          ...room,
          players: room.players.map((pl) =>
            pl.seatIdx === p.byPlayerIdx ? { ...pl, score: pl.score + p.scoreDelta } : pl,
          ),
        };
      }
      set({
        room: nextRoom,
        route,
        activeLineNames: p.newActiveLineNames,
        scorePop: {
          id: ++popSeq,
          seatIdx: p.byPlayerIdx,
          delta: p.scoreDelta,
          stationName: p.stationName,
        },
      });
    },

    onTurnRejected: (p) => {
      // Rejection never changes clocks/state — only surface the reason.
      set({ rejection: { id: ++rejSeq, reason: p.reason } });
    },

    onRoundEnded: (p) => {
      set({ roundResult: p });
    },

    onGameEnded: (p) => {
      set({
        gameResult: p,
        turn: undefined,
        phase: 'ended',
      });
    },

    onRoomList: (p) => set({ roomList: p.rooms }),

    onError: (p) => set({ lastError: p }),

    clearScorePop: () => set({ scorePop: undefined }),
    clearRejection: () => set({ rejection: undefined }),

    resetToLanding: () => set({
      room: undefined,
      game: undefined,
      round: undefined,
      turn: undefined,
      route: [],
      activeLineNames: [],
      scorePop: undefined,
      rejection: undefined,
      roundResult: undefined,
      gameResult: undefined,
      phase: 'landing',
    }),
  }));
}

/**
 * Wire a {@link SocketClient} to a store: subscribe every server event to its
 * reducer. Returns an unbind fn that removes all listeners.
 */
export function bindSocketToStore(
  client: SocketClient,
  store: StoreApi<GameStore>,
): () => void {
  const a = store.getState();
  const offs: Array<() => void> = [
    client.on(ServerEvents.session, (p) => {
      a.setToken(p.token);
    }),
    client.on(ServerEvents.roomState, (p) => a.onRoomState(p)),
    client.on(ServerEvents.gameStarted, (p) => a.onGameStarted(p)),
    client.on(ServerEvents.roundStarted, (p) => a.onRoundStarted(p)),
    client.on(ServerEvents.turnStarted, (p) => a.onTurnStarted(p)),
    client.on(ServerEvents.turnAccepted, (p) => a.onTurnAccepted(p)),
    client.on(ServerEvents.turnRejected, (p) => a.onTurnRejected(p)),
    client.on(ServerEvents.roundEnded, (p) => a.onRoundEnded(p)),
    client.on(ServerEvents.gameEnded, (p) => a.onGameEnded(p)),
    client.on(ServerEvents.roomListResult, (p) => a.onRoomList(p)),
    client.on(ServerEvents.error, (p) => a.onError(p)),
  ];

  client.socket.on('connect', () => a.setConnected(true));
  client.socket.on('disconnect', () => a.setConnected(false));
  // Catch the race where the socket already connected before we bound above.
  a.setConnected(client.socket.connected);

  return () => {
    for (const off of offs) off();
    client.socket.off('connect');
    client.socket.off('disconnect');
  };
}
