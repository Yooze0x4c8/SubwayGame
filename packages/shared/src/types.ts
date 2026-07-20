/**
 * Shared type/interface skeletons for the SUBWAY game.
 *
 * These are the contracts Wave-2 workers (loader / judgment / scoring / engine)
 * depend on. Bodies are declarations only — no logic lives here. See plan §5/§5.1.
 *
 * Slug↔bit interning is owned by the loader: `station_id` (e.g. `capital_0549`)
 * and `line_id` (e.g. `seoul_2`) are strings in the CSVs; the loader interns
 * them into integer `stationIdx` and per-line bit positions. Judgment/engine
 * only ever deal in integers and bitmasks.
 */

/**
 * A station as parsed from `stations.csv` (pre-interning, slug-based).
 * `syllables` is the build-time precomputed value and is treated as canonical —
 * never recompute it at runtime (plan §6, review B4).
 */
export interface Station {
  /** Slug id, e.g. `capital_0549`. */
  id: string;
  /** Raw station name, e.g. `신촌`. */
  name: string;
  /** Human-facing display name (may carry a parenthetical qualifier). */
  displayName: string;
  /** Normalized lookup key derived from name; used for input resolution. */
  nameKey: string;
  /** Region slug: `capital` | `busan` | `daegu` | `daejeon` | `gwangju`. */
  region: string;
  /** Precomputed Korean syllable count (canonical — do not recompute). */
  syllables: number;
  /** True when the station serves more than one line. */
  isTransfer: boolean;
  /** Latitude (WGS84). */
  lat: number;
  /** Longitude (WGS84). */
  lon: number;
  /** Alternate names / aliases for input matching. */
  aliases: string[];
}

/**
 * A station after the loader has interned it into integer/bit form (plan §5.1).
 * `lineMask` is assembled by group-by over `station_lines.csv`.
 */
export interface StationRecord {
  /** Integer index (used for `used` bitset / Set membership). */
  idx: number;
  /** Slug id, e.g. `capital_0549`. */
  id: string;
  /** Raw station name. */
  name: string;
  /** Human-facing display name. */
  displayName: string;
  /** Region slug. */
  region: string;
  /** OR of all line bits this station serves (from `station_lines` group-by). */
  lineMask: bigint;
  /** Precomputed syllable count (canonical — from `stations.csv`). */
  syllables: number;
  /** `popcount(lineMask) > 1`. */
  isTransfer: boolean;
  /** Subset of `lineMask` whose lines have `startable=1` in `lines.csv`. */
  startableLines: bigint;
}

/**
 * The in-memory index the loader produces (plan §5.1). Region-scoped.
 * The loader owns the slug↔bit mapping; consumers use integers/bitmasks.
 */
export interface StationIndex {
  /** `line_id` → bit position (stable, assigned in sorted `line_id` order). */
  lineBit: Map<string, number>;
  /** Line bit position → difficulty tier from `lines.csv`. */
  lineTierByBit: Map<number, LineTier>;
  /** `station_id` → integer index. */
  stationIdx: Map<string, number>;
  /** Integer index → station record. */
  byId: (idx: number) => StationRecord;
  /** `name_key` → station indices (2+ entries for homonym splits, e.g. 신촌). */
  byName: Map<string, number[]>;
  /** All records, indexable by `idx`. */
  records: StationRecord[];
}

/** Difficulty tier of a line, as tagged in `lines.csv`. */
export type LineTier = 'intro' | 'normal' | 'hardcore';

/** A line as parsed from `lines.csv`. */
export interface Line {
  /** Slug id, e.g. `seoul_2`. */
  id: string;
  /** Display name, e.g. `2호선`. */
  name: string;
  /** Region slug. */
  region: string;
  /** Difficulty tier. */
  tier: LineTier;
  /** Number of stations on the line. */
  stationCount: number;
  /** Precomputed: eligible as a game start line (`stationCount >= threshold`). */
  startable: boolean;
}

/**
 * Authoritative per-round game state held by the server engine (plan §5).
 * All identifiers are integer `stationIdx` values (never slugs, never names).
 * Deadlines are absolute epoch milliseconds.
 */
export interface GameState {
  /** Current station as an integer `stationIdx` (interned by the loader). */
  currentStationId: number;
  /** Bitmask of currently-active lines the next answer must connect to. */
  activeMask: bigint;
  /** Bitmask of lines that have already been opened this round. */
  usedLineMask: bigint;
  /** Visited stations this round, by `stationIdx`. Reset each round. */
  used: Set<number>;
  /** 1-based round number. */
  round: number;
  /** Turn counter within the round (drives `turnLimit(n)` decay). */
  turnIndex: number;
  /** Index of the player who leads this round (rotates each round). */
  startPlayerIdx: number;
  /** Round-clock deadline (absolute epoch ms) — the turn-open gate. */
  roundDeadline: number;
  /** Turn-clock deadline (absolute epoch ms). */
  turnDeadline: number;
  /** Current turn limit in milliseconds. */
  turnLimitMs: number;
  /** Index of the most recent correct answerer, or null at round start. */
  lastAnswererIdx: number | null;
}

/** Connection/participation status of a player. */
export type PlayerStatus = 'connected' | 'disconnected' | 'spectating';

/** A player in a room/game. */
export interface Player {
  /** Stable player id (session-scoped). */
  id: string;
  /** Display nickname. */
  nickname: string;
  /** Seat index in the room (turn rotation order). */
  seatIdx: number;
  /** Cumulative score across rounds. */
  score: number;
  /** Ready toggle in the lobby. */
  ready: boolean;
  /** Whether this player is the host. */
  isHost: boolean;
  /** Connection/participation status. */
  status: PlayerStatus;
}

/**
 * Room settings, mirroring `roomDefaults` in `config/balance.json`.
 * Chosen by the host in the waiting room.
 */
export interface Settings {
  /** Display title shown in the public room list. */
  title?: string;
  /** Whether the room is publicly listed. */
  isPublic: boolean;
  /** Optional room password (undefined/empty = no password). */
  password?: string;
  /** Number of rounds (one of `roundsOptions`). */
  rounds: number;
  /** Round-clock duration in seconds (one of `roundTimeOptions`). */
  roundTimeSec: number;
  /** Base turn-clock duration in seconds (within `[turnTimeMin, turnTimeMax]`). */
  turnTimeSec: number;
  /** Per-turn decay factor `r`. */
  decayR: number;
  /** Region scope for the game (e.g. `capital`). */
  region: string;
  /** Line tier filters that are enabled (intersected with region). */
  tierFilter: LineTier[];
}

/** Reason a submitted answer was rejected. */
export type JudgmentRejectReason = 'notFound' | 'duplicate' | 'lineMismatch';

/**
 * Result of judging a submitted answer against current {@link GameState}
 * (produced by `judgment.ts`, Wave 2). On success, carries the resolved
 * station index and the next active line mask; on failure, carries `reason`.
 */
export interface JudgmentResult {
  /** Whether the answer is a valid next station. */
  valid: boolean;
  /** True when the accepted station narrowed the active line set (a transfer). */
  transfer?: boolean;
  /** The active line mask after accepting this station. */
  newActiveMask?: bigint;
  /** The resolved integer `stationIdx` of the accepted station. */
  stationIdx?: number;
  /** Rejection reason (present only when `valid` is false). */
  reason?: JudgmentRejectReason;
}
