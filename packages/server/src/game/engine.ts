/**
 * Deterministic server game engine for SUBWAY (plan §5, 기획서 §8 pseudocode).
 *
 * The engine is a pure state machine over an injected clock and rng:
 *   - `now(): number`  — absolute epoch ms (tests advance a fake clock).
 *   - `rng(): number`  — uniform in [0, 1) (tests use a seeded PRNG).
 *
 * There is NO `Date.now()` / `Math.random()` and NO real `setTimeout` inside the
 * engine. Deadlines are computed as absolute epoch ms; the M4 transport layer
 * schedules real timers against them and calls `onTurnTimeout()` / drives
 * `startTurn()`/round advancement. Grace expiry is likewise driven externally via
 * `expireGrace()`.
 *
 * The engine is bound to ONE region and a set of starting-line tiers at
 * construction. The loader index is nation-wide, so the constructor filters the
 * start pool to both while all masks stay region-local (cross-region homonyms
 * reject naturally in `judge`).
 *
 * Constants come exclusively from {@link BalanceConfig}; nothing is hardcoded.
 */

import type { BalanceConfig, LineTier, StationIndex, GameState } from '@subway/shared';
import { judge, answerScore, deduction, turnLimit } from '@subway/shared';

import type {
  EnginePlayer,
  EnginePlayerInit,
  RoundResult,
  RankingEntry,
  RoundEndType,
} from './GameState.js';
import { createPlayer, createRoundState } from './GameState.js';

// ---------------------------------------------------------------------------
// Public result shapes (mirror the `turn:*` / lifecycle payloads for M4)
// ---------------------------------------------------------------------------

/** Outcome of a successful {@link GameEngine.submit}. */
export interface TurnAccepted {
  ok: true;
  /** Resolved station index that was accepted. */
  station: number;
  /** True when the answer was reached via a transfer (narrowed the line set). */
  transfer: boolean;
  /** True when the answer opened a line not yet used this round. */
  newLine: boolean;
  /** Points added to the answering player. */
  scoreDelta: number;
  /** Seat index of the answering player. */
  byPlayerIdx: number;
}

/** Outcome of a rejected {@link GameEngine.submit} (state/clocks unchanged). */
export interface TurnRejected {
  ok: false;
  /** Why the answer was rejected. */
  reason: 'notFound' | 'duplicate' | 'lineMismatch' | 'wrongTurn' | 'notRunning';
}

/** Result of {@link GameEngine.submit}. */
export type SubmitResult = TurnAccepted | TurnRejected;

/** Injected dependencies for a {@link GameEngine}. */
export interface EngineDeps {
  /** Nation-wide loaded station index (region filtering happens internally). */
  index: StationIndex;
  /** Balance constants. */
  cfg: BalanceConfig;
  /** Region slug this engine is scoped to (e.g. `capital`). */
  region: string;
  /** Difficulty tiers eligible for the round's starting line and station. */
  tierFilter: readonly LineTier[];
  /** Total number of rounds in the game. */
  totalRounds: number;
  /** Injected epoch-ms clock (no `Date.now()` inside the engine). */
  now: () => number;
  /** Injected uniform rng in [0, 1) (no `Math.random()` inside the engine). */
  rng: () => number;
}

/** Overall engine phase. */
export type EnginePhase = 'idle' | 'round' | 'settling' | 'ended';

/**
 * The deterministic SUBWAY game engine. Construct with players + injected
 * clock/rng, then call {@link start}. The caller drives real time via
 * {@link startTurn}-triggered advancement and {@link onTurnTimeout}.
 */
export class GameEngine {
  private readonly index: StationIndex;
  private readonly cfg: BalanceConfig;
  private readonly region: string;
  private readonly totalRounds: number;
  private readonly now: () => number;
  private readonly rng: () => number;

  /** Region/tier-local starting line bits, each with its region station weight. */
  private readonly startPool: { bit: number; mask: bigint; weight: number }[];
  /** Region-local transfer stations per line bit. */
  private readonly transfersByLineBit: Map<number, number[]>;
  /**
   * Region-local ALL stations per line bit. Used as the start-station
   * pool for single-line regions that have zero transfer stations (대전), where a
   * transfer start is impossible — see the daejeon note in plan §6/§11.
   */
  private readonly stationsByLineBit: Map<number, number[]>;

  private readonly playerList: EnginePlayer[];
  private stateInternal: GameState;
  private phaseInternal: EnginePhase = 'idle';

  /** Accumulated round results (one per finished round). */
  private readonly roundResults: RoundResult[] = [];
  /** Final ranking, populated when the game ends. */
  private rankingInternal: RankingEntry[] = [];

  /** Set while {@link pause}d: the epoch ms at which the pause began. */
  private pausedAt: number | null = null;

  /**
   * The seat index that leads round 0. Subsequent rounds rotate from here across
   * the seated players (skipping spectators is a rotation concern, not this one —
   * the lead index simply cycles 0,1,2,… over the seat count).
   */
  private readonly initialStartPlayerIdx: number;

  constructor(players: EnginePlayerInit[], deps: EngineDeps) {
    if (players.length === 0) {
      throw new Error('GameEngine: needs at least one player');
    }
    if (deps.totalRounds < 1) {
      throw new Error('GameEngine: totalRounds must be >= 1');
    }
    this.index = deps.index;
    this.cfg = deps.cfg;
    this.region = deps.region;
    this.totalRounds = deps.totalRounds;
    this.now = deps.now;
    this.rng = deps.rng;

    this.playerList = players.map((p) => createPlayer(p));
    // If no host was flagged, the lowest seat is host by default.
    if (!this.playerList.some((p) => p.isHost)) {
      const first = this.playerList[0];
      if (first) first.isHost = true;
    }

    // --- Region/tier-scoped precompute (start pool + per-line station pools) ---
    const allowedTiers = new Set(deps.tierFilter);
    const startableBits = new Set<number>();
    const tierEligibleBits = new Set<number>();
    const transfersByLineBit = new Map<number, number[]>();
    const stationsByLineBit = new Map<number, number[]>();

    const push = (map: Map<number, number[]>, bit: number, idx: number): void => {
      const bucket = map.get(bit);
      if (bucket) bucket.push(idx);
      else map.set(bit, [idx]);
    };

    for (const rec of this.index.records) {
      if (rec.region !== this.region) continue;
      forEachBit(rec.startableLines, (bit) => {
        const tier = this.index.lineTierByBit.get(bit);
        if (tier && allowedTiers.has(tier)) startableBits.add(bit);
      });
      forEachBit(rec.lineMask, (bit) => {
        push(stationsByLineBit, bit, rec.idx);
        if (rec.isTransfer) push(transfersByLineBit, bit, rec.idx);
        const tier = this.index.lineTierByBit.get(bit);
        if (tier && allowedTiers.has(tier)) tierEligibleBits.add(bit);
      });
    }

    // Some tiers (notably capital/hardcore) contain only short lines marked
    // startable=0. Keep the tier selection meaningful by falling back to every
    // line in that tier when the normal startability threshold yields no line.
    const candidateBits = startableBits.size > 0 ? startableBits : tierEligibleBits;

    // Build the weighted starting-line pool. Weight = region station count on the
    // line. Every candidate line has ≥1 station, so weights are positive.
    const startPool: { bit: number; mask: bigint; weight: number }[] = [];
    for (const bit of [...candidateBits].sort((a, b) => a - b)) {
      const stations = stationsByLineBit.get(bit);
      if (!stations || stations.length === 0) continue;
      startPool.push({ bit, mask: 1n << BigInt(bit), weight: stations.length });
    }
    if (startPool.length === 0) {
      throw new Error(
        `GameEngine: region ${JSON.stringify(this.region)} has no line for tiers ` +
          JSON.stringify([...allowedTiers]),
      );
    }
    // Keep the draw pools deterministically sorted by idx for stable draws.
    for (const bucket of transfersByLineBit.values()) bucket.sort((a, b) => a - b);
    for (const bucket of stationsByLineBit.values()) bucket.sort((a, b) => a - b);

    this.startPool = startPool;
    this.transfersByLineBit = transfersByLineBit;
    this.stationsByLineBit = stationsByLineBit;

    this.initialStartPlayerIdx = 0;
    this.stateInternal = createRoundState(1, this.initialStartPlayerIdx);
  }

  // -------------------------------------------------------------------------
  // Read-only accessors
  // -------------------------------------------------------------------------

  /** The live shared game state (read-only view — do not mutate externally). */
  get state(): Readonly<GameState> {
    return this.stateInternal;
  }

  /** Current engine phase. */
  get phase(): EnginePhase {
    return this.phaseInternal;
  }

  /** Read-only view of the players. */
  get players(): readonly EnginePlayer[] {
    return this.playerList;
  }

  /** Seat index of the player whose turn it currently is. */
  get currentPlayerIdx(): number {
    return this.turnPlayerIdxInternal;
  }

  /** Accumulated finished-round results. */
  get results(): readonly RoundResult[] {
    return this.roundResults;
  }

  /** Final ranking (empty until the game ends). */
  get ranking(): readonly RankingEntry[] {
    return this.rankingInternal;
  }

  /** The seat index of the current host, or -1 if none. */
  get hostIdx(): number {
    const host = this.playerList.find((p) => p.isHost);
    return host ? host.seatIdx : -1;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Seat index whose turn is currently live. */
  private turnPlayerIdxInternal = 0;

  /** Start the game: begin round 1 (round counter is 1-based, index 0-based). */
  start(): void {
    if (this.phaseInternal !== 'idle') {
      throw new Error('GameEngine.start: already started');
    }
    this.startRound(0);
  }

  /**
   * Begin the round with 0-based `roundIndex`. Resets `used`, draws a new start
   * station/line (region-local, weighted), sets the round clock, and opens the
   * first turn.
   */
  private startRound(roundIndex: number): void {
    const startPlayerIdx = this.rotatedLead(roundIndex);
    const s = createRoundState(roundIndex + 1, startPlayerIdx);

    // --- Draw start line weighted by region station_count, then a transfer
    //     start station on that line. Tolerates a single-element pool (대전). ---
    const line = this.drawStartLine();
    const startStation = this.drawStartStation(line.bit);

    s.currentStationId = startStation;
    s.activeMask = line.mask;
    s.usedLineMask = line.mask;
    s.used.add(startStation);
    s.roundDeadline = this.now() + this.cfg.R0 * 1000;

    this.stateInternal = s;
    this.phaseInternal = 'round';
    // First turn goes to the round leader — skip to the nearest active seat.
    this.turnPlayerIdxInternal = this.firstActiveFrom(startPlayerIdx);
    this.startTurn();
  }

  /**
   * Open a turn. Gate: if the round clock has already expired, the round ends by
   * completion (완주 종료) with NO failer. Otherwise the current player receives a
   * FULL turn budget `turnLimit(turnIndex)` — which MAY extend past the round
   * deadline (two-clock model, plan §5).
   */
  startTurn(): void {
    if (this.phaseInternal !== 'round') return;
    const s = this.stateInternal;
    if (this.now() >= s.roundDeadline) {
      this.finishRound();
      return;
    }
    const turnLimitMs = turnLimit(s.turnIndex, this.cfg) * 1000;
    s.turnLimitMs = turnLimitMs;
    s.turnDeadline = this.now() + turnLimitMs;
  }

  /**
   * Submit an answer for `playerIdx`. Invalid answers return a rejection and do
   * NOT change state or clocks (time keeps running). Valid answers score the
   * player, advance the board and rotation, and open the next turn.
   */
  submit(playerIdx: number, text: string): SubmitResult {
    if (this.phaseInternal !== 'round') {
      return { ok: false, reason: 'notRunning' };
    }
    if (playerIdx !== this.turnPlayerIdxInternal) {
      return { ok: false, reason: 'wrongTurn' };
    }
    const s = this.stateInternal;

    const result = judge({
      index: this.index,
      currentIdx: s.currentStationId,
      activeMask: s.activeMask,
      used: s.used,
      text,
    });

    if (!result.valid) {
      // Rejected: no state/clock change — the turn clock keeps running.
      return { ok: false, reason: result.reason ?? 'notFound' };
    }

    const stationIdx = result.stationIdx!;
    const newActiveMask = result.newActiveMask!;
    const transfer = result.transfer === true;
    const newLine = (newActiveMask & ~s.usedLineMask) !== 0n;

    const remainingRatio = clamp(
      s.turnLimitMs > 0 ? (s.turnDeadline - this.now()) / s.turnLimitMs : 0,
      0,
      1,
    );

    const record = this.index.byId(stationIdx);
    const scoreDelta = answerScore(
      { syllables: record.syllables, transfer, newLine, remainingRatio },
      this.cfg,
    );

    const player = this.playerList[playerIdx]!;
    player.score += scoreDelta;

    // Advance board state.
    s.currentStationId = stationIdx;
    s.activeMask = newActiveMask;
    s.usedLineMask |= newActiveMask;
    s.used.add(stationIdx);
    s.lastAnswererIdx = playerIdx;
    s.turnIndex += 1;

    // Advance rotation to the next active player and open their turn.
    this.turnPlayerIdxInternal = this.nextActiveFrom(playerIdx);
    this.startTurn();

    return {
      ok: true,
      station: stationIdx,
      transfer,
      newLine,
      scoreDelta,
      byPlayerIdx: playerIdx,
    };
  }

  /**
   * The live turn timed out (sudden-death fail). Settles: failer −D, the last
   * correct answerer +finisherBonus (only if there is one), every other active
   * player +othersBonus. Then ends the round as `suddendeath`.
   */
  onTurnTimeout(): void {
    if (this.phaseInternal !== 'round') return;
    const s = this.stateInternal;
    const failerIdx = this.turnPlayerIdxInternal;

    const roundRemainingSec = Math.max(0, s.roundDeadline - this.now()) / 1000;
    const D = deduction(roundRemainingSec, this.cfg);

    const deltas = new Map<number, number>();
    const add = (seat: number, v: number): void => {
      deltas.set(seat, (deltas.get(seat) ?? 0) + v);
    };

    add(failerIdx, -D);
    // Finisher bonus only if there was a previous correct answerer this round.
    if (s.lastAnswererIdx !== null) {
      add(s.lastAnswererIdx, this.cfg.fail.finisherBonus);
    }
    // Everyone else who is active (not the failer, not the last answerer).
    for (const p of this.playerList) {
      if (p.status !== 'active') continue;
      if (p.seatIdx === failerIdx) continue;
      if (p.seatIdx === s.lastAnswererIdx) continue;
      add(p.seatIdx, this.cfg.fail.othersBonus);
    }

    this.applyDeltas(deltas);
    this.endRound('suddendeath', failerIdx, deltas);
  }

  /** Round clock expired at a turn boundary — completion, NO settlement. */
  private finishRound(): void {
    this.endRound('complete', null, new Map());
  }

  /**
   * Record the round result and either advance to the next round or end the game.
   */
  private endRound(type: RoundEndType, failerIdx: number | null, deltas: Map<number, number>): void {
    const s = this.stateInternal;
    this.roundResults.push({
      round: s.round,
      type,
      failerIdx,
      deltas: [...deltas.entries()].map(([seatIdx, delta]) => ({ seatIdx, delta })),
      turns: s.turnIndex,
      route: [...s.used],
    });

    const nextRoundIndex = s.round; // s.round is 1-based; index of next = s.round
    if (nextRoundIndex >= this.totalRounds) {
      this.phaseInternal = 'ended';
      this.rankingInternal = this.computeRanking();
      return;
    }
    this.startRound(nextRoundIndex);
  }

  // -------------------------------------------------------------------------
  // Pause / resume (settlement, staging, reconnect grace)
  // -------------------------------------------------------------------------

  /** Freeze the round (and turn) clocks: records the pause instant. */
  pause(): void {
    if (this.pausedAt !== null) return;
    this.pausedAt = this.now();
  }

  /**
   * Resume: shift the round deadline (and the turn deadline, if a turn is live)
   * forward by the paused duration so no time was consumed while paused.
   */
  resume(): void {
    if (this.pausedAt === null) return;
    const elapsed = this.now() - this.pausedAt;
    this.pausedAt = null;
    if (elapsed <= 0) return;
    const s = this.stateInternal;
    s.roundDeadline += elapsed;
    if (s.turnDeadline > 0) s.turnDeadline += elapsed;
  }

  // -------------------------------------------------------------------------
  // Disconnect / reconnect (plan §11)
  // -------------------------------------------------------------------------

  /**
   * Mark a player disconnected and start their 30s grace window. They remain in
   * the rotation during grace (a live turn simply times out normally). If the
   * host disconnects, the host role hands over to the next active player.
   */
  markDisconnected(playerIdx: number): void {
    const p = this.playerList[playerIdx];
    if (!p || p.status === 'spectator') return;
    p.status = 'disconnected';
    p.disconnectDeadline = this.now() + this.cfg.disconnectGraceMs;
    if (p.isHost) this.handoverHost(playerIdx);
  }

  /** Restore a disconnected player to active if still inside their grace. */
  reconnect(playerIdx: number): void {
    const p = this.playerList[playerIdx];
    if (!p) return;
    if (p.status !== 'disconnected') return;
    if (p.disconnectDeadline !== null && this.now() >= p.disconnectDeadline) {
      // Grace already elapsed — caller should have expired; do it now.
      this.expireGrace(playerIdx);
      return;
    }
    p.status = 'active';
    p.disconnectDeadline = null;
  }

  /**
   * Expire a disconnected player's grace → spectator (excluded from rotation).
   * If they held the current turn, rotation moves to the next active player. If
   * no active players remain, the game ends.
   */
  expireGrace(playerIdx: number): void {
    const p = this.playerList[playerIdx];
    if (!p || p.status !== 'disconnected') return;
    p.status = 'spectator';
    p.disconnectDeadline = null;

    if (!this.playerList.some((q) => q.status === 'active')) {
      // Room emptied of active players — end the game on current standings.
      this.phaseInternal = 'ended';
      this.rankingInternal = this.computeRanking();
      return;
    }
    // If the spectator was the live turn player, hand the turn onward.
    if (this.phaseInternal === 'round' && this.turnPlayerIdxInternal === playerIdx) {
      this.turnPlayerIdxInternal = this.nextActiveFrom(playerIdx);
      this.startTurn();
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Compute the round leader for 0-based `roundIndex`: cycles over seat count. */
  private rotatedLead(roundIndex: number): number {
    return (this.initialStartPlayerIdx + roundIndex) % this.playerList.length;
  }

  /**
   * Draw a start line from the region pool, weighted by station count. Every
   * pool line has ≥1 transfer station (guaranteed at construction), so weights
   * are strictly positive; `rng()` in [0,1) makes `roll < total`, guaranteeing a
   * hit before the loop ends.
   */
  private drawStartLine(): { bit: number; mask: bigint } {
    const total = this.startPool.reduce((sum, l) => sum + l.weight, 0);
    let roll = this.rng() * total;
    for (const l of this.startPool) {
      roll -= l.weight;
      if (roll < 0) return { bit: l.bit, mask: l.mask };
    }
    // Unreachable given positive weights + rng∈[0,1); satisfies the type checker.
    const last = this.startPool[this.startPool.length - 1]!;
    return { bit: last.bit, mask: last.mask };
  }

  /**
   * Draw a start station on the given line bit. Prefers transfer stations (per
   * §5 pseudocode); if the line has none — a single-line region like 대전 where a
   * transfer is impossible (plan §6/§11) — falls back to any station on the line.
   */
  private drawStartStation(lineBit: number): number {
    const transfers = this.transfersByLineBit.get(lineBit);
    const pool = transfers && transfers.length > 0
      ? transfers
      : this.stationsByLineBit.get(lineBit)!;
    const i = Math.floor(this.rng() * pool.length);
    return pool[i]!;
  }

  /** Nearest active seat at or after `from` (wrapping); falls back to `from`. */
  private firstActiveFrom(from: number): number {
    const n = this.playerList.length;
    for (let step = 0; step < n; step++) {
      const idx = (from + step) % n;
      if (this.playerList[idx]!.status === 'active') return idx;
    }
    return from;
  }

  /** Next active seat strictly after `from` (wrapping); falls back to `from`. */
  private nextActiveFrom(from: number): number {
    const n = this.playerList.length;
    for (let step = 1; step <= n; step++) {
      const idx = (from + step) % n;
      if (this.playerList[idx]!.status === 'active') return idx;
    }
    return from;
  }

  /** Apply a batch of score deltas to players. */
  private applyDeltas(deltas: Map<number, number>): void {
    for (const [seatIdx, delta] of deltas) {
      const p = this.playerList[seatIdx];
      if (p) p.score += delta;
    }
  }

  /** Hand the host role from `fromIdx` to the next active player. */
  private handoverHost(fromIdx: number): void {
    const from = this.playerList[fromIdx];
    const next = this.nextActiveFrom(fromIdx);
    if (next === fromIdx) return; // no other active player; keep flag as-is
    if (from) from.isHost = false;
    this.playerList[next]!.isHost = true;
  }

  /** Rank players by cumulative score (desc), assigning dense 1-based ranks. */
  private computeRanking(): RankingEntry[] {
    const sorted = [...this.playerList].sort((a, b) => b.score - a.score);
    const out: RankingEntry[] = [];
    let rank = 0;
    let prevScore: number | null = null;
    sorted.forEach((p, i) => {
      if (prevScore === null || p.score !== prevScore) rank = i + 1;
      prevScore = p.score;
      out.push({ seatIdx: p.seatIdx, id: p.id, nickname: p.nickname, score: p.score, rank });
    });
    return out;
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Clamp `v` into `[lo, hi]`. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Invoke `fn(bit)` for every set bit position in `mask` (non-negative). */
function forEachBit(mask: bigint, fn: (bit: number) => void): void {
  let m = mask;
  let bit = 0;
  while (m > 0n) {
    if ((m & 1n) === 1n) fn(bit);
    m >>= 1n;
    bit += 1;
  }
}
