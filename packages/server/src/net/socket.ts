/**
 * Socket.IO transport for SUBWAY (plan §4/§5/§11).
 *
 * Wires the deterministic {@link GameEngine} + {@link RoomRegistry} to real
 * Socket.IO clients: one handler per protocol event, real timers scheduled
 * against the engine's absolute deadlines, reconnect snapshots, and session
 * tokens.
 *
 * Determinism seam (CRITICAL for non-flaky e2e): time is injected. The transport
 * takes a {@link Scheduler} + `now()` clock; tests pass a controllable fake so
 * turn-timeout and grace-expiry fire on command with NO real sleeps. Only TIME
 * is faked — the socket layer itself uses real Socket.IO over an ephemeral port.
 * The engine's `now`/`rng` are derived from this same clock + a seeded rng.
 *
 * The server is authoritative: `turn:submit` is validated by the engine and a
 * rejection NEVER mutates clocks or state (the running turn timer is untouched).
 */

import { createServer, type Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';

import { Server as IOServer, type Socket } from 'socket.io';

import {
  ClientEvents,
  ServerEvents,
  type BalanceConfig,
  type StationIndex,
  type Settings,
  type ServerToClientEvents,
  type ClientToServerEvents,
  type RoomCreatePayload,
  type RoomJoinPayload,
  type RoomListPayload,
  type PlayerReadyPayload,
  type HostUpdateSettingsPayload,
  type TurnSubmitPayload,
  type RoomSnapshot,
  type RoundStartedPayload,
  type TurnStartedPayload,
  type RoundEndedPayload,
  type GameEndedPayload,
  type ErrorPayload,
} from '@subway/shared';

import { GameEngine } from '../game/engine.js';
import type { EnginePlayerInit } from '../game/GameState.js';
import { RoomRegistry, type Room } from '../game/rooms.js';

// ---------------------------------------------------------------------------
// Injectable time seam
// ---------------------------------------------------------------------------

/** Opaque handle returned by {@link Scheduler.setTimeout}. */
export type TimerHandle = unknown;

/**
 * Minimal scheduler abstraction so tests can drive time deterministically.
 * Production defaults to real `setTimeout`/`clearTimeout`.
 */
export interface Scheduler {
  /** Schedule `fn` to run after `delayMs`; returns a handle to cancel it. */
  setTimeout: (fn: () => void, delayMs: number) => TimerHandle;
  /** Cancel a previously scheduled timer. */
  clearTimeout: (handle: TimerHandle) => void;
}

/** Real-timer scheduler used in production. */
export const realScheduler: Scheduler = {
  setTimeout: (fn, delayMs) => setTimeout(fn, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Options for {@link createGameServer}. */
export interface GameServerOptions {
  /** Nation-wide loaded station index. */
  index: StationIndex;
  /** Balance constants. */
  cfg: BalanceConfig;
  /** Epoch-ms clock. Defaults to `Date.now`. Tests inject a fake clock. */
  now?: () => number;
  /** Timer scheduler. Defaults to {@link realScheduler}. Tests inject a fake. */
  scheduler?: Scheduler;
  /**
   * Factory for a per-game seeded rng, keyed by roomId so each game is
   * reproducible in tests. Defaults to `Math.random` (non-deterministic).
   */
  rngFor?: (roomId: string) => () => number;
  /** rng for room-code/id generation (defaults to `Math.random`). */
  registryRng?: () => number;
  /** Pre-built HTTP server to attach to (tests may pass their own). */
  httpServer?: HttpServer;
}

/** Handle returned by {@link createGameServer}. */
export interface GameServer {
  /** The Socket.IO server. */
  io: IOServer<ClientToServerEvents, ServerToClientEvents>;
  /** The underlying HTTP server (call `.listen(0)` for an ephemeral port). */
  http: HttpServer;
  /** The room registry (exposed for tests/inspection). */
  registry: RoomRegistry;
  /** Start listening on `port` (0 = ephemeral); resolves with the bound port. */
  listen: (port?: number) => Promise<number>;
  /** Close sockets + HTTP + clear all pending timers (no open-handle leaks). */
  close: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Per-room live game session
// ---------------------------------------------------------------------------

/** The live engine + scheduled timers for one playing room. */
interface GameSession {
  roomId: string;
  engine: GameEngine;
  /** Currently scheduled turn-timeout handle, if any. */
  turnTimer: TimerHandle | null;
  /** Per-seat grace-expiry timers keyed by seat index. */
  graceTimers: Map<number, TimerHandle>;
  /** Absolute turn deadline the current timer was scheduled for. */
  scheduledTurnDeadline: number;
}

/**
 * Create the SUBWAY game server. Attach handlers for every protocol event and
 * drive the engine with injected time.
 */
export function createGameServer(opts: GameServerOptions): GameServer {
  const now = opts.now ?? Date.now;
  const scheduler = opts.scheduler ?? realScheduler;
  const rngFor =
    opts.rngFor ??
    (() => () => Math.random());

  const http = opts.httpServer ?? createServer();
  const io = new IOServer<ClientToServerEvents, ServerToClientEvents>(http, {
    // CORS is opened for the local dev client; tighten in production.
    cors: { origin: '*' },
  });

  const registry = new RoomRegistry(opts.cfg, opts.registryRng ?? Math.random);
  const sessions = new Map<string, GameSession>();

  // --- Per-socket association ------------------------------------------------
  /** socket.id → { token, roomId } binding for cleanup on disconnect. */
  const bindings = new Map<string, { token: string; roomId: string }>();

  // -------------------------------------------------------------------------
  // Emit helpers
  // -------------------------------------------------------------------------

  const sendError = (socket: SocketT, payload: ErrorPayload): void => {
    socket.emit(ServerEvents.error, payload);
  };

  /** Build the full room snapshot, attaching live round/turn if playing. */
  const buildSnapshot = (room: Room): RoomSnapshot => {
    const snap = registry.snapshot(room);
    const session = sessions.get(room.roomId);
    if (session && room.phase === 'playing') {
      // Mirror live scores onto the snapshot players.
      for (const p of session.engine.players) {
        const target = snap.players[p.seatIdx];
        if (target) {
          target.score = p.score;
          target.status =
            p.status === 'active'
              ? snap.players[p.seatIdx]!.status
              : p.status === 'disconnected'
                ? 'disconnected'
                : 'spectating';
        }
      }
      snap.hostIdx = session.engine.hostIdx;
      snap.round = roundStartedPayload(session);
      if (session.engine.phase === 'round') snap.turn = turnStartedPayload(session);
    }
    return snap;
  };

  /** Broadcast `room:state` to everyone in the room. */
  const broadcastRoomState = (room: Room): void => {
    io.to(room.roomId).emit(ServerEvents.roomState, buildSnapshot(room));
  };

  /** Compose the current round:started payload from a session. */
  const roundStartedPayload = (session: GameSession): RoundStartedPayload => {
    const s = session.engine.state;
    return {
      round: s.round,
      startStation: s.currentStationId,
      startStationName: opts.index.byId(s.currentStationId).displayName,
      startLines: bitsOf(s.activeMask),
      firstPlayerIdx: s.startPlayerIdx,
      roundDeadline: s.roundDeadline,
    };
  };

  /** Compose the current turn:started payload from a session. */
  const turnStartedPayload = (session: GameSession): TurnStartedPayload => {
    const s = session.engine.state;
    return {
      playerIdx: session.engine.currentPlayerIdx,
      turnIndex: s.turnIndex,
      turnDeadline: s.turnDeadline,
    };
  };

  // -------------------------------------------------------------------------
  // Timer scheduling against engine deadlines
  // -------------------------------------------------------------------------

  /**
   * (Re)schedule the turn-timeout timer to fire at the engine's current absolute
   * `turnDeadline`. Clears any prior turn timer first. A rejection never calls
   * this (clocks unchanged); a valid submit + round/turn transitions do.
   */
  const scheduleTurnTimer = (session: GameSession): void => {
    clearTurnTimer(session);
    if (session.engine.phase !== 'round') return;
    const deadline = session.engine.state.turnDeadline;
    if (deadline <= 0) return;
    session.scheduledTurnDeadline = deadline;
    const delay = Math.max(0, deadline - now());
    session.turnTimer = scheduler.setTimeout(() => {
      session.turnTimer = null;
      onTurnTimeout(session);
    }, delay);
  };

  const clearTurnTimer = (session: GameSession): void => {
    if (session.turnTimer !== null) {
      scheduler.clearTimeout(session.turnTimer);
      session.turnTimer = null;
    }
  };

  /** Fire when the turn timer elapses: re-validate now(), then settle. */
  const onTurnTimeout = (session: GameSession): void => {
    if (session.engine.phase !== 'round') return;
    // Re-validate against the absolute deadline (setTimeout drift guard, §5/§10).
    if (now() < session.engine.state.turnDeadline) {
      // Fired early (clock rewound / drift) — reschedule for the remainder.
      scheduleTurnTimer(session);
      return;
    }
    const prevResultCount = session.engine.results.length;
    session.engine.onTurnTimeout();
    emitRoundTransition(session, prevResultCount);
  };

  /**
   * Schedule the grace-expiry timer for a disconnected seat at its absolute
   * `disconnectDeadline`.
   */
  const scheduleGraceTimer = (session: GameSession, seatIdx: number): void => {
    clearGraceTimer(session, seatIdx);
    const player = session.engine.players[seatIdx];
    if (!player || player.disconnectDeadline === null) return;
    const delay = Math.max(0, player.disconnectDeadline - now());
    const handle = scheduler.setTimeout(() => {
      session.graceTimers.delete(seatIdx);
      onGraceExpiry(session, seatIdx);
    }, delay);
    session.graceTimers.set(seatIdx, handle);
  };

  const clearGraceTimer = (session: GameSession, seatIdx: number): void => {
    const handle = session.graceTimers.get(seatIdx);
    if (handle !== undefined) {
      scheduler.clearTimeout(handle);
      session.graceTimers.delete(seatIdx);
    }
  };

  /** Fire when a disconnect grace elapses: expire → spectator, re-emit. */
  const onGraceExpiry = (session: GameSession, seatIdx: number): void => {
    const player = session.engine.players[seatIdx];
    if (!player || player.status !== 'disconnected') return;
    if (now() < (player.disconnectDeadline ?? 0)) {
      scheduleGraceTimer(session, seatIdx);
      return;
    }
    const prevResultCount = session.engine.results.length;
    const wasCurrentTurn = session.engine.currentPlayerIdx === seatIdx;
    session.engine.expireGrace(seatIdx);

    const room = registry.get(session.roomId);
    if (!room) return;

    if (session.engine.phase === 'ended') {
      emitGameEnded(session);
      return;
    }
    // If the spectator held the turn, the engine opened a fresh turn — re-emit.
    if (wasCurrentTurn && session.engine.phase === 'round') {
      // A grace expiry can itself end the round if it emptied the board; but the
      // engine only opens the next turn here, so emit turn + reschedule.
      if (session.engine.results.length > prevResultCount) {
        emitRoundTransition(session, prevResultCount);
      } else {
        io.to(session.roomId).emit(ServerEvents.turnStarted, turnStartedPayload(session));
        scheduleTurnTimer(session);
      }
    }
    broadcastRoomState(room);
  };

  // -------------------------------------------------------------------------
  // Round / game transition emitters
  // -------------------------------------------------------------------------

  /**
   * After an engine action that may have ended a round, emit `round:ended` for
   * each newly-recorded result, then either `round:started`+`turn:started` for
   * the next round or `game:ended` if the game is over.
   */
  const emitRoundTransition = (session: GameSession, prevResultCount: number): void => {
    const results = session.engine.results;
    for (let i = prevResultCount; i < results.length; i++) {
      const rr = results[i]!;
      const ended = session.engine.phase === 'ended';
      const payload: RoundEndedPayload = {
        type: rr.type,
        deltas: rr.deltas.map((d) => ({ seatIdx: d.seatIdx, delta: d.delta })),
      };
      if (rr.failerIdx !== null) payload.failerIdx = rr.failerIdx;
      if (!ended) {
        // The engine has already opened the next round; expose its start.
        payload.nextFirstPlayerIdx = session.engine.state.startPlayerIdx;
        payload.nextStartStation = session.engine.state.currentStationId;
      }
      io.to(session.roomId).emit(ServerEvents.roundEnded, payload);
    }

    if (session.engine.phase === 'ended') {
      emitGameEnded(session);
      return;
    }
    // Next round already open — emit its round:started + first turn:started.
    io.to(session.roomId).emit(ServerEvents.roundStarted, roundStartedPayload(session));
    io.to(session.roomId).emit(ServerEvents.turnStarted, turnStartedPayload(session));
    scheduleTurnTimer(session);
    const room = registry.get(session.roomId);
    if (room) broadcastRoomState(room);
  };

  /** Emit `game:ended` and tear down the session's timers. */
  const emitGameEnded = (session: GameSession): void => {
    const payload: GameEndedPayload = {
      ranking: session.engine.ranking.map((r) => ({
        seatIdx: r.seatIdx,
        id: r.id,
        nickname: r.nickname,
        score: r.score,
        rank: r.rank,
      })),
    };
    io.to(session.roomId).emit(ServerEvents.gameEnded, payload);
    registry.endGame(session.roomId);
    disposeSession(session);
    const room = registry.get(session.roomId);
    if (room) broadcastRoomState(room);
  };

  /** Clear all timers for a session and drop it from the map. */
  const disposeSession = (session: GameSession): void => {
    clearTurnTimer(session);
    for (const [seat] of session.graceTimers) clearGraceTimer(session, seat);
    sessions.delete(session.roomId);
  };

  // -------------------------------------------------------------------------
  // Connection + handlers
  // -------------------------------------------------------------------------

  io.on('connection', (socket: SocketT) => {
    // Issue a session token immediately (client persists + resends on reconnect).
    const token = socket.handshake.auth?.['token'] ?? randomUUID();
    socket.data.token = String(token);
    socket.emit(ServerEvents.session, { token: socket.data.token });

    // If this token matches an existing member, auto-rejoin + resync.
    tryAutoReconnect(socket);

    socket.on(ClientEvents.roomCreate, (p: RoomCreatePayload) => handleCreate(socket, p));
    socket.on(ClientEvents.roomJoin, (p: RoomJoinPayload) => handleJoin(socket, p));
    socket.on(ClientEvents.roomList, (p: RoomListPayload) => handleList(socket, p));
    socket.on(ClientEvents.playerReady, (p: PlayerReadyPayload) => handleReady(socket, p));
    socket.on(ClientEvents.hostUpdateSettings, (p: HostUpdateSettingsPayload) =>
      handleUpdateSettings(socket, p),
    );
    socket.on(ClientEvents.hostStart, () => handleStart(socket));
    socket.on(ClientEvents.turnSubmit, (p: TurnSubmitPayload) => handleSubmit(socket, p));
    socket.on('disconnect', () => handleDisconnect(socket));
  });

  /** Reconnect on connect if the handshake token maps to a known member. */
  function tryAutoReconnect(socket: SocketT): void {
    const found = registry.findByToken(socket.data.token);
    if (!found) return;
    const { room, member } = found;
    bindings.set(socket.id, { token: member.token, roomId: room.roomId });
    void socket.join(room.roomId);
    registry.setConnected(room.roomId, member.id, true);

    const session = sessions.get(room.roomId);
    if (session) {
      session.engine.reconnect(member.seatIdx);
      clearGraceTimer(session, member.seatIdx);
    }
    // Snapshot back to just this socket so it resyncs to current round/turn.
    socket.emit(ServerEvents.roomState, buildSnapshot(room));
    broadcastRoomState(room);
  }

  function handleCreate(socket: SocketT, p: RoomCreatePayload): void {
    const { room, member } = registry.create(
      { id: memberId(socket), token: socket.data.token, nickname: p.nickname },
      p.settings,
    );
    bindings.set(socket.id, { token: member.token, roomId: room.roomId });
    void socket.join(room.roomId);
    socket.emit(ServerEvents.roomState, buildSnapshot(room));
  }

  function handleJoin(socket: SocketT, p: RoomJoinPayload): void {
    const res = registry.join(
      { code: p.code, roomId: p.roomId },
      {
        id: memberId(socket),
        token: socket.data.token,
        nickname: p.nickname,
        password: p.password,
      },
    );
    if (!res.ok) {
      sendError(socket, { code: res.error, message: errorMessage(res.error) });
      return;
    }
    const { room } = res.value;
    bindings.set(socket.id, { token: socket.data.token, roomId: room.roomId });
    void socket.join(room.roomId);
    broadcastRoomState(room);
  }

  function handleList(socket: SocketT, p: RoomListPayload): void {
    socket.emit(ServerEvents.roomListResult, { rooms: registry.list(p?.filter ?? 'all') });
  }

  function handleReady(socket: SocketT, p: PlayerReadyPayload): void {
    const binding = bindings.get(socket.id);
    if (!binding) return sendError(socket, { code: 'notInRoom', message: errorMessage('notInRoom') });
    const res = registry.setReady(binding.roomId, socket.data.token, p.ready);
    if (!res.ok) return sendError(socket, { code: res.error, message: errorMessage(res.error) });
    broadcastRoomState(res.value);
  }

  function handleUpdateSettings(socket: SocketT, p: HostUpdateSettingsPayload): void {
    const binding = bindings.get(socket.id);
    if (!binding) return sendError(socket, { code: 'notInRoom', message: errorMessage('notInRoom') });
    const res = registry.updateSettings(binding.roomId, socket.data.token, p.settings);
    if (!res.ok) return sendError(socket, { code: res.error, message: errorMessage(res.error) });
    broadcastRoomState(res.value);
  }

  function handleStart(socket: SocketT): void {
    const binding = bindings.get(socket.id);
    if (!binding) return sendError(socket, { code: 'notInRoom', message: errorMessage('notInRoom') });
    const res = registry.startGame(binding.roomId, socket.data.token);
    if (!res.ok) return sendError(socket, { code: res.error, message: errorMessage(res.error) });
    const room = res.value;

    // Build engine players from the room roster (host flag mapped).
    const enginePlayers: EnginePlayerInit[] = room.members.map((m) => ({
      id: m.id,
      nickname: m.nickname,
      seatIdx: m.seatIdx,
      isHost: m.isHost,
    }));
    const engine = new GameEngine(enginePlayers, {
      index: opts.index,
      cfg: opts.cfg,
      region: room.settings.region,
      totalRounds: room.settings.rounds,
      now,
      rng: rngFor(room.roomId),
    });
    engine.start();
    const session: GameSession = {
      roomId: room.roomId,
      engine,
      turnTimer: null,
      graceTimers: new Map(),
      scheduledTurnDeadline: 0,
    };
    sessions.set(room.roomId, session);

    io.to(room.roomId).emit(ServerEvents.gameStarted, {
      round: engine.state.round,
      totalRounds: room.settings.rounds,
    });
    io.to(room.roomId).emit(ServerEvents.roundStarted, roundStartedPayload(session));
    io.to(room.roomId).emit(ServerEvents.turnStarted, turnStartedPayload(session));
    scheduleTurnTimer(session);
    broadcastRoomState(room);
  }

  function handleSubmit(socket: SocketT, p: TurnSubmitPayload): void {
    const binding = bindings.get(socket.id);
    if (!binding) return sendError(socket, { code: 'notInRoom', message: errorMessage('notInRoom') });
    const session = sessions.get(binding.roomId);
    if (!session) return sendError(socket, { code: 'invalid', message: 'game not running' });
    const found = registry.findByToken(socket.data.token);
    if (!found) return;
    const seatIdx = found.member.seatIdx;

    const prevResultCount = session.engine.results.length;
    const result = session.engine.submit(seatIdx, p.text);

    if (!result.ok) {
      // Rejection: NO clock/state change — do NOT touch the turn timer.
      socket.emit(ServerEvents.turnRejected, { reason: result.reason });
      return;
    }

    io.to(session.roomId).emit(ServerEvents.turnAccepted, {
      station: result.station,
      stationName: opts.index.byId(result.station).displayName,
      transfer: result.transfer,
      newLine: result.newLine,
      scoreDelta: result.scoreDelta,
      byPlayerIdx: result.byPlayerIdx,
    });

    // A valid submit may have completed the round (round-gate at next startTurn).
    if (session.engine.results.length > prevResultCount) {
      emitRoundTransition(session, prevResultCount);
      return;
    }
    // Normal path: engine opened the next turn — emit it + reschedule.
    io.to(session.roomId).emit(ServerEvents.turnStarted, turnStartedPayload(session));
    scheduleTurnTimer(session);
  }

  function handleDisconnect(socket: SocketT): void {
    const binding = bindings.get(socket.id);
    bindings.delete(socket.id);
    if (!binding) return;
    const room = registry.get(binding.roomId);
    if (!room) return;
    const member = room.members.find((m) => m.token === binding.token);
    if (!member) return;

    registry.setConnected(room.roomId, member.id, false);
    const session = sessions.get(room.roomId);

    if (session && room.phase === 'playing') {
      // In-game: start the engine's grace window + schedule its expiry.
      session.engine.markDisconnected(member.seatIdx);
      scheduleGraceTimer(session, member.seatIdx);
      broadcastRoomState(room);
      return;
    }

    // Lobby: remove the member outright (host handover / disposal handled).
    const left = registry.leave(room.roomId, member.id);
    if (!left || left.disposed) return;
    broadcastRoomState(left.room);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  const listen = (port = 0): Promise<number> =>
    new Promise((resolve, reject) => {
      http.once('error', reject);
      http.listen(port, () => {
        const addr = http.address();
        if (addr && typeof addr === 'object') resolve(addr.port);
        else reject(new Error('createGameServer: no bound port'));
      });
    });

  const close = (): Promise<void> =>
    new Promise((resolve) => {
      for (const session of sessions.values()) disposeSession(session);
      // io.close() closes all sockets and the attached HTTP server.
      io.close(() => resolve());
    });

  return { io, http, registry, listen, close };
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** Typed socket alias with our data payload. */
interface SocketData {
  token: string;
}
type SocketT = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** A member id derived from the session token (stable across reconnects). */
function memberId(socket: SocketT): string {
  return socket.data.token;
}

/** Enumerate set bit positions of a bitmask (non-negative). */
function bitsOf(mask: bigint): number[] {
  const out: number[] = [];
  let m = mask;
  let bit = 0;
  while (m > 0n) {
    if ((m & 1n) === 1n) out.push(bit);
    m >>= 1n;
    bit += 1;
  }
  return out;
}

/** Human-readable message for an error code. */
function errorMessage(code: ErrorPayload['code']): string {
  switch (code) {
    case 'roomNotFound':
      return 'room not found';
    case 'badPassword':
      return 'incorrect password';
    case 'roomFull':
      return 'room is full';
    case 'notHost':
      return 'only the host may do that';
    case 'notEnoughPlayers':
      return 'need at least 2 players to start';
    case 'alreadyStarted':
      return 'the game has already started';
    case 'notInRoom':
      return 'you are not in a room';
    case 'invalid':
      return 'invalid request';
  }
}

// Re-export commonly used shared types for convenience of downstream (M5) code.
export type { Settings };
