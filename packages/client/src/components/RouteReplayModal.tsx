/**
 * RouteReplayModal: the per-round run, replayed as a vertical route diagram.
 *
 * Drawn the way a metro map draws a line running down a page: line-colored
 * connectors between numbered station nodes and interchanges getting a badge
 * per line they serve.
 */

import { useEffect, useState } from 'react';

import type { RoundRoutePayload } from '@subway/shared';

import { LINE_COLORS, LINE_COLOR_FALLBACK } from '../ui/lineColors.js';
import { colors, fonts, radii, tracking } from '../ui/theme.js';
import { LineBadge, LineRail } from '../ui/signage.js';

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
      <div role="dialog" aria-modal="true" aria-label="라운드별 경로" style={styles.modal}>
        <LineRail lineIds={['seoul_2']} height={4} />

        <div style={styles.body}>
          <div style={styles.header}>
            <div>
              <div style={styles.noticeLabel}>운행 기록</div>
              <h2 style={styles.title}>라운드별 경로</h2>
            </div>
            <button
              type="button"
              aria-label="경로 리플레이 닫기"
              onClick={onClose}
              className="sg-btn"
              style={styles.closeButton}
            >
              ×
            </button>
          </div>

          {/* Round selector */}
          <div style={styles.roundNav}>
            <button
              type="button"
              aria-label="이전 라운드"
              onClick={() => setRoundIndex((index) => index - 1)}
              disabled={atFirstRound}
              className="sg-btn"
              style={{ ...styles.navButton, opacity: atFirstRound ? 0.3 : 1 }}
            >
              ←
            </button>
            <div style={styles.roundHeading}>
              <strong style={styles.roundTitle}>{current.round}라운드</strong>
              <span style={styles.roundMeta}>
                {roundIndex + 1}/{rounds.length}
                <span aria-hidden="true" style={styles.metaDot}>·</span>
                {current.stops.length}개 역
                <span aria-hidden="true" style={styles.metaDot}>·</span>
                {current.endType === 'complete' ? '완주' : '시간 초과'}
              </span>
            </div>
            <button
              type="button"
              aria-label="다음 라운드"
              onClick={() => setRoundIndex((index) => index + 1)}
              disabled={atLastRound}
              className="sg-btn"
              style={{ ...styles.navButton, opacity: atLastRound ? 0.3 : 1 }}
            >
              →
            </button>
          </div>

          {/* The run, top to bottom */}
          <ol data-testid="round-route" style={styles.routeList}>
            {current.stops.map((stop, stopIndex) => {
              const isFirst = stopIndex === 0;
              const isLast = stopIndex === current.stops.length - 1;
              const stopLineColor =
                stop.stationLineNames
                  .map((line) => LINE_COLORS[line])
                  .find((color): color is string => color !== undefined) ?? LINE_COLOR_FALLBACK;
              return (
                <li key={`${stop.station}-${stopIndex}`} style={styles.stopRow}>
                  {/* Diagram gutter */}
                  <div style={styles.gutter}>
                    <span style={{ ...styles.node, borderColor: stopLineColor }}>
                      {stopIndex + 1}
                    </span>
                    {!isLast && (
                      <span style={{ ...styles.connector, background: stopLineColor }} />
                    )}
                  </div>

                  {/* Station */}
                  <div style={{ ...styles.stop, paddingBottom: isLast ? 0 : 16 }}>
                    <div style={styles.stopHead}>
                      <strong style={styles.stationName}>{stop.stationName}</strong>
                      {(isFirst || isLast) && (
                        <span style={styles.endpointTag}>{isFirst ? '출발' : '종료'}</span>
                      )}
                    </div>
                    {stop.stationLineNames.length > 0 && (
                      <div style={styles.badges}>
                        {stop.stationLineNames.map((line) => (
                          <LineBadge key={line} lineId={line} size={17} />
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
    background: 'rgba(20, 24, 27, 0.6)',
  },
  modal: {
    width: '100%',
    maxWidth: 480,
    maxHeight: 'calc(100vh - 32px)',
    overflowY: 'auto',
    boxSizing: 'border-box',
    borderRadius: radii.lg,
    border: `1px solid ${colors.border}`,
    background: colors.panel,
    boxShadow: '0 24px 64px rgba(20,24,27,0.28)',
    animation: 'sgPanelUp 260ms cubic-bezier(0.22,1,0.36,1) both',
  },
  body: {
    padding: '20px 22px 22px',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingBottom: 14,
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  noticeLabel: {
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
    marginBottom: 4,
  },
  title: {
    margin: 0,
    fontFamily: fonts.display,
    fontSize: 25,
    fontWeight: 400,
    letterSpacing: tracking.tight,
    color: colors.text,
  },
  closeButton: {
    width: 30,
    height: 30,
    flexShrink: 0,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    background: colors.panelAlt,
    color: colors.textDim,
    fontSize: 20,
    lineHeight: 1,
  },
  roundNav: {
    display: 'grid',
    gridTemplateColumns: '38px 1fr 38px',
    alignItems: 'center',
    gap: 10,
    margin: '16px 0 6px',
  },
  navButton: {
    height: 34,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    background: colors.panelAlt,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: 700,
  },
  roundHeading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
  },
  roundTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: 400,
    letterSpacing: tracking.tight,
    color: colors.text,
  },
  roundMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
  },
  metaDot: {
    color: colors.border,
  },
  routeList: {
    margin: '14px 0 0',
    padding: '16px 14px',
    listStyle: 'none',
    border: `1px solid ${colors.borderLight}`,
    borderRadius: radii.md,
    background: colors.panelAlt,
  },
  stopRow: {
    display: 'grid',
    gridTemplateColumns: '26px minmax(0, 1fr)',
    gap: 12,
  },
  gutter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  node: {
    width: 24,
    height: 24,
    boxSizing: 'border-box',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '3px solid',
    borderRadius: '50%',
    background: colors.panel,
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: 700,
  },
  connector: {
    width: 3,
    minHeight: 26,
    flex: 1,
  },
  stop: {
    minWidth: 0,
    paddingTop: 1,
  },
  stopHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
  },
  stationName: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: 700,
    color: colors.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  endpointTag: {
    flexShrink: 0,
    padding: '2px 6px',
    borderRadius: 2,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    color: colors.textDim,
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: tracking.ko,
  },
  badges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 7,
  },
};
