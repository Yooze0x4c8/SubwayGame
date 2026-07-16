/**
 * DualClock (기획서 2a, §12): two countdown bars derived from absolute deadlines.
 *
 *  - Round clock: thin grey bar, keeps flowing across turns (roundDeadline).
 *  - Turn clock: thick bar, resets every turn (turnDeadline).
 *
 * Both are DISPLAY-ONLY: we never store elapsed time; we diff the absolute
 * server deadline against a client clock ticked ~10x/sec. Per §12: no 차감액
 * 배지, no 예상 점수.
 */

import { useEffect, useRef, useState } from 'react';

import { colors } from '../ui/theme.js';

/** A ~100ms client clock (display only; never authoritative). */
function useNow(intervalMs = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

interface DualClockProps {
  roundDeadline: number;
  turnDeadline: number;
  /** Baseline for the turn bar's full width (the turn's total duration ms). */
  turnLimitMs?: number;
  /** Baseline for the round bar's full width (the round's total duration ms). */
  roundLimitMs?: number;
}

function remaining(deadline: number, now: number): number {
  return Math.max(0, deadline - now);
}

export function DualClock({
  roundDeadline,
  turnDeadline,
  turnLimitMs,
  roundLimitMs,
}: DualClockProps): JSX.Element {
  const now = useNow();

  // Track the widest span we have seen so the bar starts full and drains.
  const turnSpanRef = useRef(turnLimitMs ?? 0);
  const roundSpanRef = useRef(roundLimitMs ?? 0);

  const turnRem = remaining(turnDeadline, now);
  const roundRem = remaining(roundDeadline, now);

  if (turnRem > turnSpanRef.current) turnSpanRef.current = turnRem;
  if (roundRem > roundSpanRef.current) roundSpanRef.current = roundRem;

  const turnPct = turnSpanRef.current > 0 ? (turnRem / turnSpanRef.current) * 100 : 0;
  const roundPct = roundSpanRef.current > 0 ? (roundRem / roundSpanRef.current) * 100 : 0;

  return (
    <div data-testid="dual-clock" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Round clock — thin grey, keeps flowing. */}
      <div data-testid="round-clock" title="라운드 잔여">
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: colors.panelAlt,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${roundPct}%`,
              height: '100%',
              background: colors.roundBar,
              transition: 'width 120ms linear',
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: colors.textDim, marginTop: 2 }}>
          라운드 {Math.ceil(roundRem / 1000)}s
        </div>
      </div>

      {/* Turn clock — thick, resets each turn. */}
      <div data-testid="turn-clock" title="내 차례">
        <div
          style={{
            height: 14,
            borderRadius: 7,
            background: colors.panelAlt,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${turnPct}%`,
              height: '100%',
              background: turnRem < 3000 ? colors.danger : colors.turnBar,
              transition: 'width 120ms linear',
            }}
          />
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, marginTop: 2 }}>
          {Math.ceil(turnRem / 1000)}s
        </div>
      </div>
    </div>
  );
}
