import { useEffect, useState } from 'react';

import type { RoundRoutePayload } from '@subway/shared';

import { LINE_COLORS, LINE_COLOR_FALLBACK, LINE_SHORT_NAMES } from '../ui/lineColors.js';
import { colors, fonts, radii } from '../ui/theme.js';

interface RouteReplayModalProps {
  rounds: RoundRoutePayload[];
  onClose: () => void;
}

export function RouteReplayModal({ rounds, onClose }: RouteReplayModalProps): JSX.Element {
  const [roundIndex, setRoundIndex] = useState(0);
  const current = rounds[roundIndex];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') setRoundIndex((index) => Math.max(0, index - 1));
      if (event.key === 'ArrowRight') {
        setRoundIndex((index) => Math.min(rounds.length - 1, index + 1));
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, rounds.length]);

  if (!current) return <></>;

  const atFirstRound = roundIndex === 0;
  const atLastRound = roundIndex === rounds.length - 1;

  return (
    <div
      style={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="route-replay-title"
        style={styles.modal}
      >
        <div style={styles.header}>
          <div>
            <div style={styles.eyebrow}>ROUTE REPLAY</div>
            <h2 id="route-replay-title" style={styles.title}>라운드별 경로</h2>
          </div>
          <button type="button" aria-label="경로 리플레이 닫기" onClick={onClose} style={styles.closeButton}>
            ×
          </button>
        </div>

        <div style={styles.roundNavigation}>
          <button
            type="button"
            aria-label="이전 라운드"
            onClick={() => setRoundIndex((index) => index - 1)}
            disabled={atFirstRound}
            style={{ ...styles.navButton, opacity: atFirstRound ? 0.3 : 1 }}
          >
            &lt;
          </button>
          <div style={styles.roundHeading}>
            <strong style={styles.roundTitle}>{current.round}라운드</strong>
            <span style={styles.roundCount}>{roundIndex + 1} / {rounds.length}</span>
          </div>
          <button
            type="button"
            aria-label="다음 라운드"
            onClick={() => setRoundIndex((index) => index + 1)}
            disabled={atLastRound}
            style={{ ...styles.navButton, opacity: atLastRound ? 0.3 : 1 }}
          >
            &gt;
          </button>
        </div>

        <div style={styles.summary}>
          <span>{current.stops.length}개 역</span>
          <span style={styles.summaryDivider}>·</span>
          <span>{current.endType === 'complete' ? '완주 종료' : '시간 초과 종료'}</span>
        </div>

        <ol data-testid="round-route" style={styles.routeList}>
          {current.stops.map((stop, stopIndex) => {
            const isFirst = stopIndex === 0;
            const isLast = stopIndex === current.stops.length - 1;
            const lineColor = stop.stationLineNames
              .map((line) => LINE_COLORS[line])
              .find((color): color is string => color !== undefined) ?? LINE_COLOR_FALLBACK;

            return (
              <li key={`${stop.station}-${stopIndex}`} style={styles.stopRow}>
                <div style={styles.rail}>
                  <div style={{ ...styles.stopDot, borderColor: lineColor }}>
                    {stopIndex + 1}
                  </div>
                  {!isLast && <div style={{ ...styles.connector, background: lineColor }} />}
                </div>
                <div style={{ ...styles.stopCard, marginBottom: isLast ? 0 : 10 }}>
                  <div style={styles.stopHeader}>
                    <strong style={styles.stationName}>{stop.stationName}</strong>
                    {(isFirst || isLast) && (
                      <span style={styles.endpointLabel}>{isFirst ? '출발' : '도착'}</span>
                    )}
                  </div>
                  {stop.stationLineNames.length > 0 && (
                    <div style={styles.lineChips}>
                      {stop.stationLineNames.map((line) => (
                        <span
                          key={line}
                          style={{
                            ...styles.lineChip,
                            background: LINE_COLORS[line] ?? LINE_COLOR_FALLBACK,
                          }}
                        >
                          {LINE_SHORT_NAMES[line] ?? line}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    background: 'rgba(16, 20, 24, 0.62)',
    backdropFilter: 'blur(3px)',
  },
  modal: {
    width: '100%',
    maxWidth: 560,
    maxHeight: 'calc(100vh - 32px)',
    overflowY: 'auto',
    boxSizing: 'border-box',
    padding: '24px 24px 22px',
    borderRadius: radii.xl,
    border: `1px solid ${colors.border}`,
    background: colors.panel,
    boxShadow: '0 20px 60px rgba(0,0,0,0.26)',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingBottom: 16,
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  eyebrow: {
    marginBottom: 3,
    color: colors.info,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
  },
  title: {
    margin: 0,
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 27,
    fontWeight: 400,
  },
  closeButton: {
    width: 34,
    height: 34,
    flexShrink: 0,
    border: `1px solid ${colors.border}`,
    borderRadius: '50%',
    background: colors.panelAlt,
    color: colors.textDim,
    fontSize: 24,
    lineHeight: 1,
    cursor: 'pointer',
  },
  roundNavigation: {
    display: 'grid',
    gridTemplateColumns: '44px 1fr 44px',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
  },
  navButton: {
    width: 44,
    height: 40,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    background: colors.panelAlt,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 20,
    fontWeight: 800,
    cursor: 'pointer',
  },
  roundHeading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  roundTitle: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: 400,
  },
  roundCount: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  summary: {
    display: 'flex',
    justifyContent: 'center',
    margin: '10px 0 16px',
    color: colors.textDim,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  summaryDivider: {
    margin: '0 7px',
    color: colors.textMuted,
  },
  routeList: {
    margin: 0,
    padding: '16px 16px',
    listStyle: 'none',
    border: `1px solid ${colors.borderLight}`,
    borderRadius: radii.lg,
    background: colors.panelAlt,
  },
  stopRow: {
    display: 'grid',
    gridTemplateColumns: '36px minmax(0, 1fr)',
    gap: 10,
  },
  rail: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  stopDot: {
    width: 28,
    height: 28,
    boxSizing: 'border-box',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '4px solid',
    borderRadius: '50%',
    background: colors.panel,
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: 800,
  },
  connector: {
    width: 3,
    minHeight: 34,
    flex: 1,
    opacity: 0.65,
  },
  stopCard: {
    minWidth: 0,
    padding: '3px 2px 10px',
  },
  stopHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  stationName: {
    overflow: 'hidden',
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: 700,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  endpointLabel: {
    flexShrink: 0,
    padding: '2px 6px',
    borderRadius: radii.full,
    background: colors.panel,
    color: colors.textDim,
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: 700,
  },
  lineChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  lineChip: {
    padding: '2px 5px',
    borderRadius: 3,
    color: '#fff',
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: 700,
  },
};
