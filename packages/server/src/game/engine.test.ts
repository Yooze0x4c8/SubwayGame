/**
 * Deterministic integration tests for the SUBWAY game engine (plan §8 game-flow,
 * §9 integration). Every test injects a mutable fake clock and a seeded rng, so
 * runs are fully reproducible — no `Date.now()`, no `Math.random()`, no real
 * timers.
 */

import { describe, it, expect } from 'vitest';

import { loadBalance, judge, answerScore, deduction } from '@subway/shared';
import type { BalanceConfig, LineTier, StationIndex } from '@subway/shared';

import { loadStationIndex } from '../data/loader.js';
import { GameEngine } from './engine.js';
import type { EngineDeps } from './engine.js';
import type { EnginePlayerInit } from './GameState.js';

// The engine reads nation-wide data and region-scopes internally.
const index: StationIndex = loadStationIndex();

// --- Seeded PRNG (mulberry32) — deterministic, no Math.random -----------------
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

// --- Fake clock ---------------------------------------------------------------
interface Clock {
  now: () => number;
  set: (t: number) => void;
  advance: (dt: number) => void;
}
function makeClock(start = 1_000_000): Clock {
  let t = start;
  return {
    now: () => t,
    set: (v) => {
      t = v;
    },
    advance: (dt) => {
      t += dt;
    },
  };
}

const cfg: BalanceConfig = loadBalance();

function players(n: number): EnginePlayerInit[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    nickname: `P${i}`,
    seatIdx: i,
  }));
}

function makeEngine(opts: {
  n?: number;
  region?: string;
  totalRounds?: number;
  tierFilter?: LineTier[];
  clock: Clock;
  seed?: number;
  rng?: () => number;
}): GameEngine {
  const deps: EngineDeps = {
    index,
    cfg,
    region: opts.region ?? 'capital',
    tierFilter: opts.tierFilter ?? ['intro', 'normal', 'hardcore'],
    totalRounds: opts.totalRounds ?? 3,
    now: opts.clock.now,
    rng: opts.rng ?? mulberry32(opts.seed ?? 12345),
  };
  return new GameEngine(players(opts.n ?? 3), deps);
}

/**
 * Scan the region for a station the CURRENT engine state would accept, matching
 * the requested kind. Returns the raw text to submit plus the resolved judgment.
 */
function findValidAnswer(
  engine: GameEngine,
  kind: 'any' | 'straight' | 'transferNewLine',
): { text: string; stationIdx: number; transfer: boolean; newActiveMask: bigint } | null {
  const s = engine.state;
  for (const rec of index.records) {
    if (rec.region !== 'capital') continue;
    const res = judge({
      index,
      currentIdx: s.currentStationId,
      activeMask: s.activeMask,
      used: s.used,
      text: rec.name,
    });
    if (!res.valid) continue;
    const transfer = res.transfer === true;
    const newLine = (res.newActiveMask! & ~s.usedLineMask) !== 0n;
    if (kind === 'straight' && transfer) continue;
    if (kind === 'transferNewLine' && !(transfer && newLine)) continue;
    return {
      text: rec.name,
      stationIdx: res.stationIdx!,
      transfer,
      newActiveMask: res.newActiveMask!,
    };
  }
  return null;
}

describe('GameEngine — construction & start draw', () => {
  it('draws a transfer start station on a region startable line', () => {
    const clock = makeClock();
    const engine = makeEngine({ clock });
    engine.start();
    const s = engine.state;
    const rec = index.byId(s.currentStationId);
    expect(rec.isTransfer).toBe(true);
    expect(rec.region).toBe('capital');
    // Active/used line bit belongs to the drawn start line and is startable.
    expect(s.activeMask).toBe(s.usedLineMask);
    expect((rec.startableLines & s.activeMask)).not.toBe(0n);
  });

  it('is deterministic: same seed + clock → identical start station', () => {
    const a = makeEngine({ clock: makeClock(), seed: 999 });
    const b = makeEngine({ clock: makeClock(), seed: 999 });
    a.start();
    b.start();
    expect(a.state.currentStationId).toBe(b.state.currentStationId);
    expect(a.state.activeMask).toBe(b.state.activeMask);
  });

  it.each<LineTier>(['intro', 'normal', 'hardcore'])(
    'draws the starting line and station from the %s tier',
    (tier) => {
      const engine = makeEngine({ clock: makeClock(), tierFilter: [tier], rng: () => 0 });
      engine.start();

      const { activeMask, currentStationId } = engine.state;
      const activeBit = [...index.lineTierByBit.keys()].find(
        (bit) => (activeMask & (1n << BigInt(bit))) !== 0n,
      );
      expect(activeBit).toBeDefined();
      expect(index.lineTierByBit.get(activeBit!)).toBe(tier);
      expect(index.byId(currentStationId).lineMask & activeMask).not.toBe(0n);
    },
  );

  it('falls back to short tier lines when none meet the startable threshold', () => {
    const engine = makeEngine({ clock: makeClock(), tierFilter: ['hardcore'], rng: () => 0 });
    engine.start();

    const state = engine.state;
    const start = index.byId(state.currentStationId);
    expect(start.isTransfer).toBe(true);
    expect(start.startableLines & state.activeMask).toBe(0n);
  });
});

describe('GameEngine — two clocks (round gate vs full turn)', () => {
  it('a turn opened just before roundDeadline still gets its FULL turn limit', () => {
    const clock = makeClock();
    const engine = makeEngine({ clock });
    engine.start();
    const s = engine.state;
    // Jump to 1ms before the round deadline, then re-open a turn via a valid move.
    const ans = findValidAnswer(engine, 'any');
    expect(ans).not.toBeNull();
    clock.set(s.roundDeadline - 1);
    const res = engine.submit(engine.currentPlayerIdx, ans!.text);
    expect(res.ok).toBe(true);
    // The freshly opened turn's deadline exceeds the round deadline (full turn).
    expect(engine.state.turnDeadline).toBeGreaterThan(engine.state.roundDeadline);
    expect(engine.state.turnLimitMs).toBeGreaterThan(0);
  });

  it('startTurn when now >= roundDeadline triggers 완주 종료 (complete, no failer)', () => {
    const clock = makeClock();
    const engine = makeEngine({ clock });
    engine.start();
    // Advance past the round deadline, then submit a valid answer: the NEXT
    // startTurn sees now>=roundDeadline and finishes the round by completion.
    const ans = findValidAnswer(engine, 'any');
    clock.set(engine.state.roundDeadline + 5);
    const res = engine.submit(engine.currentPlayerIdx, ans!.text);
    expect(res.ok).toBe(true);
    const rr = engine.results.at(-1)!;
    expect(rr.type).toBe('complete');
    expect(rr.failerIdx).toBeNull();
    expect(rr.route[0]).toBeDefined();
    expect(rr.route.at(-1)).toBe(res.ok ? res.station : -1);
    // No deductions or bonuses were recorded on a completion.
    expect(rr.deltas.length).toBe(0);
  });
});

describe('GameEngine — sudden-death settlement', () => {
  it('failer −D, last answerer +finisherBonus, others +othersBonus', () => {
    const clock = makeClock();
    const engine = makeEngine({ n: 3, clock });
    engine.start();

    // Play one valid answer so lastAnswererIdx is set to player 0.
    const ans = findValidAnswer(engine, 'any');
    const leader = engine.currentPlayerIdx;
    const r = engine.submit(leader, ans!.text);
    expect(r.ok).toBe(true);
    const leaderScoreAfterAnswer = engine.players[leader]!.score;

    // Now the next player times out.
    const failer = engine.currentPlayerIdx;
    expect(failer).not.toBe(leader);
    const s = engine.state;
    const roundRemainingSec = Math.max(0, s.roundDeadline - clock.now()) / 1000;
    const D = deduction(roundRemainingSec, cfg);

    engine.onTurnTimeout();

    const rr = engine.results.at(-1)!;
    expect(rr.type).toBe('suddendeath');
    expect(rr.failerIdx).toBe(failer);

    // Failer −D.
    const failerDelta = rr.deltas.find((d) => d.seatIdx === failer)!;
    expect(failerDelta.delta).toBe(-D);
    // Last answerer +finisherBonus (on top of the answer score already banked).
    const leaderDelta = rr.deltas.find((d) => d.seatIdx === leader)!;
    expect(leaderDelta.delta).toBe(cfg.fail.finisherBonus);
    expect(engine.players[leader]!.score).toBe(
      leaderScoreAfterAnswer + cfg.fail.finisherBonus,
    );
    // The third player (neither failer nor last answerer) gets +othersBonus.
    const others = [0, 1, 2].filter((i) => i !== failer && i !== leader);
    for (const o of others) {
      const d = rr.deltas.find((x) => x.seatIdx === o)!;
      expect(d.delta).toBe(cfg.fail.othersBonus);
    }
  });

  it('first-turn timeout (lastAnswererIdx===null) applies NO finisher bonus', () => {
    const clock = makeClock();
    const engine = makeEngine({ n: 3, clock });
    engine.start();
    expect(engine.state.lastAnswererIdx).toBeNull();

    const failer = engine.currentPlayerIdx;
    engine.onTurnTimeout();

    const rr = engine.results.at(-1)!;
    expect(rr.type).toBe('suddendeath');
    // No delta equals the finisher bonus (nobody received it).
    const gotFinisher = rr.deltas.some(
      (d) => d.seatIdx !== failer && d.delta === cfg.fail.finisherBonus,
    );
    // othersBonus (5) !== finisherBonus (20), so this is a clean check.
    expect(gotFinisher).toBe(false);
    // Every non-failer active player got exactly othersBonus.
    for (const p of engine.players) {
      if (p.seatIdx === failer) continue;
      const d = rr.deltas.find((x) => x.seatIdx === p.seatIdx)!;
      expect(d.delta).toBe(cfg.fail.othersBonus);
    }
  });
});

describe('GameEngine — 완주 종료 (round clock expiry between turns)', () => {
  it('completion applies no deduction and no finisher bonus', () => {
    const clock = makeClock();
    const engine = makeEngine({ n: 3, clock });
    engine.start();
    // Answer once (sets lastAnswerer), then let the round clock expire before the
    // next turn opens.
    const ans = findValidAnswer(engine, 'any');
    clock.set(engine.state.roundDeadline + 1);
    engine.submit(engine.currentPlayerIdx, ans!.text);
    const rr = engine.results.at(-1)!;
    expect(rr.type).toBe('complete');
    expect(rr.failerIdx).toBeNull();
    expect(rr.deltas.length).toBe(0);
  });
});

describe('GameEngine — rotation across rounds', () => {
  it('startPlayerIdx cycles 0→1→2 over three rounds', () => {
    const clock = makeClock();
    const engine = makeEngine({ n: 3, totalRounds: 3, clock });
    engine.start();
    const leads: number[] = [engine.state.startPlayerIdx];
    // Round 0 → force completion to advance.
    clock.set(engine.state.roundDeadline + 1);
    // A no-op valid submit is needed to re-open a turn; instead just time-out-free
    // completion via startTurn on next round boundary. Use a valid answer to
    // trigger the gate check.
    let ans = findValidAnswer(engine, 'any');
    engine.submit(engine.currentPlayerIdx, ans!.text); // → completes round 0
    leads.push(engine.state.startPlayerIdx);
    clock.set(engine.state.roundDeadline + 1);
    ans = findValidAnswer(engine, 'any');
    engine.submit(engine.currentPlayerIdx, ans!.text); // → completes round 1
    leads.push(engine.state.startPlayerIdx);
    expect(leads).toEqual([0, 1, 2]);
  });
});

describe('GameEngine — used reset + start redraw each round', () => {
  it('each round clears used and redraws a transfer start on a startable line', () => {
    const clock = makeClock();
    const engine = makeEngine({ n: 2, totalRounds: 3, clock });
    engine.start();
    const seen: number[] = [];
    for (let round = 0; round < 3; round++) {
      const s = engine.state;
      const rec = index.byId(s.currentStationId);
      expect(rec.isTransfer).toBe(true);
      expect((rec.startableLines & s.activeMask)).not.toBe(0n);
      // used holds exactly the start station right after a redraw.
      expect(s.used.has(s.currentStationId)).toBe(true);
      expect(s.used.size).toBe(1);
      seen.push(s.currentStationId);
      if (round < 2) {
        clock.set(s.roundDeadline + 1);
        const ans = findValidAnswer(engine, 'any');
        engine.submit(engine.currentPlayerIdx, ans!.text);
      }
    }
    expect(seen.length).toBe(3);
  });
});

describe('GameEngine — region scoping', () => {
  it('a capital engine never draws a busan station; masks are capital-local', () => {
    const clock = makeClock();
    const engine = makeEngine({ n: 2, totalRounds: 3, clock, seed: 7 });
    engine.start();
    // Precompute capital line bits.
    const capitalBits = new Set<number>();
    for (const rec of index.records) {
      if (rec.region !== 'capital') continue;
      let m = rec.lineMask;
      let bit = 0;
      while (m > 0n) {
        if ((m & 1n) === 1n) capitalBits.add(bit);
        m >>= 1n;
        bit += 1;
      }
    }
    for (let round = 0; round < 3; round++) {
      const s = engine.state;
      expect(index.byId(s.currentStationId).region).toBe('capital');
      // Every bit in the active/used masks is a capital line bit.
      for (const mask of [s.activeMask, s.usedLineMask]) {
        let m = mask;
        let bit = 0;
        while (m > 0n) {
          if ((m & 1n) === 1n) expect(capitalBits.has(bit)).toBe(true);
          m >>= 1n;
          bit += 1;
        }
      }
      if (round < 2) {
        clock.set(s.roundDeadline + 1);
        const ans = findValidAnswer(engine, 'any');
        engine.submit(engine.currentPlayerIdx, ans!.text);
      }
    }
  });

  it('daejeon engine tolerates a single-element startable pool (no transfers)', () => {
    // daejeon is a single isolated line: ALL 22 stations have is_transfer=0, so a
    // transfer start is impossible. The engine falls back to any station on the
    // one startable line (daejeon_1). See plan §6/§11 daejeon note.
    const clock = makeClock();
    const engine = makeEngine({ n: 2, region: 'daejeon', totalRounds: 1, clock });
    engine.start();
    const s = engine.state;
    const rec = index.byId(s.currentStationId);
    expect(rec.region).toBe('daejeon');
    const daejeon1Bit = index.lineBit.get('daejeon_1')!;
    const daejeon1Mask = 1n << BigInt(daejeon1Bit);
    // Start line is daejeon_1; the drawn station is on it.
    expect(s.activeMask).toBe(daejeon1Mask);
    expect((rec.lineMask & daejeon1Mask)).not.toBe(0n);
  });
});

describe('GameEngine — pause / resume shifts round clock', () => {
  it('resume pushes roundDeadline forward by exactly the paused duration', () => {
    const clock = makeClock();
    const engine = makeEngine({ clock });
    engine.start();
    const beforeRound = engine.state.roundDeadline;
    const beforeTurn = engine.state.turnDeadline;

    engine.pause();
    const delta = 4321;
    clock.advance(delta);
    engine.resume();

    expect(engine.state.roundDeadline).toBe(beforeRound + delta);
    expect(engine.state.turnDeadline).toBe(beforeTurn + delta);
  });

  it('resume without a prior pause is a no-op', () => {
    const clock = makeClock();
    const engine = makeEngine({ clock });
    engine.start();
    const before = engine.state.roundDeadline;
    clock.advance(1000);
    engine.resume();
    expect(engine.state.roundDeadline).toBe(before);
  });
});

describe('GameEngine — disconnect / reconnect / grace', () => {
  it('markDisconnected → expireGrace → spectator, skipped in rotation', () => {
    const clock = makeClock();
    const engine = makeEngine({ n: 3, clock });
    engine.start();

    // Disconnect player 1 (not necessarily current) and expire their grace.
    engine.markDisconnected(1);
    expect(engine.players[1]!.status).toBe('disconnected');
    clock.advance(cfg.disconnectGraceMs + 1);
    engine.expireGrace(1);
    expect(engine.players[1]!.status).toBe('spectator');

    // Drive a full rotation of correct answers; player 1 must never get a turn.
    const seatsSeen = new Set<number>();
    for (let i = 0; i < 4; i++) {
      const cur = engine.currentPlayerIdx;
      seatsSeen.add(cur);
      const ans = findValidAnswer(engine, 'any');
      if (!ans) break;
      const res = engine.submit(cur, ans.text);
      if (!res.ok) break;
      if (engine.phase !== 'round') break;
    }
    expect(seatsSeen.has(1)).toBe(false);
  });

  it('reconnect before grace expiry restores active status', () => {
    const clock = makeClock();
    const engine = makeEngine({ n: 3, clock });
    engine.start();
    engine.markDisconnected(2);
    clock.advance(cfg.disconnectGraceMs - 1);
    engine.reconnect(2);
    expect(engine.players[2]!.status).toBe('active');
    expect(engine.players[2]!.disconnectDeadline).toBeNull();
  });

  it('host handover: host disconnect moves host to next active player', () => {
    const clock = makeClock();
    const engine = makeEngine({ n: 3, clock });
    engine.start();
    expect(engine.hostIdx).toBe(0);
    engine.markDisconnected(0);
    expect(engine.hostIdx).toBe(1);
  });
});

describe('GameEngine — scoring integration (real answerScore)', () => {
  it('a valid transfer+newLine submit banks the exact answerScore', () => {
    // Search seeds until the seeded start state has a transfer+newLine answer
    // available (deterministic given the seed we settle on).
    let chosen: { seed: number; engine: GameEngine; clock: Clock } | null = null;
    for (let seed = 1; seed <= 200 && !chosen; seed++) {
      const clock = makeClock();
      const engine = makeEngine({ clock, seed });
      engine.start();
      if (findValidAnswer(engine, 'transferNewLine')) {
        chosen = { seed, engine, clock };
      }
    }
    expect(chosen).not.toBeNull();
    const { engine, clock } = chosen!;
    const s = engine.state;
    const ans = findValidAnswer(engine, 'transferNewLine')!;
    const rec = index.byId(ans.stationIdx);

    // Answer instantly (no time consumed) → remainingRatio == 1.
    const expected = answerScore(
      { syllables: rec.syllables, transfer: true, newLine: true, remainingRatio: 1 },
      cfg,
    );
    const cur = engine.currentPlayerIdx;
    const res = engine.submit(cur, ans.text);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.transfer).toBe(true);
      expect(res.newLine).toBe(true);
      expect(res.scoreDelta).toBe(expected);
    }
    expect(engine.players[cur]!.score).toBe(expected);
    // Concrete number sanity: base 10 + transfer 15 + newLine 20 + speed 10 +
    // nameBonus(max(0,syll-3)*2).
    const nameBonus = Math.max(0, rec.syllables - 3) * cfg.scoring.nameBonusPerSyllableOver3;
    expect(expected).toBe(10 + 15 + 20 + 10 + nameBonus);
    // clock is available for any follow-up timing assertions.
    void clock;
  });
});

describe('GameEngine — game end + ranking', () => {
  it('ends after totalRounds and ranks by cumulative score', () => {
    const clock = makeClock();
    const engine = makeEngine({ n: 3, totalRounds: 2, clock });
    engine.start();
    // Round 0: player 0 answers once (banks points), then times out → ends r0.
    const ans = findValidAnswer(engine, 'any');
    engine.submit(engine.currentPlayerIdx, ans!.text);
    engine.onTurnTimeout(); // ends round 0 (index 0), advances to round 1

    // Round 1 (final): time out immediately to end the game.
    engine.onTurnTimeout();
    expect(engine.phase).toBe('ended');
    expect(engine.ranking.length).toBe(3);
    // Ranking is sorted descending by score with dense 1-based ranks.
    for (let i = 1; i < engine.ranking.length; i++) {
      expect(engine.ranking[i - 1]!.score).toBeGreaterThanOrEqual(engine.ranking[i]!.score);
    }
    expect(engine.ranking[0]!.rank).toBe(1);
  });
});
