/**
 * Bot move-selection tests. Pure and deterministic: `chooseBotMove` takes an
 * injected rng, so a constant stream pins the tier window and the think time
 * without touching a clock or a socket.
 */

import { describe, it, expect } from 'vitest';

import { loadBalance, judge } from '@subway/shared';
import type { BalanceConfig, BotLevel, GameMode, StationIndex } from '@subway/shared';

import { loadStationIndex } from '../data/loader.js';
import { chooseBotMove } from './bot.js';

const cfg: BalanceConfig = loadBalance();
const index: StationIndex = loadStationIndex();

/** 서울역 — on both 수도권 metro lines and KTX/SRT, so both modes can start here. */
const seoul = index.records.find((r) => r.displayName === '서울역')!;

function move(
  level: BotLevel,
  gameMode: GameMode,
  rng: () => number,
  over: { attempt?: number; remainingMs?: number } = {},
) {
  const allowedMask = gameMode === 'railExpansion' ? index.expansionMask : index.metroMask;
  const activeMask = seoul.lineMask & allowedMask;
  return chooseBotMove({
    index,
    cfg,
    level,
    currentIdx: seoul.idx,
    activeMask,
    usedLineMask: activeMask,
    used: new Set([seoul.idx]),
    allowedMask,
    gameMode,
    turnLimitMs: 20_000,
    remainingMs: over.remainingMs ?? 20_000,
    attempt: over.attempt ?? 0,
    rng,
  });
}

/** Judge the bot's text against the same board `move()` posed it. */
function accepted(text: string, gameMode: GameMode): boolean {
  const allowedMask = gameMode === 'railExpansion' ? index.expansionMask : index.metroMask;
  return judge({
    index,
    currentIdx: seoul.idx,
    activeMask: seoul.lineMask & allowedMask,
    used: new Set([seoul.idx]),
    text,
    allowedMask,
  }).valid;
}

/** Always picks the top-ranked candidate and the fastest think time in the band. */
const best = (): number => 0;

describe('chooseBotMove — 고수 in 고속철도 확장', () => {
  it('rides the rails out of 수도권 and lands on a regional metro line', () => {
    const picked = move('expert', 'railExpansion', best);
    expect(picked).not.toBeNull();

    const rec = index.records.find((r) => r.displayName === picked!.text)!;
    expect(rec.region).not.toBe('capital');
    // Not just any KTX stop — one that continues onto a local subway (부산1, 대구1 …).
    expect(rec.lineMask & index.metroMask).not.toBe(0n);
  });

  it('stays on the metro board when the room is not in 확장 mode', () => {
    const picked = move('expert', 'metro', best);
    expect(picked).not.toBeNull();
    expect(index.records.find((r) => r.displayName === picked!.text)!.region).toBe('capital');
  });

  it('picks a station the judge actually accepts', () => {
    expect(accepted(move('expert', 'railExpansion', best)!.text, 'railExpansion')).toBe(true);
  });
});

describe('chooseBotMove — 난이도', () => {
  it('answers faster the stronger the tier, and always inside the turn clock', () => {
    const delays = (['intro', 'beginner', 'mid', 'expert'] as BotLevel[]).map(
      (level) => move(level, 'metro', best)!.delayMs,
    );
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]!).toBeLessThan(delays[i - 1]!);
    }
    expect(delays[0]!).toBeLessThan(20_000);
  });

  it('says a real but unconnected station when the accuracy roll fails', () => {
    // 0.99 fails every tier's accuracy roll → a deliberate wrong answer.
    const wrong = move('expert', 'metro', () => 0.99);
    expect(wrong).not.toBeNull();
    // It is a real station name (so it renders like a human's slip)…
    expect(index.records.some((r) => r.displayName === wrong!.text)).toBe(true);
    // …that the engine rejects, leaving the turn open for the correction.
    expect(accepted(wrong!.text, 'metro')).toBe(false);
  });

  it('gives up after the tier attempt cap so a turn can still be lost', () => {
    // 고수 gets 5 retries after its first answer, everyone else 3.
    expect(move('expert', 'metro', () => 0.99, { attempt: 5 })).not.toBeNull();
    expect(move('expert', 'metro', () => 0.99, { attempt: 6 })).toBeNull();
    expect(move('mid', 'metro', () => 0.99, { attempt: 3 })).not.toBeNull();
    expect(move('mid', 'metro', () => 0.99, { attempt: 4 })).toBeNull();
  });

  it('stays silent when too little clock is left to type again', () => {
    expect(move('intro', 'metro', best, { remainingMs: 600 })).toBeNull();
    // With room to answer, the delay never overruns what is left.
    const late = move('intro', 'metro', () => 0.9, { remainingMs: 3_000 });
    expect(late!.delayMs).toBeLessThan(3_000);
  });
});
