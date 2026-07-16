/**
 * Settlement (기획서 1H): round-ended overlay.
 *
 * Visual spec:
 *   - Screen shake on suddendeath (CSS keyframe, prefers-reduced-motion respected)
 *   - 실패자 −D / 직전자 +20 끝내기! / 나머지 +5 breakdown
 *   - 다음 선공 + 시작역 추첨 연출 (animated dots countdown)
 *   - ≤3 s reveal phase then flip to nextRound phase
 *   - store clears roundResult on next round:started automatically
 *
 * Preserves: data-testid="round-ended-banner" (on the overlay root).
 * §12 invariants: NO 예상 점수, NO 차감액 배지.
 */

import { useEffect, useRef, useState } from 'react';

import type { RoundEndedPayload, PlayerSnapshot } from '@subway/shared';
import { useGameStore } from '../state/StoreProvider.js';
import { colors, fonts, radii, playerColor } from '../ui/theme.js';

// ── Keyframe injection ────────────────────────────────────────────────────────

const KEYFRAME_ID = 'subway-settlement-kf';
function ensureKeyframes(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAME_ID)) return;
  const s = document.createElement('style');
  s.id = KEYFRAME_ID;
  s.textContent = `
    @keyframes screenShake {
      0%   { transform: translate(0,0) rotate(0deg); }
      10%  { transform: translate(-6px,-3px) rotate(-0.5deg); }
      20%  { transform: translate(6px,3px) rotate(0.5deg); }
      30%  { transform: translate(-5px,2px) rotate(-0.3deg); }
      40%  { transform: translate(5px,-2px) rotate(0.3deg); }
      50%  { transform: translate(-3px,3px); }
      60%  { transform: translate(3px,-1px) rotate(0.2deg); }
      70%  { transform: translate(-2px,2px); }
      80%  { transform: translate(2px,-1px); }
      90%  { transform: translate(-1px,1px); }
      100% { transform: translate(0,0) rotate(0deg); }
    }
    @keyframes settleFadeIn {
      from { opacity:0; transform:translateY(20px) scale(0.96); }
      to   { opacity:1; transform:translateY(0) scale(1); }
    }
    @keyframes drawAttention {
      0%,100% { transform:scale(1); }
      40%     { transform:scale(1.08); }
    }
    @media (prefers-reduced-motion:reduce) {
      @keyframes screenShake  { 0%,100% { transform:none; } }
      @keyframes settleFadeIn { from { opacity:0; } to { opacity:1; } }
      @keyframes drawAttention { 0%,100% { transform:none; } }
    }
  `;
  document.head.appendChild(s);
}

// ── Component ─────────────────────────────────────────────────────────────────

interface SettlementProps {
  result: RoundEndedPayload;
}

export function Settlement({ result }: SettlementProps): JSX.Element {
  // Selector returns a STABLE ref (players array or undefined); coalesce OUTSIDE
  // the selector — `?? []` inside would return a fresh array each render and
  // loop infinitely under zustand v5 (no default shallow compare).
  const players = useGameStore((s) => s.room?.players) ?? [];
  const [shaking, setShaking] = useState(false);
  const [phase, setPhase] = useState<'reveal' | 'nextRound'>('reveal');
  const [countdown, setCountdown] = useState(3);
  const didShakeRef = useRef(false);

  useEffect(() => {
    ensureKeyframes();

    // Shake once on suddendeath
    if (result.type === 'suddendeath' && !didShakeRef.current) {
      didShakeRef.current = true;
      setShaking(true);
      const t = setTimeout(() => setShaking(false), 620);
      return () => clearTimeout(t);
    }
  }, [result.type]);

  // 3-second countdown → flip to nextRound phase
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((c) => {
        const next = c - 1;
        if (next <= 0) {
          clearInterval(tick);
          setPhase('nextRound');
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const isSudden = result.type === 'suddendeath';
  const failer = result.failerIdx !== undefined
    ? players.find((p) => p.seatIdx === result.failerIdx)
    : undefined;
  const nextFirst = result.nextFirstPlayerIdx !== undefined
    ? players.find((p) => p.seatIdx === result.nextFirstPlayerIdx)
    : undefined;

  // Build delta rows with labels
  interface DeltaRow {
    seatIdx: number;
    nickname: string;
    delta: number;
    label?: string;
  }
  const deltaRows: DeltaRow[] = result.deltas.map((d) => {
    const p = players.find((pl) => pl.seatIdx === d.seatIdx);
    const isFailer = d.seatIdx === result.failerIdx;
    // Heuristic: the ender gets +20 and is not the failer
    const isEnder = isSudden && !isFailer && d.delta === 20;
    return {
      seatIdx: d.seatIdx,
      nickname: p?.nickname ?? `P${d.seatIdx + 1}`,
      delta: d.delta,
      label: isFailer ? '실패' : isEnder ? '끝내기!' : undefined,
    };
  });

  return (
    <>
      {/* Screen-shake overlay (DOM-level, over everything) */}
      {shaking && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            animation: 'screenShake 0.6s ease-in-out',
            pointerEvents: 'none',
            zIndex: 998,
          }}
        />
      )}

      {/* Backdrop + card */}
      <div
        data-testid="round-ended-banner"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(11,14,19,0.88)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: 16,
        }}
      >
        <div style={{
          width: '100%',
          maxWidth: 400,
          background: colors.panel,
          border: `1px solid ${isSudden ? colors.danger : colors.accent}`,
          borderRadius: radii.xl,
          padding: '28px 24px 24px',
          animation: 'settleFadeIn 300ms cubic-bezier(0.16,1,0.3,1) forwards',
          boxShadow: isSudden
            ? `0 0 32px ${colors.danger}22, 0 8px 32px rgba(0,0,0,0.6)`
            : `0 0 24px ${colors.accent}18, 0 8px 32px rgba(0,0,0,0.6)`,
        }}>
          {phase === 'reveal' ? (
            <RevealPhase
              isSudden={isSudden}
              failer={failer}
              deltaRows={deltaRows}
              countdown={countdown}
            />
          ) : (
            <NextRoundPhase
              nextFirst={nextFirst}
              nextStartStation={result.nextStartStation}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ── Reveal phase ──────────────────────────────────────────────────────────────

interface DeltaRow { seatIdx: number; nickname: string; delta: number; label?: string; }

function RevealPhase({
  isSudden,
  failer,
  deltaRows,
  countdown,
}: {
  isSudden: boolean;
  failer: PlayerSnapshot | undefined;
  deltaRows: DeltaRow[];
  countdown: number;
}): JSX.Element {
  return (
    <>
      {/* Title */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          fontFamily: fonts.display,
          fontSize: 24,
          color: isSudden ? colors.danger : colors.accent,
          letterSpacing: '-0.01em',
          marginBottom: 4,
        }}>
          {isSudden ? '라운드 종료 · 실패' : '라운드 종료 · 완주'}
        </div>
        <div style={{ fontSize: 13, color: colors.textDim, fontFamily: fonts.body }}>
          {isSudden && failer
            ? `${failer.nickname}님이 시간 초과로 실패했습니다`
            : isSudden
              ? '시간 초과로 라운드가 종료되었습니다'
              : '라운드 시계 소진 — 완주 종료입니다'}
        </div>
      </div>

      {/* Score deltas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {deltaRows.map((row, idx) => {
          const isNeg = row.delta < 0;
          const isEnder = row.label === '끝내기!';
          const pColor = playerColor(row.seatIdx);
          return (
            <div
              key={row.seatIdx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: radii.md,
                background: isNeg ? colors.dangerDim : colors.accentDim,
                border: `1px solid ${isNeg ? colors.danger + '44' : colors.accent + '44'}`,
                animation: isEnder
                  ? `drawAttention 0.5s ease ${idx * 80 + 300}ms both`
                  : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 9, height: 9, borderRadius: '50%',
                  background: pColor, flexShrink: 0,
                }} />
                <span style={{
                  fontFamily: fonts.body, fontWeight: 600,
                  fontSize: 14, color: colors.text,
                }}>
                  {row.nickname}
                </span>
                {row.label && (
                  <span style={{
                    fontSize: 10, fontFamily: fonts.mono, fontWeight: 700,
                    color: isNeg ? colors.danger : colors.accent,
                    background: isNeg ? `${colors.danger}22` : `${colors.accent}22`,
                    border: `1px solid ${isNeg ? colors.danger + '55' : colors.accent + '55'}`,
                    borderRadius: radii.sm, padding: '2px 7px',
                    letterSpacing: '0.04em',
                  }}>
                    {row.label}
                  </span>
                )}
              </div>
              <span style={{
                fontFamily: fonts.mono, fontSize: 18, fontWeight: 800,
                color: isNeg ? colors.danger : colors.accent,
              }}>
                {isNeg ? '' : '+'}{row.delta}
              </span>
            </div>
          );
        })}
      </div>

      {/* Countdown */}
      <div style={{
        marginTop: 20, textAlign: 'center',
        fontFamily: fonts.mono, fontSize: 12,
        color: colors.textMuted, letterSpacing: '0.06em',
      }}>
        {countdown > 0 ? `다음 라운드까지 ${countdown}초…` : '준비 중…'}
      </div>
    </>
  );
}

// ── Next-round phase ──────────────────────────────────────────────────────────

function NextRoundPhase({
  nextFirst,
  nextStartStation,
}: {
  nextFirst: PlayerSnapshot | undefined;
  nextStartStation: number | undefined;
}): JSX.Element {
  const [dots, setDots] = useState(1);

  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d % 3) + 1), 420);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{
        fontFamily: fonts.display, fontSize: 22,
        color: colors.accent, marginBottom: 20,
        letterSpacing: '-0.01em',
      }}>
        다음 라운드 준비
      </div>

      {/* 시작역 추첨 연출 */}
      <div style={{
        background: colors.panelAlt,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.lg,
        padding: '20px 24px',
        marginBottom: 14,
      }}>
        <div style={{
          fontSize: 10, fontFamily: fonts.mono,
          letterSpacing: '0.14em', color: colors.textMuted,
          textTransform: 'uppercase', marginBottom: 12,
        }}>
          시작역 추첨
        </div>
        {/* Server sends stationIdx not name; show animated dots until next round:started */}
        <div style={{
          fontFamily: fonts.mono, fontSize: 22,
          color: colors.textDim, letterSpacing: '0.3em',
          animation: 'drawAttention 0.6s ease',
        }}>
          {'● '.repeat(dots).trim()}
        </div>
        {nextStartStation !== undefined && (
          <div style={{
            fontFamily: fonts.mono, fontSize: 11,
            color: colors.textMuted, marginTop: 6, letterSpacing: '0.04em',
          }}>
            역 #{nextStartStation}
          </div>
        )}
      </div>

      {/* 다음 선공 */}
      {nextFirst && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10, padding: '11px 16px',
          background: colors.panelAlt,
          border: `1px solid ${colors.border}`,
          borderRadius: radii.md,
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: playerColor(nextFirst.seatIdx),
          }} />
          <span style={{ fontSize: 14, fontFamily: fonts.body, color: colors.text, fontWeight: 600 }}>
            {nextFirst.nickname}
          </span>
          <span style={{
            fontSize: 10, fontFamily: fonts.mono,
            color: colors.accent, fontWeight: 700, letterSpacing: '0.06em',
          }}>
            선공
          </span>
        </div>
      )}
    </div>
  );
}
