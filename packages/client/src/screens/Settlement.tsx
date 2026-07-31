/**
 * Settlement (기획서 1H): round-ended overlay.
 *
 * Presented as a service notice posted over the platform: a danger rail across
 * the top when the round died on a timeout, then the affected party, the player
 * who closed it out, and everyone else — each as a row with its own colored rail
 * instead of an emoji banner. The jolt on a sudden death is the carriage lurching
 * to a stop (`sgJolt`), not a decorative shake.
 *
 * Phase two is the destination board drawing the next start station.
 *
 * Preserves: data-testid="round-ended-banner" (on the overlay root).
 * §12 invariants: NO 예상 점수, NO 차감액 배지.
 */

import { useEffect, useRef, useState } from 'react';

import type { RoundEndedPayload, PlayerSnapshot } from '@subway/shared';
import { useGameStore } from '../state/StoreProvider.js';
import { colors, fonts, radii, tracking, playerColor } from '../ui/theme.js';
import { LineRail } from '../ui/signage.js';
import { useIsMobile } from '../ui/responsive.js';

interface SettlementProps {
  result: RoundEndedPayload;
}

export function Settlement({ result }: SettlementProps): JSX.Element {
  // Selector returns a STABLE ref (players array or undefined); coalesce OUTSIDE
  // the selector — `?? []` inside would return a fresh array each render and
  // loop infinitely under zustand v5 (no default shallow compare).
  const players = useGameStore((s) => s.room?.players) ?? [];
  const [jolting, setJolting] = useState(false);
  const [phase, setPhase] = useState<'reveal' | 'nextRound'>('reveal');
  const [countdown, setCountdown] = useState(3);
  const didJoltRef = useRef(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (result.type === 'suddendeath' && !didJoltRef.current) {
      didJoltRef.current = true;
      setJolting(true);
      const t = setTimeout(() => setJolting(false), 560);
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
    <div
      data-testid="round-ended-banner"
      style={{
        // Visual-viewport sized, so the notice stays fully on screen even if the
        // round ends while the entry field still has the soft keyboard up.
        position: 'fixed',
        top: 'var(--app-viewport-top)',
        left: 0,
        right: 0,
        height: 'var(--app-height)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? 12 : 16,
        background: 'rgba(20, 24, 27, 0.58)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          maxHeight: 'calc(var(--app-height) - 24px)',
          display: 'flex',
          flexDirection: 'column',
          background: colors.panel,
          border: `1px solid ${colors.border}`,
          borderRadius: radii.lg,
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(20,24,27,0.3)',
          animation: jolting
            ? 'sgJolt 560ms ease-in-out'
            : 'sgPanelUp 280ms cubic-bezier(0.22,1,0.36,1) both',
        }}
      >
        {/* Notice rail: red for a timeout, line-2 green for a clean finish. */}
        <LineRail lineIds={isSudden ? ['sinbundang'] : ['seoul_2']} height={5} />

        <div
          style={
            isMobile
              ? { padding: '16px 16px 14px', overflowY: 'auto', minHeight: 0 }
              : { padding: '20px 20px 18px', overflowY: 'auto', minHeight: 0 }
          }
        >
          {phase === 'reveal' ? (
            <RevealPhase
              isSudden={isSudden}
              failer={failer}
              deltaRows={deltaRows}
              countdown={countdown}
              isMobile={isMobile}
            />
          ) : (
            <NextRoundPhase
              nextFirst={nextFirst}
              nextStartStation={result.nextStartStation}
              isMobile={isMobile}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Reveal phase ──────────────────────────────────────────────────────────────

interface DeltaRow { seatIdx: number; nickname: string; delta: number; label?: string; }

function RevealPhase({
  isSudden,
  failer,
  deltaRows,
  countdown,
  isMobile,
}: {
  isSudden: boolean;
  failer: PlayerSnapshot | undefined;
  deltaRows: DeltaRow[];
  countdown: number;
  isMobile: boolean;
}): JSX.Element {
  const failerRow = deltaRows.find((r) => r.label === '실패');
  const enderRow = deltaRows.find((r) => r.label === '끝내기!');
  const otherRows = deltaRows.filter((r) => !r.label);

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div style={styles.noticeLabel}>{isSudden ? '운행 중단' : '운행 종료'}</div>
        <h2 style={isMobile ? { ...styles.noticeTitle, fontSize: 23 } : styles.noticeTitle}>
          {isSudden ? '라운드 종료' : '라운드 완주'}
        </h2>
        <p style={styles.noticeBody}>
          {isSudden && failer
            ? `${failer.nickname}님이 시간 안에 다음 역을 입력하지 못했습니다.`
            : isSudden
              ? '시간 초과로 라운드가 종료되었습니다.'
              : '라운드 시계를 모두 소진해 완주로 종료되었습니다.'}
        </p>
      </div>

      {/* Failer */}
      {failerRow && (
        <ResultRow
          railColor={colors.danger}
          background={colors.dangerDim}
          name={failerRow.nickname}
          tag="시간 초과"
          tagColor={colors.danger}
          delta={failerRow.delta}
          deltaColor={colors.danger}
          emphasis
        />
      )}

      {/* Ender */}
      {enderRow && (
        <ResultRow
          railColor={colors.accent}
          background={colors.accentDim}
          name={enderRow.nickname}
          tag="끝내기 보너스"
          tagColor={colors.accent}
          delta={enderRow.delta}
          deltaColor={colors.accent}
          emphasis
        />
      )}

      {/* Everyone else */}
      {otherRows.length > 0 && (
        <div style={styles.othersBlock}>
          {otherRows.map((row) => (
            <div key={row.seatIdx} style={styles.otherRow}>
              <span
                aria-hidden="true"
                style={{ ...styles.otherRail, background: playerColor(row.seatIdx) }}
              />
              <span style={styles.otherName}>{row.nickname}</span>
              <span
                style={{
                  ...styles.otherDelta,
                  color: row.delta >= 0 ? colors.accent : colors.danger,
                }}
              >
                {row.delta >= 0 ? '+' : ''}{row.delta}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={styles.countdown} aria-live="polite">
        {countdown > 0 ? `다음 라운드까지 ${countdown}초` : '준비 중'}
      </div>
    </>
  );
}

function ResultRow({
  railColor,
  background,
  name,
  tag,
  tagColor,
  delta,
  deltaColor,
  emphasis = false,
}: {
  railColor: string;
  background: string;
  name: string;
  tag: string;
  tagColor: string;
  delta: number;
  deltaColor: string;
  emphasis?: boolean;
}): JSX.Element {
  return (
    <div style={{ ...styles.resultRow, background }}>
      <span aria-hidden="true" style={{ ...styles.resultRail, background: railColor }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.resultName}>{name}</div>
        <div style={{ ...styles.resultTag, color: tagColor }}>{tag}</div>
      </div>
      <span
        style={{
          ...styles.resultDelta,
          color: deltaColor,
          fontSize: emphasis ? 22 : 18,
        }}
      >
        {delta >= 0 ? '+' : ''}{delta}
      </span>
    </div>
  );
}

// ── Next-round phase ──────────────────────────────────────────────────────────

function NextRoundPhase({
  nextFirst,
  nextStartStation,
  isMobile,
}: {
  nextFirst: PlayerSnapshot | undefined;
  nextStartStation: number | undefined;
  isMobile: boolean;
}): JSX.Element {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={styles.noticeLabel}>다음 운행</div>
        <h2 style={isMobile ? { ...styles.noticeTitle, fontSize: 23 } : styles.noticeTitle}>시작역 추첨</h2>
      </div>

      {/* Destination board cycling until the server names the station. */}
      <div style={styles.board}>
        <div style={styles.boardCaption}>출발역</div>
        <div style={styles.boardValue}>
          {nextStartStation !== undefined ? (
            <span style={{ fontFamily: fonts.body, fontWeight: 700, letterSpacing: tracking.ko }}>
              역 #{nextStartStation}
            </span>
          ) : (
            <span style={{ animation: 'sgShuffle 620ms steps(1) infinite' }}>
              환승역 추첨 중
            </span>
          )}
        </div>
        <div style={styles.boardHint}>환승역 중에서 무작위로 선정됩니다</div>
      </div>

      {/* Who leads off */}
      {nextFirst && (
        <div style={styles.leadOff}>
          <span
            aria-hidden="true"
            style={{ ...styles.otherRail, background: playerColor(nextFirst.seatIdx) }}
          />
          <span style={styles.leadOffName}>{nextFirst.nickname}</span>
          <span style={styles.leadOffTag}>선공</span>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  noticeLabel: {
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
    marginBottom: 5,
  },
  noticeTitle: {
    margin: 0,
    fontFamily: fonts.display,
    fontSize: 27,
    fontWeight: 400,
    letterSpacing: tracking.tight,
    color: colors.text,
  },
  noticeBody: {
    margin: '7px 0 0',
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 1.6,
    color: colors.textDim,
  },

  resultRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    padding: '11px 13px 11px 0',
    borderRadius: radii.md,
    marginBottom: 6,
    overflow: 'hidden',
  },
  resultRail: {
    width: 4,
    alignSelf: 'stretch',
    minHeight: 34,
    flexShrink: 0,
  },
  resultName: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: 700,
    color: colors.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  resultTag: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: tracking.ko,
  },
  resultDelta: {
    flexShrink: 0,
    fontFamily: fonts.mono,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
  },

  othersBlock: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
    paddingTop: 10,
    borderTop: `1px solid ${colors.borderLight}`,
  },
  otherRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '5px 9px 5px 0',
    borderRadius: radii.sm,
    background: colors.panelAlt,
    overflow: 'hidden',
  },
  otherRail: {
    width: 3,
    alignSelf: 'stretch',
    minHeight: 18,
    flexShrink: 0,
  },
  otherName: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: 600,
    color: colors.textDim,
  },
  otherDelta: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },

  countdown: {
    marginTop: 16,
    paddingTop: 12,
    borderTop: `1px solid ${colors.borderLight}`,
    textAlign: 'center',
    fontFamily: fonts.body,
    fontSize: 10,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
  },

  // Destination board
  board: {
    padding: '16px 16px 14px',
    borderRadius: radii.md,
    background: colors.panelAlt,
    border: `1px solid ${colors.border}`,
    textAlign: 'center',
    marginBottom: 10,
  },
  boardCaption: {
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: 500,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
    marginBottom: 8,
  },
  boardValue: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: 400,
    letterSpacing: tracking.tight,
    color: colors.text,
    lineHeight: 1.2,
  },
  boardHint: {
    marginTop: 8,
    fontFamily: fonts.body,
    fontSize: 10.5,
    color: colors.textMuted,
  },
  leadOff: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    padding: '9px 12px 9px 0',
    borderRadius: radii.md,
    border: `1px solid ${colors.border}`,
    background: colors.panel,
    overflow: 'hidden',
  },
  leadOffName: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: 600,
    color: colors.text,
  },
  leadOffTag: {
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: tracking.ko,
    color: colors.panel,
    background: colors.accent,
    borderRadius: 2,
    padding: '3px 6px',
  },
};
