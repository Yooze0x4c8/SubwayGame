/**
 * WaitingRoom (기획서 1G, minimal): player slots + ready toggle; host start.
 *
 * Host sees 시작 (enabled when ≥2 players). The room code is shown for sharing.
 * Settings editing is deferred to M7 — this is the minimal lobby for the slice.
 */

import { useGameClient, useGameStore } from '../state/StoreProvider.js';
import { colors, playerColor } from '../ui/theme.js';

export function WaitingRoom(): JSX.Element {
  const client = useGameClient();
  const room = useGameStore((s) => s.room);
  const mySeatIdx = useGameStore((s) => s.mySeatIdx);

  if (!room) return <div style={{ padding: 24, color: colors.textDim }}>방 정보를 불러오는 중…</div>;

  const me = mySeatIdx !== undefined ? room.players.find((p) => p.seatIdx === mySeatIdx) : undefined;
  const iAmHost = me?.isHost ?? false;
  const canStart = room.players.length >= 2;

  return (
    <div style={{ maxWidth: 520, margin: '6vh auto', padding: 24 }}>
      <h2 style={{ color: colors.text, marginBottom: 4 }}>대기실</h2>
      <div style={{ color: colors.textDim, marginBottom: 16 }}>
        입장 코드:{' '}
        <span data-testid="room-code" style={{ color: colors.accent, fontWeight: 800, fontSize: 20 }}>
          {room.code}
        </span>{' '}
        <span style={{ fontSize: 12 }}>(친구에게 공유)</span>
      </div>

      <div data-testid="player-slots" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[...room.players]
          .sort((a, b) => a.seatIdx - b.seatIdx)
          .map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 10,
                background: colors.panel,
                border: `2px solid ${p.ready ? colors.accent : 'transparent'}`,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.text }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    background: playerColor(p.seatIdx),
                    display: 'inline-block',
                  }}
                />
                {p.nickname}
                {p.isHost && <span style={{ color: colors.warn, fontSize: 12 }}>방장</span>}
                {p.seatIdx === mySeatIdx && (
                  <span style={{ color: colors.textDim, fontSize: 12 }}>(나)</span>
                )}
              </span>
              <span style={{ color: p.ready ? colors.accent : colors.textDim, fontWeight: 700 }}>
                {p.ready ? '준비완료' : '대기중'}
              </span>
            </div>
          ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button
          data-testid="ready-toggle"
          onClick={() => client.setReady(!(me?.ready ?? false))}
          style={{
            ...btn,
            flex: 1,
            background: me?.ready ? colors.panelAlt : colors.accent,
            color: me?.ready ? colors.textDim : '#04140b',
          }}
        >
          {me?.ready ? '준비 취소' : '준비'}
        </button>
        {iAmHost && (
          <button
            data-testid="start-game"
            disabled={!canStart}
            onClick={() => client.startGame()}
            style={{
              ...btn,
              flex: 1,
              background: canStart ? colors.accent : colors.panelAlt,
              color: canStart ? '#04140b' : colors.textDim,
              cursor: canStart ? 'pointer' : 'not-allowed',
            }}
          >
            시작 {canStart ? '' : '(2인 이상)'}
          </button>
        )}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  padding: '12px 18px',
  borderRadius: 10,
  border: 'none',
  cursor: 'pointer',
};
