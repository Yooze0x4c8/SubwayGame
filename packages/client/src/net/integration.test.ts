/**
 * Headless client-integration test (M5 acceptance evidence).
 *
 * Boots a REAL {@link createGameServer} on an ephemeral port with a seeded rng +
 * injectable fake clock/scheduler (same determinism seam as the server e2e), then
 * drives the CLIENT store/socket layer (createSocketClient + bindSocketToStore)
 * — NOT a browser — through the full flow:
 *
 *   create → join → both ready → host start → round/turn → valid submit
 *
 * and asserts the STORE reflects `turn:accepted` (route grew, score pop fired,
 * player score increased) and the turn advanced. This proves the client wiring
 * is correct end-to-end with no browser and no real sleeps.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';

import { loadBalance, judge } from '@subway/shared';
import type { BalanceConfig, StationIndex } from '@subway/shared';

// Server source is imported directly (cross-package .ts, resolved by Vite/esbuild).
import { loadStationIndex } from '../../../server/src/data/loader.js';
import {
  createGameServer,
  type Scheduler,
  type GameServer,
} from '../../../server/src/net/socket.js';

import { createSocketClient, type SocketClient } from './socket.js';
import {
  bindSocketToStore,
  createGameStore,
  type GameStore,
} from '../state/gameStore.js';

const cfg: BalanceConfig = loadBalance();
const index: StationIndex = loadStationIndex();

// --- Seeded PRNG (mulberry32) — matches the server e2e for a known draw. ------
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

// --- Fake clock + scheduler (deterministic; no real sleeps) -------------------
class FakeClock {
  private t: number;
  constructor(start = 1_000_000) {
    this.t = start;
  }
  now = (): number => this.t;
  advance(dt: number): void {
    this.t += dt;
  }
}

interface FakeTimer {
  id: number;
  fireAt: number;
  fn: () => void;
}

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
}

// --- Helpers ------------------------------------------------------------------
function maskFromBits(bits: number[]): bigint {
  let m = 0n;
  for (const b of bits) m |= 1n << BigInt(b);
  return m;
}

/** Scan the region for a station name the current board accepts. */
function findValidAnswerFor(
  region: string,
  currentStationIdx: number,
  activeMask: bigint,
  used: Set<number>,
): string | null {
  for (const rec of index.records) {
    if (rec.region !== region) continue;
    const res = judge({ index, currentIdx: currentStationIdx, activeMask, used, text: rec.name });
    if (res.valid) return rec.name;
  }
  return null;
}

/** Await a store update where `pred(state)` holds. Resolves immediately if true now. */
function waitForStore(
  store: StoreApi<GameStore>,
  pred: (s: GameStore) => boolean,
  timeoutMs = 4000,
): Promise<GameStore> {
  return new Promise((resolve, reject) => {
    if (pred(store.getState())) return resolve(store.getState());
    const timer = setTimeout(() => {
      unsub();
      reject(new Error('waitForStore: timed out'));
    }, timeoutMs);
    const unsub = store.subscribe((s) => {
      if (pred(s)) {
        clearTimeout(timer);
        unsub();
        resolve(s);
      }
    });
  });
}

// --- Harness ------------------------------------------------------------------
interface Harness {
  server: GameServer;
  clock: FakeClock;
  port: number;
  clients: SocketClient[];
}

let h: Harness;

async function startServer(): Promise<Harness> {
  const clock = new FakeClock();
  const sched = new FakeScheduler(clock);
  const server = createGameServer({
    index,
    cfg,
    now: clock.now,
    scheduler: sched,
    rngFor: () => mulberry32(777),
    registryRng: mulberry32(4242),
  });
  const port = await server.listen(0);
  return { server, clock, port, clients: [] };
}

/** Create a bound client (socket + store) pointed at the ephemeral server. */
function makeClient(nickname: string, token?: string): {
  client: SocketClient;
  store: StoreApi<GameStore>;
  unbind: () => void;
} {
  const store = createGameStore();
  store.getState().setMyNickname(nickname);
  const client = createSocketClient({
    url: `http://127.0.0.1:${h.port}`,
    tokenStore: { read: () => token, write: () => {} },
    ioOptions: { transports: ['websocket'], forceNew: true },
  });
  const unbind = bindSocketToStore(client, store);
  client.connect();
  h.clients.push(client);
  return { client, store, unbind };
}

beforeEach(async () => {
  h = await startServer();
});

afterEach(async () => {
  for (const c of h.clients) c.disconnect();
  await h.server.close();
});

describe('client integration — store/socket end-to-end (headless)', () => {
  it('create → join → ready → start → valid submit reflects in the client store', async () => {
    const host = makeClient('Host');
    const guest = makeClient('Guest');

    // Host creates a capital game; wait until the store holds the room.
    host.client.createRoom('Host', { region: 'capital', rounds: 3 });
    const hostRoom = await waitForStore(host.store, (s) => s.room !== undefined);
    const code = hostRoom.room!.code;
    expect(code.length).toBeGreaterThan(0);

    // Guest joins by code; wait until the host store sees 2 players.
    guest.client.joinRoom({ code, nickname: 'Guest' });
    await waitForStore(host.store, (s) => (s.room?.players.length ?? 0) === 2);
    await waitForStore(guest.store, (s) => (s.room?.players.length ?? 0) === 2);

    // Both ready.
    host.client.setReady(true);
    guest.client.setReady(true);

    // Host starts; both stores should transition to in-game with a live turn.
    host.client.startGame();
    const started = await waitForStore(
      host.store,
      (s) => s.phase === 'in-game' && s.turn !== undefined && s.round !== undefined,
    );
    await waitForStore(guest.store, (s) => s.phase === 'in-game' && s.turn !== undefined);

    const round = started.round!;
    const turn = started.turn!;
    expect(round.round).toBe(1);
    expect(round.startLines.length).toBeGreaterThan(0);
    // Route seeded with the start station.
    expect(started.route.length).toBe(1);
    expect(started.route[0]!.station).toBe(round.startStation);
    expect(started.route[0]!.name).toBe(round.startStationName);

    // The first player answers with a REAL valid next station (via the judge).
    const firstIsHost = turn.playerIdx === 0;
    const firstStore = firstIsHost ? host.store : guest.store;
    const firstClient = firstIsHost ? host.client : guest.client;
    const observerStore = firstIsHost ? guest.store : host.store;

    const activeMask = maskFromBits(round.startLines);
    const used = new Set<number>([round.startStation]);
    const answer = findValidAnswerFor('capital', round.startStation, activeMask, used);
    expect(answer).not.toBeNull();

    const routeBefore = firstStore.getState().route.length;
    firstClient.submitTurn(answer!);

    // The store that submitted must reflect turn:accepted: route grew + score pop.
    const afterAccept = await waitForStore(
      firstStore,
      (s) => s.route.length === routeBefore + 1 && s.scorePop !== undefined,
    );
    expect(afterAccept.scorePop!.delta).toBeGreaterThan(0);
    expect(afterAccept.scorePop!.seatIdx).toBe(turn.playerIdx);
    const newStop = afterAccept.route[afterAccept.route.length - 1]!;
    expect(newStop.byPlayerIdx).toBe(turn.playerIdx);
    expect(newStop.name.length).toBeGreaterThan(0);

    // The answering player's score increased in the mirrored snapshot.
    await waitForStore(
      firstStore,
      (s) => (s.room?.players[turn.playerIdx]?.score ?? 0) > 0,
    );

    // The turn advanced to the next player (turnIndex incremented).
    const advanced = await waitForStore(
      observerStore,
      (s) => (s.turn?.turnIndex ?? -1) === turn.turnIndex + 1,
    );
    expect(advanced.turn!.playerIdx).not.toBe(turn.playerIdx);

    host.unbind();
    guest.unbind();
  });

  it('rejects an invalid answer without changing the route or clocks', async () => {
    const host = makeClient('Host');
    const guest = makeClient('Guest');

    host.client.createRoom('Host', { region: 'capital', rounds: 3 });
    const hostRoom = await waitForStore(host.store, (s) => s.room !== undefined);
    guest.client.joinRoom({ code: hostRoom.room!.code, nickname: 'Guest' });
    await waitForStore(host.store, (s) => (s.room?.players.length ?? 0) === 2);
    host.client.setReady(true);
    guest.client.setReady(true);
    host.client.startGame();
    const started = await waitForStore(
      host.store,
      (s) => s.phase === 'in-game' && s.turn !== undefined,
    );
    const turn = started.turn!;
    const firstIsHost = turn.playerIdx === 0;
    const firstStore = firstIsHost ? host.store : guest.store;
    const firstClient = firstIsHost ? host.client : guest.client;

    const routeBefore = firstStore.getState().route.length;
    const deadlineBefore = firstStore.getState().turn!.turnDeadline;

    firstClient.submitTurn('존재하지않는역이름zzz');
    const rejected = await waitForStore(firstStore, (s) => s.rejection !== undefined);
    expect(rejected.rejection!.reason).toBe('notFound');
    // Route unchanged, turn deadline unchanged (rejection never touches clocks).
    expect(firstStore.getState().route.length).toBe(routeBefore);
    expect(firstStore.getState().turn!.turnDeadline).toBe(deadlineBefore);

    host.unbind();
    guest.unbind();
  });
});
