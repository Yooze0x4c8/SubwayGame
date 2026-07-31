/**
 * DualClock (기획서 2a, §12): two countdown bars derived from absolute deadlines.
 *
 *  - Round clock: thin, grey, keeps flowing across turns (roundDeadline).
 *  - Turn clock: thick, red, resets every turn (turnDeadline).
 *
 * §12 requires the hierarchy to be carried by thickness and color, so that with
 * 5 seconds left there is exactly one bar you need to look at. Both are drawn as
 * platform-edge bars (see <SafetyBar>): square ends, and the drained portion
 * hatched like bare track rather than left as empty space.
 *
 * Both are DISPLAY-ONLY. Per §12: no 차감액 배지, no 예상 점수.
 * Preserves: data-testid="dual-clock", "round-clock", "turn-clock".
 */

import { useEffect, useRef, useState } from 'react';

import { useIsMobile } from '../ui/responsive.js';
import { colors, fonts, tracking } from '../ui/theme.js';
import { SafetyBar } from '../ui/signage.js';

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
  /** Most recent accepted-answer extension, used for the transient +1s effect. */
  roundTimeBonus?: { id: number; deltaMs: number };
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
  roundTimeBonus,
  turnLimitMs,
  roundLimitMs,
}: DualClockProps): JSX.Element {
  const now = useNow();
  // On a phone the two bars have to earn their vertical space: §12 already puts
  // the hierarchy in colour and thickness, so the 라운드 / 내 차례 captions are
  // PC-only chrome. The title attributes still name each bar.
  const isMobile = useIsMobile();

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
        gap: isMobile ? 6 : 8,
        padding: isMobile ? '4px 0 2px' : '8px 0 2px',
      }}
    >
      {/* Round clock — thin and grey; it keeps flowing across turns. */}
      <div
        data-testid="round-clock"
        title="라운드 잔여"
        style={{ display: 'flex', alignItems: 'center', gap: 10 }}
      >
        {!isMobile && <span style={labelStyle}>라운드</span>}
        <SafetyBar
          pct={roundPct}
          height={isMobile ? 4 : 5}
          color={roundLow ? colors.safety : colors.roundBar}
        />
        <span
          style={{
            ...readoutStyle,
            fontSize: 12,
            minWidth: isMobile ? 28 : 36,
            color: roundLow ? colors.text : colors.textDim,
            position: 'relative',
          }}
        >
          {roundSecs}s
          {roundTimeBonus && roundTimeBonus.deltaMs > 0 && (
            <span
              key={roundTimeBonus.id}
              data-testid="round-time-bonus"
              style={{
                position: 'absolute',
                right: 0,
                top: -4,
                color: colors.accent,
                fontSize: 12,
                fontWeight: 700,
                animation: 'sgScorePop 1.4s cubic-bezier(0.22, 1, 0.36, 1) forwards',
              }}
            >
              +{roundTimeBonus.deltaMs / 1000}s
            </span>
          )}
        </span>
      </div>

      {/* Turn clock — thick and red; this is the one that matters. */}
      <div
        data-testid="turn-clock"
        title="남은 시간"
        style={{ display: 'flex', alignItems: 'center', gap: 10 }}
      >
        {!isMobile && (
          <span style={{ ...labelStyle, color: turnCritical ? colors.danger : colors.textDim }}>
            내 차례
          </span>
        )}
        <div
          style={{
            flex: 1,
            display: 'flex',
            minWidth: 0,
            // Under 4 s the bar flashes like a closing-door warning.
            animation: turnCritical ? 'sgWarnFlash 700ms steps(1) infinite' : undefined,
          }}
        >
          <SafetyBar pct={turnPct} height={isMobile ? 12 : 14} color={colors.turnBar} />
        </div>
        <span
          style={{
            ...readoutStyle,
            fontSize: 17,
            minWidth: isMobile ? 32 : 40,
            color: colors.danger,
            fontWeight: turnCritical ? 700 : 600,
          }}
        >
          {turnSecs}s
        </span>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontFamily: fonts.body,
  fontWeight: 500,
  letterSpacing: tracking.ko,
  color: colors.textDim,
  minWidth: 52,
  lineHeight: 1,
  flexShrink: 0,
};

const readoutStyle: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontWeight: 600,
  textAlign: 'right',
  lineHeight: 1,
  flexShrink: 0,
  // Digits must not reflow the bar as they tick down.
  fontVariantNumeric: 'tabular-nums',
};
