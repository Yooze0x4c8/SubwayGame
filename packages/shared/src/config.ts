/**
 * Balance config schema, default values, and a dependency-free loader/validator.
 *
 * All tuning constants live in `config/balance.json`; this module mirrors that
 * shape as a typed schema and validates any overrides at load time. There is no
 * magic-number tuning elsewhere in the codebase — everything routes through here.
 *
 * The default values below MUST stay in sync with `config/balance.json`.
 */

/** Scoring constants for a successful answer. */
export interface ScoringConfig {
  /** Flat points awarded for any valid answer. */
  base: number;
  /** Bonus when the answer is a transfer station that narrows the active line set. */
  transferBonus: number;
  /** Bonus when the answer opens a brand-new line (first use of that line). */
  newLineBonus: number;
  /** Points per syllable above 3: `max(0, syllables - 3) * this`. */
  nameBonusPerSyllableOver3: number;
  /** Maximum speed bonus awarded for a fast answer (scaled by remaining time). */
  speedBonusMax: number;
}

/** Scoring/penalty constants applied on a sudden-death failure. */
export interface FailConfig {
  /** Coefficient on remaining round seconds for the failer deduction. */
  deductCoef: number;
  /** Minimum (floor) deduction magnitude. */
  deductMin: number;
  /** Maximum (cap) deduction magnitude. */
  deductMax: number;
  /** Bonus awarded to the immediately-preceding correct answerer. */
  finisherBonus: number;
  /** Bonus awarded to all other surviving players. */
  othersBonus: number;
}

/** Start-line eligibility constants. */
export interface StartConfig {
  /**
   * Minimum station count for a line to be "startable". Precomputed into the
   * `startable` column of `lines.csv` at build time; the runtime reads that
   * column and does NOT recompute this threshold. Kept here for reference/docs.
   */
  minStartLineStations: number;
}

/** Default room settings and the option ranges a host may choose from. */
export interface RoomDefaultsConfig {
  /** Default number of rounds per game. */
  rounds: number;
  /** Selectable round-count options. */
  roundsOptions: number[];
  /** Selectable round-clock durations, in seconds. */
  roundTimeOptions: number[];
  /** Minimum selectable turn-clock duration, in seconds. */
  turnTimeMin: number;
  /** Maximum selectable turn-clock duration, in seconds. */
  turnTimeMax: number;
}

/** Full balance configuration. Mirrors `config/balance.json`. */
export interface BalanceConfig {
  /** Round clock, in seconds (R0). */
  R0: number;
  /** Base turn clock, in seconds (T0). */
  T0: number;
  /** Per-turn decay factor (r) applied as `T0 * r^n`. */
  r: number;
  /** Minimum turn clock, in seconds (Tmin). */
  Tmin: number;
  scoring: ScoringConfig;
  fail: FailConfig;
  start: StartConfig;
  roomDefaults: RoomDefaultsConfig;
  /** Grace period, in milliseconds, before a disconnected player is dropped. */
  disconnectGraceMs: number;
}

/** Default balance values. MUST stay in sync with `config/balance.json`. */
export const defaultBalance: BalanceConfig = {
  R0: 120,
  T0: 15,
  r: 0.96,
  Tmin: 5,
  scoring: {
    base: 10,
    transferBonus: 15,
    newLineBonus: 20,
    nameBonusPerSyllableOver3: 2,
    speedBonusMax: 10,
  },
  fail: {
    deductCoef: 0.4,
    deductMin: 10,
    deductMax: 50,
    finisherBonus: 20,
    othersBonus: 5,
  },
  start: {
    minStartLineStations: 20,
  },
  roomDefaults: {
    rounds: 5,
    roundsOptions: [3, 5, 7],
    roundTimeOptions: [90, 120, 180],
    turnTimeMin: 10,
    turnTimeMax: 30,
  },
  disconnectGraceMs: 30000,
};

/** A partial, deeply-optional override of {@link BalanceConfig}. */
export type BalanceOverrides = {
  [K in keyof BalanceConfig]?: BalanceConfig[K] extends object
    ? Partial<BalanceConfig[K]>
    : BalanceConfig[K];
};

/** Thrown when an override value fails validation. */
export class BalanceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BalanceValidationError';
  }
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function assertPositive(path: string, v: unknown): number {
  if (!isFiniteNumber(v) || v <= 0) {
    throw new BalanceValidationError(`${path} must be a positive finite number, got ${String(v)}`);
  }
  return v;
}

function assertNonNegative(path: string, v: unknown): number {
  if (!isFiniteNumber(v) || v < 0) {
    throw new BalanceValidationError(
      `${path} must be a non-negative finite number, got ${String(v)}`,
    );
  }
  return v;
}

/**
 * Merge `overrides` over {@link defaultBalance} and validate the result.
 *
 * Hand-written validator (no external deps): checks numeric invariants that the
 * engine and scoring rely on. Unknown keys in overrides are ignored; only the
 * known schema is merged, so callers cannot smuggle extra fields into the
 * returned config.
 */
export function loadBalance(overrides?: BalanceOverrides): BalanceConfig {
  const o = overrides ?? {};

  const merged: BalanceConfig = {
    R0: o.R0 ?? defaultBalance.R0,
    T0: o.T0 ?? defaultBalance.T0,
    r: o.r ?? defaultBalance.r,
    Tmin: o.Tmin ?? defaultBalance.Tmin,
    scoring: { ...defaultBalance.scoring, ...o.scoring },
    fail: { ...defaultBalance.fail, ...o.fail },
    start: { ...defaultBalance.start, ...o.start },
    roomDefaults: { ...defaultBalance.roomDefaults, ...o.roomDefaults },
    disconnectGraceMs: o.disconnectGraceMs ?? defaultBalance.disconnectGraceMs,
  };

  // Top-level clocks.
  assertPositive('R0', merged.R0);
  assertPositive('T0', merged.T0);
  assertPositive('Tmin', merged.Tmin);
  if (!isFiniteNumber(merged.r) || merged.r <= 0 || merged.r > 1) {
    throw new BalanceValidationError(`r must be in (0, 1], got ${String(merged.r)}`);
  }
  if (merged.Tmin > merged.T0) {
    throw new BalanceValidationError(
      `Tmin (${merged.Tmin}) must not exceed T0 (${merged.T0})`,
    );
  }

  // Scoring.
  assertNonNegative('scoring.base', merged.scoring.base);
  assertNonNegative('scoring.transferBonus', merged.scoring.transferBonus);
  assertNonNegative('scoring.newLineBonus', merged.scoring.newLineBonus);
  assertNonNegative('scoring.nameBonusPerSyllableOver3', merged.scoring.nameBonusPerSyllableOver3);
  assertNonNegative('scoring.speedBonusMax', merged.scoring.speedBonusMax);

  // Fail.
  assertNonNegative('fail.deductCoef', merged.fail.deductCoef);
  assertNonNegative('fail.deductMin', merged.fail.deductMin);
  assertNonNegative('fail.deductMax', merged.fail.deductMax);
  assertNonNegative('fail.finisherBonus', merged.fail.finisherBonus);
  assertNonNegative('fail.othersBonus', merged.fail.othersBonus);
  if (merged.fail.deductMin > merged.fail.deductMax) {
    throw new BalanceValidationError(
      `fail.deductMin (${merged.fail.deductMin}) must not exceed fail.deductMax (${merged.fail.deductMax})`,
    );
  }

  // Start.
  assertPositive('start.minStartLineStations', merged.start.minStartLineStations);

  // Room defaults.
  assertPositive('roomDefaults.rounds', merged.roomDefaults.rounds);
  if (merged.roomDefaults.roundsOptions.length === 0) {
    throw new BalanceValidationError('roomDefaults.roundsOptions must not be empty');
  }
  if (merged.roomDefaults.roundTimeOptions.length === 0) {
    throw new BalanceValidationError('roomDefaults.roundTimeOptions must not be empty');
  }
  assertPositive('roomDefaults.turnTimeMin', merged.roomDefaults.turnTimeMin);
  assertPositive('roomDefaults.turnTimeMax', merged.roomDefaults.turnTimeMax);
  if (merged.roomDefaults.turnTimeMin > merged.roomDefaults.turnTimeMax) {
    throw new BalanceValidationError(
      `roomDefaults.turnTimeMin (${merged.roomDefaults.turnTimeMin}) must not exceed turnTimeMax (${merged.roomDefaults.turnTimeMax})`,
    );
  }

  assertNonNegative('disconnectGraceMs', merged.disconnectGraceMs);

  return merged;
}
