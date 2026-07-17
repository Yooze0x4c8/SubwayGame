/**
 * TurnOrderCards (기획서 2a): the turn-rotation strip.
 *
 * Visual spec (wireframe .pcard):
 *   - Active (.pcard.on): 2px orange border (line3 #EF7C1C), warm bg #FFFBF0,
 *     dark bold text, "⌨ 입력 중" label on top.
 *   - Next card: "다음" label, muted green, otherwise same as others.
 *   - Others (.pcard): 1px hair border (#E7E9EB), paper bg, ink-45 text.
 *   - No avatar circles — pure text layout, text-align center.
 *   - Score shown in IBM Plex Mono below name.
 *
 * Preserves: data-testid="turn-order", "turn-card-active", "turn-card".
 */

import type { PlayerSnapshot } from '@subway/shared';

import { colors, fonts, radii } from '../ui/theme.js';

interface TurnOrderCardsProps {
  players: PlayerSnapshot[];
  currentPlayerIdx: number | undefined;
  mySeatIdx: number | undefined;
}

export function TurnOrderCards({
  players,
  currentPlayerIdx,
  mySeatIdx,
}: TurnOrderCardsProps): JSX.Element {
  const ordered = [...players].sort((a, b) => a.seatIdx - b.seatIdx);

  // Find the index of the active player in the ordered array, to mark "다음".
  const activeOrdinalIdx = ordered.findIndex((p) => p.seatIdx === currentPlayerIdx);
  const nextOrdinalIdx =
    activeOrdinalIdx >= 0 ? (activeOrdinalIdx + 1) % ordered.length : -1;

  return (
    <div
      data-testid="turn-order"
      style={{
        display: 'flex',
        gap: 10,
        overflowX: 'auto',
        paddingBottom: 4,
        paddingTop: 2,
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
              minWidth: 88,
              padding: '10px 8px',
              borderRadius: radii.md,
              // Active: orange border + warm bg per wireframe
              border: active
                ? `2px solid ${colors.activeGold}`
                : `1px solid ${colors.borderLight}`,
              background: active ? colors.activeGoldBg : colors.bg,
              textAlign: 'center',
              opacity: disconnected ? 0.4 : 1,
              transition: 'border-color 180ms ease, background 180ms ease',
            }}
          >
            {/* Top label */}
            {active && (
              <div style={{
                fontSize: 11,
                fontFamily: fonts.mono,
                fontWeight: 700,
                color: colors.activeGold,
                marginBottom: 4,
                letterSpacing: '0.02em',
              }}>
                ⌨ 입력 중
              </div>
            )}
            {isNext && (
              <div style={{
                fontSize: 11,
                fontFamily: fonts.mono,
                fontWeight: 600,
                color: colors.accent,
                marginBottom: 4,
              }}>
                다음
              </div>
            )}
            {!active && !isNext && (
              /* spacer so cards keep same height */
              <div style={{ height: 15, marginBottom: 4 }} />
            )}

            {/* Player name */}
            <div style={{
              fontSize: 12,
              fontFamily: fonts.body,
              fontWeight: active ? 700 : 500,
              color: active ? colors.text : colors.textDim,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginBottom: 3,
            }}>
              {p.nickname}
              {isMe && (
                <span style={{ color: colors.textMuted, fontSize: 10, marginLeft: 3 }}>나</span>
              )}
            </div>

            {/* Score — IBM Plex Mono, small, muted */}
            <div style={{
              display: 'block',
              fontFamily: fonts.mono,
              fontSize: 11,
              color: colors.textMuted,
              marginTop: 0,
              opacity: 0.8,
            }}>
              {p.score}점
            </div>
          </div>
        );
      })}
    </div>
  );
}
