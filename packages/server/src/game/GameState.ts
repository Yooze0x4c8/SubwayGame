/**
 * Engine-runtime state container for the SUBWAY server game engine (plan §5).
 *
 * This module holds the *runtime* extensions to the shared {@link GameState}
 * contract: the per-player score/status table the rotation logic reads, plus the
 * small result records the engine emits when a round or the game ends. The engine
 * itself (`engine.ts`) owns all transitions; this file is pure data shapes and a
 * factory for the initial per-round state.
 *
 * All identifiers are integer `stationIdx` / seat indices (never slugs). Deadlines
 * are absolute epoch milliseconds so the engine stays deterministic under an
 * injected `now()`.
 */

import type { GameState } from '@subway/shared';

/**
 * Engine-side participation status of a player.
 *
 * - `active`     — in the turn rotation.
 * - `disconnected` — dropped but inside the 30s grace window; still counted in
 *   rotation (their live turn simply times out = normal sudden-death fail).
 * - `spectator`  — grace expired; excluded from rotation entirely.
 */
export type EnginePlayerStatus = 'active' | 'disconnected' | 'spectator';

/** A player as tracked by the engine (score + rotation status). */
export interface EnginePlayer {
  /** Stable player id (session-scoped). */
  id: string;
  /** Display nickname. */
  nickname: string;
  /** Seat index — position in the turn rotation order. */
  seatIdx: number;
  /** Cumulative score across all rounds. */
  score: number;
  /** Participation status (drives rotation eligibility). */
  status: EnginePlayerStatus;
  /** Whether this player is the room host (host handover on disconnect). */
  isHost: boolean;
  /**
   * Absolute epoch ms at which the disconnect grace expires, or `null` when the
   * player is not in a disconnected-grace window.
   */
  disconnectDeadline: number | null;
}

/** Options for constructing an {@link EnginePlayer}. */
export interface EnginePlayerInit {
  id: string;
  nickname: string;
  seatIdx: number;
  isHost?: boolean;
}

/** Build a fresh active player (score 0, no grace timer). */
export function createPlayer(init: EnginePlayerInit): EnginePlayer {
  return {
    id: init.id,
    nickname: init.nickname,
    seatIdx: init.seatIdx,
    score: 0,
    status: 'active',
    isHost: init.isHost ?? false,
    disconnectDeadline: null,
  };
}

/** A single player's score change within a round settlement. */
export interface PlayerDelta {
  /** Seat index of the affected player. */
  seatIdx: number;
  /** Score change applied this round (may be negative). */
  delta: number;
}

/** Why a round ended. */
export type RoundEndType = 'suddendeath' | 'complete';

/**
 * The result of a finished round (mirrors the `round:ended` payload the M4
 * transport layer will serialize).
 */
export interface RoundResult {
  /** 1-based round number that just ended. */
  round: number;
  /** How the round ended. */
  type: RoundEndType;
  /** Seat index of the failing player (sudden-death only; null on complete). */
  failerIdx: number | null;
  /** Per-player score deltas applied by this round's settlement. */
  deltas: PlayerDelta[];
  /** Number of turns played in the round (turnIndex at end). */
  turns: number;
  /** Station indices in traversal order, including the round's start station. */
  route: number[];
}

/** A single ranked entry in the final game result. */
export interface RankingEntry {
  /** Seat index of the player. */
  seatIdx: number;
  /** Player id. */
  id: string;
  /** Display nickname. */
  nickname: string;
  /** Final cumulative score. */
  score: number;
  /** 1-based rank (ties share the lower rank number). */
  rank: number;
}

/**
 * Build the shared {@link GameState} for the start of a round, before the start
 * station/line have been drawn. `startRound` in the engine fills in
 * `currentStationId` / `activeMask` / `usedLineMask` / clocks.
 */
export function createRoundState(round: number, startPlayerIdx: number): GameState {
  return {
    currentStationId: -1,
    activeMask: 0n,
    usedLineMask: 0n,
    used: new Set<number>(),
    round,
    turnIndex: 0,
    startPlayerIdx,
    roundDeadline: 0,
    turnDeadline: 0,
    turnLimitMs: 0,
    lastAnswererIdx: null,
  };
}
