/**
 * Observability layer for SUBWAY (plan §7 M8).
 *
 * Collects the four MVP completion-gate metrics:
 *   1. 라운드 평균 턴 수           — avg turns per round
 *   2. 실패 시점 라운드 잔여       — round-clock remaining (ms) at each sudden-death failure
 *   3. 완주 종료 비율               — fraction of rounds that ended by completion (not sudden-death)
 *   4. 플레이어별 평균 턴 소요시간 — per-seat mean time (ms) to submit a valid answer
 *
 * Data accumulates in-memory across the server process lifetime.
 * Query via `metrics.summary()` or HTTP GET /metrics (wired in index.ts).
 */

export interface TurnRecord {
  roomId: string;
  round: number;
  seatIdx: number;
  durationMs: number;
  outcome: 'accepted' | 'timeout';
}

export interface RoundRecord {
  roomId: string;
  round: number;
  type: 'suddendeath' | 'complete';
  turns: number;
  /** Round-clock ms remaining at the moment of failure. Sudden-death only. */
  roundRemainingMsAtFail?: number;
}

export interface MetricsSummary {
  /** 1. 라운드 평균 턴 수 (rounded to 1 dp) */
  avgTurnsPerRound: number;
  /** 2. 실패 시점 라운드 잔여 ms — one entry per sudden-death round */
  failRemainingMsDistribution: number[];
  /** 3. 완주 종료 비율 (0–1, rounded to 3 dp) */
  completionRatio: number;
  /** 4. 플레이어별 평균 턴 소요시간 (seatIdx → avg ms, accepted turns only) */
  avgTurnMsBySeat: Record<number, number>;
  totalRounds: number;
  completedRounds: number;
  suddenDeathRounds: number;
  totalTurns: number;
}

export class MetricsCollector {
  private readonly rounds: RoundRecord[] = [];
  private readonly turns: TurnRecord[] = [];

  recordRound(r: RoundRecord): void {
    this.rounds.push(r);
    const extra =
      r.type === 'suddendeath' && r.roundRemainingMsAtFail !== undefined
        ? ` failRemaining=${r.roundRemainingMsAtFail}ms`
        : '';
    console.log(
      `[metrics] round=${r.round} type=${r.type} turns=${r.turns}${extra} room=${r.roomId}`,
    );
  }

  recordTurn(t: TurnRecord): void {
    this.turns.push(t);
  }

  summary(): MetricsSummary {
    const totalRounds = this.rounds.length;
    const completedRounds = this.rounds.filter((r) => r.type === 'complete').length;
    const suddenDeathRounds = this.rounds.filter((r) => r.type === 'suddendeath').length;

    const avgTurnsPerRound =
      totalRounds === 0
        ? 0
        : this.rounds.reduce((s, r) => s + r.turns, 0) / totalRounds;

    const completionRatio = totalRounds === 0 ? 0 : completedRounds / totalRounds;

    const failRemainingMsDistribution = this.rounds
      .filter((r) => r.type === 'suddendeath' && r.roundRemainingMsAtFail !== undefined)
      .map((r) => r.roundRemainingMsAtFail!);

    // Per-seat average turn duration — accepted turns only (timeout = forfeiture, not "speed").
    const bySeat = new Map<number, number[]>();
    for (const t of this.turns) {
      if (t.outcome !== 'accepted') continue;
      const arr = bySeat.get(t.seatIdx) ?? [];
      arr.push(t.durationMs);
      bySeat.set(t.seatIdx, arr);
    }
    const avgTurnMsBySeat: Record<number, number> = {};
    for (const [seat, ds] of bySeat) {
      avgTurnMsBySeat[seat] = Math.round(ds.reduce((s, d) => s + d, 0) / ds.length);
    }

    return {
      avgTurnsPerRound: Math.round(avgTurnsPerRound * 10) / 10,
      failRemainingMsDistribution,
      completionRatio: Math.round(completionRatio * 1000) / 1000,
      avgTurnMsBySeat,
      totalRounds,
      completedRounds,
      suddenDeathRounds,
      totalTurns: this.turns.length,
    };
  }
}

/** Process-lifetime singleton shared by socket.ts and index.ts. */
export const metrics = new MetricsCollector();
