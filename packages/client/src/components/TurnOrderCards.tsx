/**
 * TurnOrderCards (기획서 2a): the turn-rotation strip.
 *
 * Each player is a small sign carrying their own color as a top rail, the way a
 * platform sign carries its line. Seeing who is up next matters more than seeing
 * the ranking (기획서 §7), so the strip stays in seat order and only the active
 * and next cards are called out.
 *
 * Active card follows the wireframe .pcard.on: 3호선 orange edge, warm face,
 * ink-weight name. Others are hairline signs on the concrete ground.
 *
 * Preserves: data-testid="turn-order", "turn-card-active", "turn-card".
 */

import type { PlayerSnapshot } from '@subway/shared';

import { colors, fonts, radii, tracking, playerColor } from '../ui/theme.js';
import { useIsMobile } from '../ui/responsive.js';

interface TurnOrderCardsProps {
  players: PlayerSnapshot[];
  turnOrder?: readonly number[];
  currentPlayerIdx: number | undefined;
  mySeatIdx: number | undefined;
}

export function TurnOrderCards({
  players,
  turnOrder,
  currentPlayerIdx,
  mySeatIdx,
}: TurnOrderCardsProps): JSX.Element {
  const isMobile = useIsMobile();
  const orderPosition = new Map<number, number>(
    (turnOrder ?? []).map((seatIdx, index) => [seatIdx, index] as const),
  );
  const ordered = [...players].sort((a, b) => {
    const aPosition = orderPosition.get(a.seatIdx);
    const bPosition = orderPosition.get(b.seatIdx);
    if (aPosition !== undefined && bPosition !== undefined) return aPosition - bPosition;
    if (aPosition !== undefined) return -1;
    if (bPosition !== undefined) return 1;
    return a.seatIdx - b.seatIdx;
  });

  const activeOrdinalIdx = ordered.findIndex((p) => p.seatIdx === currentPlayerIdx);
  const nextOrdinalIdx =
    activeOrdinalIdx >= 0 ? (activeOrdinalIdx + 1) % ordered.length : -1;

  return (
    <div
      data-testid="turn-order"
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        overscrollBehavior: 'contain',
        paddingBottom: 4,
        alignItems: 'stretch',
      }}
    >
      {ordered.map((p, idx) => {
        const active = p.seatIdx === currentPlayerIdx;
        const isNext = !active && idx === nextOrdinalIdx;
        const isMe = p.seatIdx === mySeatIdx;
        const disconnected = p.status !== 'connected';

        return (
          <div
            key={p.id}
            data-testid={active ? 'turn-card-active' : 'turn-card'}
            style={{
              flex: 1,
              minWidth: isMobile ? 66 : 84,
              borderRadius: radii.md,
              overflow: 'hidden',
              border: active
                ? `2px solid ${colors.activeGold}`
                : `1px solid ${colors.border}`,
              background: active ? colors.activeGoldBg : colors.panel,
              opacity: disconnected ? 0.42 : 1,
              transition: 'border-color 180ms ease, background 180ms ease',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* The player's rail — their color, the way a sign carries its line. */}
            <div
              aria-hidden="true"
              style={{
                height: active ? 4 : 3,
                background: active ? colors.activeGold : playerColor(p.seatIdx),
                opacity: active ? 1 : 0.75,
              }}
            />

            <div style={{ padding: isMobile ? '6px 5px 7px' : '8px 8px 9px', textAlign: 'center' }}>
              {/* Status line — fixed height so cards never jitter as the turn moves. */}
              <div style={{ height: isMobile ? 11 : 13, marginBottom: 4 }}>
                {active && (
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: fonts.body,
                      fontWeight: 700,
                      letterSpacing: tracking.ko,
                      color: colors.activeGold,
                    }}
                  >
                    입력 중
                  </span>
                )}
                {isNext && (
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: fonts.body,
                      fontWeight: 600,
                      letterSpacing: tracking.ko,
                      color: colors.textMuted,
                    }}
                  >
                    다음
                  </span>
                )}
              </div>

              <div
                style={{
                  fontSize: isMobile ? 11 : 12,
                  fontFamily: fonts.body,
                  fontWeight: active ? 700 : 500,
                  color: active ? colors.text : colors.textDim,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginBottom: 2,
                }}
              >
                {p.nickname}
                {isMe && (
                  <span
                    style={{
                      color: colors.textMuted,
                      fontSize: 9,
                      fontFamily: fonts.body,
                      marginLeft: 3,
                    }}
                  >
                    나
                  </span>
                )}
              </div>

              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: isMobile ? 10 : 11,
                  fontWeight: 600,
                  color: active ? colors.text : colors.textMuted,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {p.score}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
