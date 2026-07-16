/**
 * Turn-clock helpers for the SUBWAY game.
 *
 * `turnLimit` computes the per-turn time budget (in seconds) for turn index `n`
 * using exponential decay, clamped to `Tmin`. All constants are drawn from
 * `BalanceConfig`; no literals are hardcoded here.
 */

import type { BalanceConfig } from './config.js';

/**
 * Returns the turn time limit in **seconds** for the nth turn (0-based).
 *
 * Formula: `max(Tmin, round(T0 * r^n))`
 *
 * §8 acceptance (T0=15, r=0.96, Tmin=5):
 *   n=0  → 15
 *   n=10 → 10
 *   n=20 → 7
 *   n=30 → 5  (raw 4.408, floored by Tmin)
 */
export function turnLimit(n: number, cfg: BalanceConfig): number {
  return Math.max(cfg.Tmin, Math.round(cfg.T0 * Math.pow(cfg.r, n)));
}

/**
 * Returns the turn time limit in **milliseconds** for the nth turn (0-based).
 * Convenience wrapper over {@link turnLimit}.
 */
export function turnLimitMs(n: number, cfg: BalanceConfig): number {
  return turnLimit(n, cfg) * 1000;
}
