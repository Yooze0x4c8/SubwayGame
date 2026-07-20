/**
 * End-to-end transport tests for SUBWAY (plan §9 e2e + §4).
 *
 * REAL Socket.IO over an ephemeral port; only TIME is faked. A controllable
 * {@link FakeClock} + {@link FakeScheduler} let turn-timeout and grace-expiry
 * fire on command — NO real sleeps. The engine's `now`/`rng` come from this same
 * clock + a seeded rng, so the drawn start station is known and reproducible.
 *
 * Every test closes its client sockets and the server (no open-handle leaks).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';

import { loadBalance, judge, ServerEvents, ClientEvents } from '@subway/shared';
import type {
  BalanceConfig,
  StationIndex,
  RoomSnapshot,
  RoundStartedPayload,
  TurnStartedPayload,
  TurnAcceptedPayload,
  TurnRejectedPayload,
  RoundEndedPayload,
  GameEndedPayload,
  SessionPayload,
  RoomListResultPayload,
  LineTier,
} from '@subway/shared';

import { loadStationIndex } from '../data/loader.js';
import { createGameServer, type Scheduler, type GameServer } from './socket.js';

const cfg: BalanceConfig = loadBalance();
const index: StationIndex = loadStationIndex();

// --- Seeded PRNG (mulberry32) — deterministic engine draws --------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Fake clock + scheduler ---------------------------------------------------
/** Advancing the clock fires any scheduler timer whose deadline has elapsed. */
class FakeClock {
  private t: number;
  constructor(start = 1_000_000) {
    this.t = start;
  }
  now = (): number => this.t;
  set(v: number): void {
    this.t = v;
  }
  advance(dt: number): void {
    this.t += dt;
  }
}

interface FakeTimer {
  id: number;
  fireAt: number;
  fn: () => void;
}

/**
 * A scheduler backed by {@link FakeClock}: timers are stored with an absolute
 * fire time (now + delay) and fired by {@link runDue} once the clock passes them.
 * Nothing fires on its own — tests advance the clock then flush.
 */
class FakeScheduler implements Scheduler {
  private seq = 0;
  private timers = new Map<number, FakeTimer>();
  constructor(private readonly clock: FakeClock) {}

  setTimeout = (fn: () => void, delayMs: number): number => {
    const id = ++this.seq;
    this.timers.set(id, { id, fireAt: this.clock.now() + delayMs, fn });
    return id;
  };

  clearTimeout = (handle: unknown): void => {
    if (typeof handle === 'number') this.timers.delete(handle);
  };

  /** Fire every timer whose fireAt <= now, in fire-time order. Re-runs until stable. */
  runDue(): void {
    for (;;) {
      const due = [...this.timers.values()]
        .filter((t) => t.fireAt <= this.clock.now())
        .sort((a, b) => a.fireAt - b.fireAt);
      if (due.length === 0) return;
      for (const t of due) {
        this.timers.delete(t.id);
        t.fn();
      }
    }
  }

  /** Advance the clock and fire all now-due timers. */
  advanceAndRun(dt: number): void {
    this.clock.advance(dt);
    this.runDue();
  }

  get pending(): number {
    return this.timers.size;
  }
}

// --- Test harness -------------------------------------------------------------
interface Harness {
  server: GameServer;
  clock: FakeClock;
  sched: FakeScheduler;
  port: number;
  clients: ClientSocket[];
}

let h: Harness;

async function startHarness(): Promise<Harness> {
  const clock = new FakeClock();
  const sched = new FakeScheduler(clock);
  const server = createGameServer({
    index,
    cfg,
    now: clock.now,
    scheduler: sched,
    // Fixed seed per room → known start station for the valid-submit test.
    rngFor: () => mulberry32(777),
    registryRng: mulberry32(4242),
  });
  const port = await server.listen(0);
  return { server, clock, sched, port, clients: [] };
}

/** Connect a client, optionally with a session token for reconnect. */
function connect(token?: string): ClientSocket {
  const socket = ioClient(`http://127.0.0.1:${h.port}`, {
    transports: ['websocket'],
    forceNew: true,
    auth: token ? { token } : {},
  });
  h.clients.push(socket);
  return socket;
}

/** Await the next occurrence of an event on a socket. */
function once<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, (p: T) => resolve(p)));
}

beforeEach(async () => {
  h = await startHarness();
});

afterEach(async () => {
  for (const c of h.clients) c.disconnect();
  await h.server.close();
});

// -----------------------------------------------------------------------------
// Helpers to build a started 2-player game and pick a valid answer.
// -----------------------------------------------------------------------------

/**
 * Scan the region for a station name the given board state accepts.
 * `startStation` + `startLines` come from the round:started payload.
 */
function findValidAnswerFor(
  region: string,
  currentStationIdx: number,
  activeMask: bigint,
  used: Set<number>,
): string | null {
  for (const rec of index.records) {
    if (rec.region !== region) continue;
    const res = judge({
      index,
      currentIdx: currentStationIdx,
      activeMask,
      used,
      text: rec.name,
    });
    if (res.valid) return rec.name;
  }
  return null;
}

function maskFromBits(bits: number[]): bigint {
  let m = 0n;
  for (const b of bits) m |= 1n << BigInt(b);
  return m;
}

/** Create + join + ready + start a 2-player capital game. Returns the sockets +
 *  the round/turn payloads observed by the host. */
async function startTwoPlayerGame(tierFilter?: LineTier[], rounds = 3): Promise<{
  hostSock: ClientSocket;
  guestSock: ClientSocket;
  round: RoundStartedPayload;
  turn: TurnStartedPayload;
}> {
  const hostSock = connect();
  await once<SessionPayload>(hostSock, ServerEvents.session);
  const guestSock = connect();
  await once<SessionPayload>(guestSock, ServerEvents.session);

  const created = once<RoomSnapshot>(hostSock, ServerEvents.roomState);
  hostSock.emit(ClientEvents.roomCreate, {
    nickname: 'Host',
    settings: { region: 'capital', rounds, ...(tierFilter ? { tierFilter } : {}) },
  });
  const snap = await created;

  const joined = once<RoomSnapshot>(guestSock, ServerEvents.roomState);
  guestSock.emit(ClientEvents.roomJoin, { code: snap.code, nickname: 'Guest' });
  await joined;

  hostSock.emit(ClientEvents.playerReady, { ready: true });
  guestSock.emit(ClientEvents.playerReady, { ready: true });

  const roundP = once<RoundStartedPayload>(hostSock, ServerEvents.roundStarted);
  const turnP = once<TurnStartedPayload>(hostSock, ServerEvents.turnStarted);
  hostSock.emit(ClientEvents.hostStart);
  const round = await roundP;
  const turn = await turnP;
  return { hostSock, guestSock, round, turn };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('socket e2e — full lifecycle + valid submit', () => {
  it('passes the room tier filter through to the starting-line draw', async () => {
    const { round } = await startTwoPlayerGame(['hardcore']);
    expect(round.startLines).toHaveLength(1);
    expect(index.lineTierByBit.get(round.startLines[0]!)).toBe('hardcore');
  });

  it('create → join → ready → start → round/turn → valid submit → accepted', async () => {
    const { hostSock, guestSock, round, turn } = await startTwoPlayerGame();

    expect(round.round).toBe(1);
    expect(round.startStation).toBeGreaterThanOrEqual(0);
    expect(round.startLines.length).toBeGreaterThan(0);
    expect(turn.playerIdx).toBe(round.firstPlayerIdx);
    expect(turn.turnDeadline).toBeGreaterThan(h.clock.now());

    // The first player answers. Determine which socket owns firstPlayerIdx:
    // host is seat 0, guest seat 1.
    const firstSock = turn.playerIdx === 0 ? hostSock : guestSock;
    const activeMask = maskFromBits(round.startLines);
    const used = new Set<number>([round.startStation]);
    const answer = findValidAnswerFor('capital', round.startStation, activeMask, used);
    expect(answer).not.toBeNull();

    const acceptedP = once<TurnAcceptedPayload>(guestSock, ServerEvents.turnAccepted);
    firstSock.emit(ClientEvents.turnSubmit, { text: answer! });
    const accepted = await acceptedP;

    expect(accepted.byPlayerIdx).toBe(turn.playerIdx);
    expect(accepted.scoreDelta).toBeGreaterThan(0);
    expect(accepted.station).toBeGreaterThanOrEqual(0);
    // The board advanced to the answered station.
    expect(accepted.stationName.length).toBeGreaterThan(0);
  });

  it('advances the turn to the next player after a valid submit', async () => {
    const { hostSock, guestSock, round, turn } = await startTwoPlayerGame();
    const firstSock = turn.playerIdx === 0 ? hostSock : guestSock;
    const activeMask = maskFromBits(round.startLines);
    const used = new Set<number>([round.startStation]);
    const answer = findValidAnswerFor('capital', round.startStation, activeMask, used)!;

    // Wait for the turn:started whose turnIndex advanced past the current one
    // (ignore any late re-delivery of the initial turn).
    const nextTurn = await new Promise<TurnStartedPayload>((resolve) => {
      const onTurn = (p: TurnStartedPayload): void => {
        if (p.turnIndex === turn.turnIndex + 1) {
          guestSock.off(ServerEvents.turnStarted, onTurn);
          resolve(p);
        }
      };
      guestSock.on(ServerEvents.turnStarted, onTurn);
      firstSock.emit(ClientEvents.turnSubmit, { text: answer });
    });
    expect(nextTurn.playerIdx).not.toBe(turn.playerIdx);
    expect(nextTurn.turnIndex).toBe(turn.turnIndex + 1);
  });
});

describe('socket e2e — invalid submit', () => {
  it('turn:rejected with reason and NO clock change', async () => {
    const { hostSock, guestSock, turn } = await startTwoPlayerGame();
    const firstSock = turn.playerIdx === 0 ? hostSock : guestSock;
    const deadlineBefore = turn.turnDeadline;

    const rejectedP = once<TurnRejectedPayload>(firstSock, ServerEvents.turnRejected);
    firstSock.emit(ClientEvents.turnSubmit, { text: '존재하지않는역이름zzz' });
    const rejected = await rejectedP;
    expect(rejected.reason).toBe('notFound');

    // Reconnect-fetch the snapshot: the turn deadline must be UNCHANGED (rejection
    // never touches clocks). Query room:state by re-emitting player:ready (no-op
    // that broadcasts current state).
    const stateP = once<RoomSnapshot>(firstSock, ServerEvents.roomState);
    firstSock.emit(ClientEvents.playerReady, { ready: true });
    const state = await stateP;
    expect(state.turn).toBeDefined();
    expect(state.turn!.turnDeadline).toBe(deadlineBefore);
    expect(state.turn!.playerIdx).toBe(turn.playerIdx);
  });
});

describe('socket e2e — turn timeout via fake scheduler', () => {
  it('firing the turn timer → round:ended {type:suddendeath} with deltas', async () => {
    const { hostSock, turn } = await startTwoPlayerGame();

    const endedP = once<RoundEndedPayload>(hostSock, ServerEvents.roundEnded);
    // Advance the fake clock past the turn deadline and flush the scheduler.
    const dt = turn.turnDeadline - h.clock.now() + 1;
    h.sched.advanceAndRun(dt);
    const ended = await endedP;

    expect(ended.type).toBe('suddendeath');
    expect(ended.failerIdx).toBe(turn.playerIdx);
    expect(ended.deltas.length).toBeGreaterThan(0);
    // The failer received a negative delta.
    const failerDelta = ended.deltas.find((d) => d.seatIdx === turn.playerIdx);
    expect(failerDelta).toBeDefined();
    expect(failerDelta!.delta).toBeLessThan(0);
  });

  it('returns an ended room to waiting after 30 seconds', async () => {
    const { hostSock, turn } = await startTwoPlayerGame(undefined, 1);

    const gameEndedP = once<GameEndedPayload>(hostSock, ServerEvents.gameEnded);
    h.sched.advanceAndRun(turn.turnDeadline - h.clock.now() + 1);
    const gameEnded = await gameEndedP;
    expect(gameEnded.roundRoutes).toHaveLength(1);
    expect(gameEnded.roundRoutes[0]!.round).toBe(1);
    expect(gameEnded.roundRoutes[0]!.stops).toHaveLength(1);
    expect(gameEnded.roundRoutes[0]!.stops[0]!.stationName.length).toBeGreaterThan(0);
    expect(h.server.registry.all()[0]!.phase).toBe('ended');

    const waitingP = new Promise<RoomSnapshot>((resolve) => {
      const onState = (snapshot: RoomSnapshot): void => {
        if (snapshot.phase !== 'waiting') return;
        hostSock.off(ServerEvents.roomState, onState);
        resolve(snapshot);
      };
      hostSock.on(ServerEvents.roomState, onState);
    });
    h.sched.advanceAndRun(30_000);

    const waiting = await waitingP;
    expect(waiting.phase).toBe('waiting');
    expect(waiting.players.every((player) => player.ready === false)).toBe(true);
    expect(h.server.registry.all()[0]!.phase).toBe('waiting');
  });
});

describe('socket e2e — reconnect snapshot', () => {
  it('client reconnects with token → receives room:state reflecting round/turn/scores', async () => {
    const { guestSock, round, turn } = await startTwoPlayerGame();

    // Capture the guest's session token.
    // (Session was emitted on connect; re-read via a fresh listener before drop.)
    const guestToken = await new Promise<string>((resolve) => {
      // guestSock already received its session; ask the server again by
      // reconnecting is circular — instead grab it from the registry.
      const room = h.server.registry.all()[0]!;
      const guest = room.members.find((m) => m.seatIdx === 1)!;
      resolve(guest.token);
    });

    // Guest disconnects mid-game.
    guestSock.disconnect();
    // Give the server a tick to process the disconnect.
    await new Promise((r) => setImmediate(r));

    // Reconnect with the same token.
    const rejoin = connect(guestToken);
    const snap = await once<RoomSnapshot>(rejoin, ServerEvents.roomState);

    expect(snap.phase).toBe('playing');
    expect(snap.round).toBeDefined();
    expect(snap.round!.round).toBe(round.round);
    expect(snap.turn).toBeDefined();
    expect(snap.turn!.playerIdx).toBe(turn.playerIdx);
    // Scores are mirrored (0 at this point since no answer yet).
    expect(snap.players.length).toBe(2);
    expect(snap.players[1]!.seatIdx).toBe(1);
  });
});

describe('socket e2e — room:list', () => {
  it('returns the public room with correct filter behavior', async () => {
    const hostSock = connect();
    await once<SessionPayload>(hostSock, ServerEvents.session);
    const created = once<RoomSnapshot>(hostSock, ServerEvents.roomState);
    hostSock.emit(ClientEvents.roomCreate, {
      nickname: 'Host',
      settings: { isPublic: true, tierFilter: ['intro'] },
    });
    await created;

    const lister = connect();
    await once<SessionPayload>(lister, ServerEvents.session);

    const allP = once<RoomListResultPayload>(lister, ServerEvents.roomListResult);
    lister.emit(ClientEvents.roomList, { filter: 'all' });
    const all = await allP;
    expect(all.rooms.length).toBe(1);
    expect(all.rooms[0]!.tierFilter).toEqual(['intro']);

    const introP = once<RoomListResultPayload>(lister, ServerEvents.roomListResult);
    lister.emit(ClientEvents.roomList, { filter: 'intro' });
    const intro = await introP;
    expect(intro.rooms.length).toBe(1);

    const normalP = once<RoomListResultPayload>(lister, ServerEvents.roomListResult);
    lister.emit(ClientEvents.roomList, { filter: 'normal' });
    const normal = await normalP;
    expect(normal.rooms.length).toBe(0);
  });
});
