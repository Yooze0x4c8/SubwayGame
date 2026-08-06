/**
 * Practice-bot move selection (solo play).
 *
 * Pure and deterministic under an injected `rng`: given the loaded index and the
 * live board, it returns the station name the bot will type and how long it will
 * "think" before typing. It is called once per ATTEMPT — `socket.ts` calls it
 * again after each rejection — and returns `null` when the bot is out of
 * attempts or out of clock, at which point the ordinary turn timer settles the
 * round as a sudden-death fail. No timers and no engine access live here.
 *
 * Difficulty is four independent knobs, which is what makes the tiers feel
 * different rather than just slower:
 *   - `accuracy`    — chance an attempt is a real answer rather than a wrong one.
 *   - `maxAttempts` — how many tries one turn gets (first answer + retries).
 *   - `window`      — how far down the score-ranked candidate list it may reach
 *                     (1 = always the best answer available).
 *   - `think`       — reaction-time window, as a fraction of the turn limit.
 */

import type { BalanceConfig, BotLevel, GameMode, StationIndex } from '@subway/shared';
import { answerScore, normalizeNameKey } from '@subway/shared';

/** The bot's decision for one turn. */
export interface BotMove {
  /** Station display name the bot will submit. */
  text: string;
  /** Delay before submitting, in milliseconds (always < the turn limit). */
  delayMs: number;
}

/** Per-difficulty behaviour knobs. */
interface BotProfile {
  /**
   * Probability a single attempt is a real answer rather than a wrong one.
   * Per-turn difficulty is this rolled up to `maxAttempts` times, as far as the
   * turn clock allows: 입문 0.25 → 45% of turns lost, 고수 0.90 → under 1%.
   */
  accuracy: number;
  /**
   * Attempts allowed in one turn — the first answer plus its retries.
   *
   * The weak tiers get 3 retries because flailing is their character, and their
   * think time usually runs the clock out before the cap anyway. The strong
   * tiers get ONE: at 70/90% accuracy an uncapped retry budget means six
   * consecutive misses to lose a turn, i.e. never — the round would always end
   * on the human's mistake. One retry is what keeps them beatable.
   */
  maxAttempts: number;
  /** Size of the top-N candidate window it draws from. */
  window: number;
  /** Think time as a fraction of the turn limit: [min, max]. */
  think: [number, number];
}

/**
 * 입문 / 초수 / 중수 / 고수.
 *
 * `accuracy` is per ATTEMPT; the per-turn loss rate falls out of it together with
 * `maxAttempts` and the think band, since a wrong answer can be corrected while
 * the clock lasts. The two upper tiers are deliberately set high — they are
 * meant to look competent, not to spray wrong stations — so they rarely lose a
 * turn at all. Note that raising `accuracy` shifts difficulty twice over: fewer
 * visible mistakes AND fewer turns lost.
 */
const PROFILES: Record<BotLevel, BotProfile> = {
  intro: { accuracy: 0.25, window: 60, think: [0.3, 0.55], maxAttempts: 4 },
  beginner: { accuracy: 0.34, window: 30, think: [0.22, 0.45], maxAttempts: 4 },
  mid: { accuracy: 0.7, window: 10, think: [0.12, 0.32], maxAttempts: 2 },
  expert: { accuracy: 0.9, window: 3, think: [0.06, 0.2], maxAttempts: 2 },
};

/**
 * Ranking bias 고수 applies in `railExpansion` only. These are ordering weights,
 * not points: they sit far above any real answer score (max ~60) so a rail-out
 * move always outranks a comfortable local one. The tiers stack, so the most
 * attractive move is "ride KTX/SRT out of 수도권 and land on a regional metro".
 */
const EXPANSION_BIAS = {
  /** Boarded a high-speed line (KTX/SRT). */
  highspeed: 100,
  /** Answered a station outside 수도권. */
  offCapital: 200,
  /** …and that station carries a regional metro line (부산1, 인천1, 대구1 …). */
  offCapitalMetro: 400,
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
  /** Room game mode — drives 고수's rail-out preference in `railExpansion`. */
  gameMode: GameMode;
  /** Current turn limit in milliseconds (sets the reaction-time band). */
  turnLimitMs: number;
  /** Time left on the live turn clock, in milliseconds. */
  remainingMs: number;
  /** 0-based attempt number within this turn (the caller counts rejections). */
  attempt: number;
  /** Uniform rng in [0, 1). */
  rng: () => number;
}

/** Shortest gap between two attempts — also stops a retry storm on a fast clock. */
const MIN_DELAY_MS = 400;
/** An answer must land this far before the deadline to count as typed in time. */
const DEADLINE_LEAD_MS = 300;

/**
 * Choose the bot's next attempt for the live turn, or `null` when it is out of
 * attempts or out of clock.
 *
 * The accuracy roll is per ATTEMPT, not per turn: a failed roll produces a real
 * station name that does not connect, which the engine rejects exactly like a
 * human's wrong answer. The caller re-invokes this after each rejection, so a
 * mistake can still be corrected until the tier runs out of attempts or clock.
 *
 * Candidate collection mirrors `judge()`: a station is playable when its lines
 * intersect the active mask (straight) or the current station's lines (transfer).
 */
export function chooseBotMove(input: BotMoveInput): BotMove | null {
  const profile = PROFILES[input.level];
  const { index, allowedMask, activeMask, used } = input;
  const current = index.byId(input.currentIdx);
  const currentLines = current.lineMask & allowedMask;

  // Out of attempts, or no room for another — stay silent and let the turn end.
  if (input.attempt >= profile.maxAttempts) return null;
  const budgetMs = input.remainingMs - DEADLINE_LEAD_MS;
  if (budgetMs < MIN_DELAY_MS) return null;

  // 고수 in 고속철도 확장: play the mode instead of the board — take the KTX/SRT
  // out of 수도권 and keep going on whatever regional metro the arrival station
  // carries. Every other tier (and every metro game) ranks on score alone.
  const railHunt = input.level === 'expert' && input.gameMode === 'railExpansion';
  const highspeedMask = allowedMask & ~index.metroMask;

  // ponytail: linear scan over every station (~1k records) per bot turn. Fine at
  // this size; index playable stations per line bit if the dataset grows.
  const candidates: { name: string; score: number }[] = [];
  const playable = new Set<number>();
  const wrongs: number[] = [];
  for (const rec of index.records) {
    const lines = rec.lineMask & allowedMask;
    const straightMask = activeMask & lines;
    const nextMask = straightMask !== 0n ? straightMask : currentLines & lines;
    if (used.has(rec.idx) || nextMask === 0n) {
      // A believable mistake is a station the bot could plausibly have in mind:
      // one nearby on the map, just not on any line reachable from here.
      if (lines !== 0n && rec.region === current.region) wrongs.push(rec.idx);
      continue;
    }
    playable.add(rec.idx);

    let score = answerScore(
      {
        syllables: rec.syllables,
        transfer: straightMask === 0n,
        newLine: (nextMask & ~input.usedLineMask) !== 0n,
        remainingRatio: 0,
      },
      input.cfg,
    );
    if (railHunt) {
      if ((nextMask & highspeedMask) !== 0n) score += EXPANSION_BIAS.highspeed;
      if (rec.region !== 'capital') {
        score += EXPANSION_BIAS.offCapital;
        if ((lines & index.metroMask) !== 0n) score += EXPANSION_BIAS.offCapitalMetro;
      }
    }
    candidates.push({ name: rec.displayName, score });
  }
  if (candidates.length === 0) return null;

  // Best answers first, then draw from the tier's window. A wide window is what
  // makes 입문 pick dull one-syllable straight moves while 고수 opens new lines.
  candidates.sort((a, b) => b.score - a.score);
  const window = Math.min(profile.window, candidates.length);

  const correct = input.rng() < profile.accuracy;
  const text = correct
    ? candidates[Math.floor(input.rng() * window)]!.name
    : (pickWrong(index, wrongs, playable, input.rng) ??
      // Nothing wrong to say (tiny region, everything reachable) — rather than
      // stall the turn, answer correctly. The tier's misses land elsewhere.
      candidates[Math.floor(input.rng() * window)]!.name);

  // Reaction time is a fraction of the FULL turn limit, so a tier feels the same
  // whether it is the turn's first attempt or its third — then clamped to what
  // is actually left on the clock.
  const [lo, hi] = profile.think;
  const ratio = lo + input.rng() * (hi - lo);
  const delayMs = clamp(input.turnLimitMs * ratio, MIN_DELAY_MS, budgetMs);

  return { text, delayMs };
}

/**
 * Draw a wrong-but-real station name. Skipped if any homonym sharing its
 * `name_key` is playable — `judge` resolves by key, so 신촌 could otherwise be
 * "wrong" on paper and accepted on the wire.
 */
function pickWrong(
  index: StationIndex,
  wrongs: number[],
  playable: Set<number>,
  rng: () => number,
): string | null {
  for (let attempt = 0; attempt < 5 && wrongs.length > 0; attempt++) {
    const rec = index.byId(wrongs[Math.floor(rng() * wrongs.length)]!);
    const homonyms = index.byName.get(normalizeNameKey(rec.displayName)) ?? [];
    if (!homonyms.some((idx) => playable.has(idx))) return rec.displayName;
  }
  return null;
}

/** Clamp `v` into `[lo, hi]`. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
