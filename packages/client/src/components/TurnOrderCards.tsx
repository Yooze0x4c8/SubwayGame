/**
 * TurnOrderCards (기획서 2a): the turn-rotation strip.
 *
 * Visual spec (§7 mock):
 *   - Current player: highlighted card with orange border + "⌨ 입력 중" tag.
 *   - Other cards: player name + score in mono.
 *   - Player color dot as identity accent.
 *
 * Preserves: data-testid="turn-order", "turn-card-active", "turn-card".
 */

import type { PlayerSnapshot } from '@subway/shared';

import { colors, fonts, radii, playerColor } from '../ui/theme.js';

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

  return (
    <div
      data-testid="turn-order"
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        paddingBottom: 4,
        paddingTop: 2,
      }}
    >
      {ordered.map((p) => {
        const active = p.seatIdx === currentPlayerIdx;
        const isMe = p.seatIdx === mySeatIdx;
        const pColor = playerColor(p.seatIdx);
        const disconnected = p.status !== 'connected';

        return (
          <div
            key={p.id}
            data-testid={active ? 'turn-card-active' : 'turn-card'}
            style={{
              flex: '0 0 auto',
              minWidth: 90,
              maxWidth: 120,
              padding: '10px 10px 8px',
              borderRadius: radii.md,
              background: active ? `${pColor}18` : colors.panel,
              border: `2px solid ${active ? pColor : colors.border}`,
              opacity: disconnected ? 0.45 : 1,
              transition: 'border-color 200ms ease, background 200ms ease',
              boxShadow: active ? `0 0 0 1px ${pColor}44` : 'none',
              position: 'relative',
            }}
          >
            {/* Player color + name */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              marginBottom: 4,
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: pColor,
                flexShrink: 0,
                boxShadow: active ? `0 0 6px ${pColor}` : 'none',
                transition: 'box-shadow 200ms',
              }} />
              <span style={{
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                fontFamily: fonts.body,
                color: active ? colors.text : colors.textDim,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 72,
              }}>
                {p.nickname}
                {isMe && (
                  <span style={{ color: colors.textMuted, fontSize: 10, marginLeft: 3 }}>나</span>
                )}
              </span>
            </div>

            {/* Score */}
            <div style={{
              fontSize: 17,
              fontWeight: 800,
              fontFamily: fonts.mono,
              color: active ? colors.text : colors.textDim,
              lineHeight: 1,
              marginBottom: active ? 5 : 0,
            }}>
              {p.score}
              <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 2, color: colors.textMuted }}>점</span>
            </div>

            {/* Active indicator */}
            {active && (
              <div style={{
                fontSize: 10,
                fontFamily: fonts.mono,
                color: pColor,
                fontWeight: 700,
                letterSpacing: '0.04em',
                marginTop: 2,
              }}>
                ⌨ 입력 중
              </div>
            )}

            {/* Disconnected indicator */}
            {disconnected && (
              <div style={{
                position: 'absolute',
                top: 4,
                right: 6,
                fontSize: 9,
                color: colors.textMuted,
                fontFamily: fonts.mono,
              }}>
                연결 끊김
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
