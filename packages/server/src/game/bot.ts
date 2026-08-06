/**
 * Practice-bot move selection (solo play).
 *
 * Pure and deterministic under an injected `rng`: given the loaded index and the
 * live board, it returns the station name the bot will type and how long it will
 * "think" before typing — or `null` when the bot decides to miss this turn, in
 * which case the normal turn timer runs out and the round settles as a regular
 * sudden-death fail. No timers and no engine access live here; `socket.ts`
 * schedules the returned delay.
 *
 * Difficulty is two independent knobs, which is what makes the tiers feel
 * different rather than just slower:
 *   - `accuracy`  — probability the bot answers at all this turn.
 *   - `pick`      — how far down the score-ranked candidate list it may reach
 *                   (1 = always the best answer available).
 *   - `think`     — reaction-time window, as a fraction of the turn limit.
 */

import type { BalanceConfig, BotLevel, StationIndex } from '@subway/shared';
import { answerScore } from '@subway/shared';

/** The bot's decision for one turn. */
export interface BotMove {
  /** Station display name the bot will submit. */
  text: string;
  /** Delay before submitting, in milliseconds (always < the turn limit). */
  delayMs: number;
}

/** Per-difficulty behaviour knobs. */
interface BotProfile {
  /** Probability the bot answers this turn at all. */
  accuracy: number;
  /** Size of the top-N candidate window it draws from. */
  window: number;
  /** Think time as a fraction of the turn limit: [min, max]. */
  think: [number, number];
}

/** 입문 / 초수 / 중수 / 고수. */
const PROFILES: Record<BotLevel, BotProfile> = {
  intro: { accuracy: 0.55, window: 60, think: [0.45, 0.8] },
  beginner: { accuracy: 0.75, window: 30, think: [0.35, 0.7] },
  mid: { accuracy: 0.9, window: 10, think: [0.2, 0.5] },
  expert: { accuracy: 0.98, window: 3, think: [0.08, 0.3] },
};

/** Board context the bot judges against (mirrors the engine's live state). */
export interface BotMoveInput {
  index: StationIndex;
  cfg: BalanceConfig;
  level: BotLevel;
  /** Current station index. */
  currentIdx: number;
  /** Active line mask the answer must connect to. */
  activeMask: bigint;
  /** Lines already opened this round (drives the new-line bonus). */
  usedLineMask: bigint;
  /** Stations already visited this round. */
  used: Set<number>;
  /** Allowed-line mask for the room's game mode. */
  allowedMask: bigint;
  /** Current turn limit in milliseconds. */
  turnLimitMs: number;
  /** Uniform rng in [0, 1). */
  rng: () => number;
}

/**
 * Choose the bot's move, or `null` when it misses this turn.
 *
 * Candidate collection mirrors `judge()`: a station is playable when its lines
 * intersect the active mask (straight) or the current station's lines (transfer).
 */
export function chooseBotMove(input: BotMoveInput): BotMove | null {
  const profile = PROFILES[input.level];
  if (input.rng() >= profile.accuracy) return null;

  const { index, allowedMask, activeMask, used } = input;
  const currentLines = index.byId(input.currentIdx).lineMask & allowedMask;

  // ponytail: linear scan over every station (~1k records) per bot turn. Fine at
  // this size; index playable stations per line bit if the dataset grows.
  const candidates: { name: string; score: number }[] = [];
  for (const rec of index.records) {
    if (used.has(rec.idx)) continue;
    const lines = rec.lineMask & allowedMask;
    const straightMask = activeMask & lines;
    const nextMask = straightMask !== 0n ? straightMask : currentLines & lines;
    if (nextMask === 0n) continue;
    candidates.push({
      name: rec.displayName,
      score: answerScore(
        {
          syllables: rec.syllables,
          transfer: straightMask === 0n,
          newLine: (nextMask & ~input.usedLineMask) !== 0n,
          remainingRatio: 0,
        },
        input.cfg,
      ),
    });
  }
  if (candidates.length === 0) return null;

  // Best answers first, then draw from the tier's window. A wide window is what
  // makes 입문 pick dull one-syllable straight moves while 고수 opens new lines.
  candidates.sort((a, b) => b.score - a.score);
  const window = Math.min(profile.window, candidates.length);
  const pick = candidates[Math.floor(input.rng() * window)]!;

  const [lo, hi] = profile.think;
  const ratio = lo + input.rng() * (hi - lo);
  // Cap below the deadline so a slow tier still answers instead of timing out by
  // accident — a miss must come from `accuracy`, never from the clock.
  const delayMs = Math.min(input.turnLimitMs * ratio, input.turnLimitMs - 300);

  return { text: pick.name, delayMs: Math.max(0, delayMs) };
}
