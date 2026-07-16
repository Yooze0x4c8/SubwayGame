/**
 * Pure scoring functions for the SUBWAY game.
 *
 * All constants come from `BalanceConfig`; no literals are hardcoded.
 * These functions are isomorphic (no I/O, no side effects) and safe to run
 * on both server and client.
 *
 * §4 (기획서) / §8 (plan) are the source of truth for all formulas.
 */

import type { BalanceConfig } from './config.js';

// ---------------------------------------------------------------------------
// Answer score (기획서 §4.1)
// ---------------------------------------------------------------------------

/** Input bag for {@link answerScore}. */
export interface AnswerScoreInput {
  /**
   * Precomputed syllable count for the station (from `StationRecord.syllables`).
   * Callers must NOT recompute this — use the canonical value from the data.
   */
  syllables: number;
  /** True when the accepted station narrowed the active line set (a transfer). */
  transfer: boolean;
  /**
   * True when the newly-active line was not yet used this round (first use).
   * The engine computes this by checking the accepted line against `usedLineMask`.
   */
  newLine: boolean;
  /**
   * Ratio of remaining turn time to the full turn limit: `timeLeft / turnLimit`,
   * clamped to [0, 1] by the caller.
   */
  remainingRatio: number;
}

/** Breakdown of the components that make up an answer score. */
export interface AnswerScoreBreakdown {
  base: number;
  nameBonus: number;
  transferBonus: number;
  newLineBonus: number;
  speedBonus: number;
  total: number;
}

/**
 * Computes the full breakdown of an answer score.
 *
 * Formula (기획서 §4.1):
 *   total = base + nameBonus + transferBonus? + newLineBonus? + speedBonus
 *
 * Where:
 *   nameBonus  = max(0, syllables - 3) * nameBonusPerSyllableOver3
 *   transferBonus = cfg.scoring.transferBonus  (only if transfer === true)
 *   newLineBonus  = cfg.scoring.newLineBonus   (only if newLine === true)
 *   speedBonus = round(remainingRatio * speedBonusMax)
 */
export function answerScoreBreakdown(
  input: AnswerScoreInput,
  cfg: BalanceConfig,
): AnswerScoreBreakdown {
  const { syllables, transfer, newLine, remainingRatio } = input;
  const { scoring } = cfg;

  const base = scoring.base;
  const nameBonus = Math.max(0, syllables - 3) * scoring.nameBonusPerSyllableOver3;
  const transferBonus = transfer ? scoring.transferBonus : 0;
  const newLineBonus = newLine ? scoring.newLineBonus : 0;
  const speedBonus = Math.round(remainingRatio * scoring.speedBonusMax);
  const total = base + nameBonus + transferBonus + newLineBonus + speedBonus;

  return { base, nameBonus, transferBonus, newLineBonus, speedBonus, total };
}

/**
 * Returns the total answer score (sum of all components).
 * See {@link answerScoreBreakdown} for the full formula.
 */
export function answerScore(input: AnswerScoreInput, cfg: BalanceConfig): number {
  return answerScoreBreakdown(input, cfg).total;
}

// ---------------------------------------------------------------------------
// Fail settlement (기획서 §4.2, plan §8)
// ---------------------------------------------------------------------------

/**
 * Computes the raw deduction magnitude for a sudden-death failure.
 *
 * Formula: `clamp(round(roundRemainingSec * deductCoef), deductMin, deductMax)`
 *
 * No lastRound multiplier — always 1.0 (plan §11 removed that mechanic).
 */
export function deduction(roundRemainingSec: number, cfg: BalanceConfig): number {
  const { deductCoef, deductMin, deductMax } = cfg.fail;
  const raw = Math.round(roundRemainingSec * deductCoef);
  return Math.min(deductMax, Math.max(deductMin, raw));
}

/** Per-player score delta produced by {@link settleFail}. */
export interface FailSettlement {
  /** Deduction applied to the failing player (negative number). */
  failerDelta: number;
  /**
   * Bonus awarded to the immediately-preceding correct answerer (positive).
   * 0 when there is no last answerer (null).
   */
  lastAnswererDelta: number;
  /** Bonus awarded to every other surviving player (positive). */
  othersDelta: number;
  /** The raw deduction magnitude (positive). */
  D: number;
}

/**
 * Computes the per-role score deltas for a sudden-death failure event.
 *
 * Roles:
 *   - failer:          −D
 *   - last answerer:   +finisherBonus  (if there is one; 0 otherwise)
 *   - everyone else:   +othersBonus
 *
 * No round multiplier is applied regardless of round index (plan §11).
 *
 * @param roundRemainingSec  Seconds remaining on the round clock when the failure
 *                           is registered.
 * @param cfg                The active balance config.
 * @returns                  A {@link FailSettlement} with the three role deltas
 *                           and the raw deduction magnitude `D`.
 */
export function settleFail(roundRemainingSec: number, cfg: BalanceConfig): FailSettlement {
  const D = deduction(roundRemainingSec, cfg);
  return {
    failerDelta: -D,
    lastAnswererDelta: cfg.fail.finisherBonus,
    othersDelta: cfg.fail.othersBonus,
    D,
  };
}
