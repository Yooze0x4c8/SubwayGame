/**
 * Ended (minimal): final ranking display so a full game reads to completion.
 * Settlement/Result polish (기획서 Result screen) is M6.
 */

import { useGameStore } from '../state/StoreProvider.js';
import { colors } from '../ui/theme.js';

export function Ended(): JSX.Element {
  const result = useGameStore((s) => s.gameResult);
  const room = useGameStore((s) => s.room);

  const ranking = result?.ranking ?? [];

  return (
    <div style={{ maxWidth: 480, margin: '8vh auto', padding: 24 }}>
      <h2 style={{ color: colors.accent }}>게임 종료</h2>
      {ranking.length === 0 ? (
        <div style={{ color: colors.textDim }}>결과를 집계하는 중…</div>
      ) : (
        <div data-testid="final-ranking" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ranking.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: 10,
                background: r.rank === 1 ? colors.accentDim : colors.panel,
                border: `2px solid ${r.rank === 1 ? colors.accent : 'transparent'}`,
              }}
            >
              <span style={{ color: colors.text, fontWeight: 700 }}>
                {r.rank}위 · {r.nickname}
              </span>
              <span style={{ color: colors.text, fontWeight: 800 }}>{r.score}</span>
            </div>
          ))}
        </div>
      )}
      {room && (
        <div style={{ color: colors.textDim, fontSize: 12, marginTop: 16 }}>
          방 코드 {room.code}
        </div>
      )}
    </div>
  );
}
