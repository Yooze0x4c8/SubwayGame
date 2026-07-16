/**
 * TurnOrderCards (기획서 2a): the turn-rotation strip.
 *
 * One card per seated player in seat order; the player whose turn is live is
 * highlighted with an "입력 중" tag. Each card shows the player's running score.
 */

import type { PlayerSnapshot } from '@subway/shared';

import { colors, playerColor } from '../ui/theme.js';

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
    <div data-testid="turn-order" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {ordered.map((p) => {
        const active = p.seatIdx === currentPlayerIdx;
        const isMe = p.seatIdx === mySeatIdx;
        return (
          <div
            key={p.id}
            data-testid={active ? 'turn-card-active' : 'turn-card'}
            style={{
              minWidth: 96,
              padding: '8px 10px',
              borderRadius: 10,
              background: active ? colors.accentDim : colors.panel,
              border: `2px solid ${active ? playerColor(p.seatIdx) : 'transparent'}`,
              opacity: p.status === 'connected' ? 1 : 0.5,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: colors.text,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  background: playerColor(p.seatIdx),
                  display: 'inline-block',
                }}
              />
              {p.nickname}
              {isMe && <span style={{ color: colors.textDim, fontSize: 11 }}>(나)</span>}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: colors.text }}>{p.score}</div>
            {active && (
              <div style={{ fontSize: 11, color: colors.accent, fontWeight: 700 }}>입력 중</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
