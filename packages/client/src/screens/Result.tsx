/**
 * Result (기획서 1I): final ranking + 우승 하이라이트 + 다시하기/나가기.
 *
 * Visual spec:
 *   - Ranking bar chart (score bars, proportional width)
 *   - 1위 highlighted with gold accent + animation
 *   - 다시하기 (return to waiting room) / 나가기 (back to landing)
 *   - Note: 막판 ×1.5 badge REMOVED per §11/§12.
 *
 * Preserves: data-testid="final-ranking".
 * Replaces: Ended.tsx (which is kept as a fallback import alias).
 */

import { useEffect, useState } from 'react';

import { useGameStore } from '../state/StoreProvider.js';
import { colors, fonts, radii, playerColor } from '../ui/theme.js';

// Medal labels
const MEDALS = ['🥇', '🥈', '🥉'];

// Inject winner keyframes once
const WIN_KF_ID = 'subway-winner-kf';
function ensureKeyframes(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(WIN_KF_ID)) return;
  const s = document.createElement('style');
  s.id = WIN_KF_ID;
  s.textContent = `
    @keyframes winnerReveal {
      0%   { opacity: 0; transform: scale(0.85) translateY(12px); }
      60%  { opacity: 1; transform: scale(1.04) translateY(-2px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes barGrow {
      from { width: 0; }
    }
    @keyframes rankFadeIn {
      from { opacity: 0; transform: translateX(-12px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      @keyframes winnerReveal { from { opacity: 0; } to { opacity: 1; } }
      @keyframes barGrow { from { width: 0; } }
      @keyframes rankFadeIn { from { opacity: 0; } to { opacity: 1; } }
    }
  `;
  document.head.appendChild(s);
}

export function Result(): JSX.Element {
  const result = useGameStore((s) => s.gameResult);
  const room = useGameStore((s) => s.room);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    ensureKeyframes();
    // Stagger the reveal slightly for impact
    const t = setTimeout(() => setRevealed(true), 120);
    return () => clearTimeout(t);
  }, []);

  const ranking = result?.ranking ?? [];
  const maxScore = ranking.length > 0 ? Math.max(...ranking.map((r) => r.score), 1) : 1;
  const winner = ranking.find((r) => r.rank === 1);

  // Reload: refresh page (simplest reconnect for MVP)
  const handleRestart = (): void => {
    window.location.reload();
  };
  const handleLeave = (): void => {
    window.location.reload();
  };

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        {/* Wordmark */}
        <div style={styles.wordmarkRow}>
          <span style={styles.wordmark}>
            SUB<span style={{ color: colors.accent }}>WAY</span>
          </span>
          <span style={styles.gameOverLabel}>게임 종료</span>
        </div>

        {/* Winner highlight */}
        {winner && revealed && (
          <div style={styles.winnerBlock}>
            <div style={styles.winnerCrown}>🏆</div>
            <div style={styles.winnerName}>{winner.nickname}</div>
            <div style={styles.winnerScore}>
              <span style={styles.winnerScoreNum}>{winner.score}</span>
              <span style={styles.winnerScoreUnit}>점</span>
            </div>
            <div style={styles.winnerLabel}>우승</div>
          </div>
        )}

        {/* Ranking bars */}
        {ranking.length === 0 ? (
          <div style={{ color: colors.textDim, textAlign: 'center', padding: '24px 0' }}>
            결과를 집계하는 중…
          </div>
        ) : (
          <div
            data-testid="final-ranking"
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            {ranking.map((r, idx) => {
              const pColor = playerColor(r.seatIdx ?? idx);
              const barPct = maxScore > 0 ? (r.score / maxScore) * 100 : 0;
              const isWinner = r.rank === 1;
              const delay = `${idx * 80}ms`;

              return (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    opacity: revealed ? 1 : 0,
                    animation: revealed
                      ? `rankFadeIn 300ms cubic-bezier(0.16,1,0.3,1) ${delay} forwards`
                      : undefined,
                  }}
                >
                  {/* Rank + medal */}
                  <div style={{ minWidth: 32, textAlign: 'center' }}>
                    {MEDALS[r.rank - 1] ? (
                      <span style={{ fontSize: 20 }}>{MEDALS[r.rank - 1]}</span>
                    ) : (
                      <span style={{
                        fontFamily: fonts.mono,
                        fontSize: 14,
                        fontWeight: 700,
                        color: colors.textDim,
                      }}>
                        {r.rank}
                      </span>
                    )}
                  </div>

                  {/* Name + bar */}
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 4,
                    }}>
                      <span style={{
                        fontFamily: fonts.body,
                        fontSize: 13,
                        fontWeight: isWinner ? 700 : 500,
                        color: isWinner ? colors.text : colors.textDim,
                      }}>
                        {r.nickname}
                      </span>
                      <span style={{
                        fontFamily: fonts.mono,
                        fontSize: 14,
                        fontWeight: 800,
                        color: isWinner ? colors.accent : colors.textDim,
                      }}>
                        {r.score}
                      </span>
                    </div>
                    {/* Score bar */}
                    <div style={{
                      height: isWinner ? 10 : 7,
                      borderRadius: radii.full,
                      background: colors.panelAlt,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${barPct}%`,
                        background: isWinner ? colors.accent : pColor,
                        borderRadius: radii.full,
                        animation: revealed
                          ? `barGrow 600ms cubic-bezier(0.16,1,0.3,1) ${delay} both`
                          : undefined,
                        opacity: isWinner ? 1 : 0.65,
                        boxShadow: isWinner ? `0 0 8px ${colors.accent}66` : 'none',
                      }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Room code */}
        {room && (
          <div style={{
            fontSize: 11,
            fontFamily: fonts.mono,
            color: colors.textMuted,
            textAlign: 'center',
            letterSpacing: '0.08em',
          }}>
            방 코드 {room.code}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            onClick={handleRestart}
            style={{
              ...styles.btn,
              flex: 1,
              background: colors.accent,
              color: '#04140b',
            }}
          >
            다시 하기
          </button>
          <button
            onClick={handleLeave}
            style={{
              ...styles.btn,
              flex: 1,
              background: colors.panelAlt,
              color: colors.textDim,
              border: `1px solid ${colors.border}`,
            }}
          >
            나가기
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '5vh 16px 32px',
    background: colors.bg,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.xl,
    padding: '24px 24px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  wordmarkRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: 400,
    color: colors.text,
    letterSpacing: '-0.02em',
  },
  gameOverLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  winnerBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px 0 16px',
    borderRadius: radii.lg,
    background: colors.accentDim,
    border: `1px solid ${colors.accent}44`,
    animation: 'winnerReveal 500ms cubic-bezier(0.16,1,0.3,1) forwards',
  },
  winnerCrown: {
    fontSize: 36,
    marginBottom: 8,
    lineHeight: 1,
  },
  winnerName: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.text,
    letterSpacing: '-0.01em',
    marginBottom: 6,
  },
  winnerScore: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 6,
  },
  winnerScoreNum: {
    fontFamily: fonts.mono,
    fontSize: 36,
    fontWeight: 800,
    color: colors.accent,
    lineHeight: 1,
  },
  winnerScoreUnit: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.textDim,
  },
  winnerLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: colors.accent,
    fontWeight: 700,
  },
  btn: {
    fontSize: 15,
    fontFamily: fonts.body,
    fontWeight: 700,
    padding: '13px 16px',
    borderRadius: radii.md,
    border: 'none',
    cursor: 'pointer',
    transition: 'opacity 160ms ease',
    lineHeight: 1,
  },
};
