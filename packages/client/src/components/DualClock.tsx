/**
 * DualClock (기획서 2a, §12): two countdown bars derived from absolute deadlines.
 *
 *  - Round clock: thin grey bar, keeps flowing across turns (roundDeadline).
 *  - Turn clock: thick **red** bar, resets every turn (turnDeadline).
 *    Per wireframe: turn bar is red (sinbundang color), not blue.
 *
 * Both are DISPLAY-ONLY. Per §12: no 차감액 배지, no 예상 점수.
 * Preserves: data-testid="dual-clock", "round-clock", "turn-clock".
 */

import { useEffect, useRef, useState } from 'react';

import { colors, fonts, radii } from '../ui/theme.js';

/** A ~100 ms client clock (display only; never authoritative). */
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

  const turnSecs = Math.ceil(turnRem / 1000);
  const roundSecs = Math.ceil(roundRem / 1000);
  const turnCritical = turnRem > 0 && turnRem < 4000;
  const roundLow = roundRem > 0 && roundRem < 20000;

  return (
    <div
      data-testid="dual-clock"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '10px 0 4px',
      }}
    >
      {/* Round clock — thin grey, keeps flowing. */}
      <div data-testid="round-clock" title="라운드 잔여">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={labelStyle}>라운드</span>
          <div style={trackStyleThin}>
            <div
              style={{
                width: `${roundPct}%`,
                height: '100%',
                background: roundLow ? colors.warn : colors.roundBar,
                borderRadius: radii.full,
                transition: 'width 120ms linear, background 400ms ease',
              }}
            />
          </div>
          <span style={{
            ...timerSmallStyle,
            color: roundLow ? colors.warn : colors.textDim,
            transition: 'color 400ms ease',
          }}>
            {roundSecs}s
          </span>
        </div>
      </div>

      {/* Turn clock — thick RED bar, resets each turn (matches wireframe). */}
      <div data-testid="turn-clock" title="남은 시간">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ ...labelStyle, color: turnCritical ? colors.danger : colors.textDim }}>
            내 차례
          </span>
          <div style={trackStyleThick}>
            <div
              style={{
                width: `${turnPct}%`,
                height: '100%',
                background: colors.turnBar,
                borderRadius: radii.full,
                transition: 'width 120ms linear',
              }}
            />
          </div>
          <span style={{
            ...timerLargeStyle,
            color: colors.danger,
            fontWeight: turnCritical ? 900 : 700,
          }}>
            {turnSecs}s
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: fonts.mono,
  letterSpacing: '0.08em',
  color: colors.textDim,
  minWidth: 56,
  lineHeight: 1,
};

const trackStyleThin: React.CSSProperties = {
  flex: 1,
  height: 6,
  borderRadius: radii.full,
  background: colors.panelAlt,
  overflow: 'hidden',
  border: `1px solid ${colors.border}`,
};

const trackStyleThick: React.CSSProperties = {
  flex: 1,
  height: 14,
  borderRadius: radii.full,
  background: colors.panel,
  overflow: 'hidden',
  border: `1px solid ${colors.text}`,
};

const timerSmallStyle: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontWeight: 600,
  fontSize: 12,
  minWidth: 34,
  textAlign: 'right',
  lineHeight: 1,
};

const timerLargeStyle: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: 16,
  minWidth: 38,
  textAlign: 'right',
  lineHeight: 1,
};
