/**
 * Result (기획서 1I): final ranking + 우승 하이라이트 + 다시하기/나가기.
 *
 * Visual spec (wireframe):
 *   - Light theme, white card on gray bg
 *   - Trophy icon + "최종 결과 · Rラウンド" title
 *   - Winner: large medal "1" + name + score highlighted in gold
 *   - Scoreboard: horizontal bars (dark gray fill on light gray track)
 *   - "다시 하기" button: dark bg, "경로 리플레이": per-round route modal,
 *     "나가기": white bg + dark border
 *
 * Preserves: data-testid="final-ranking".
 * Replaces: Ended.tsx (which is kept as a fallback import alias).
 */

import { useEffect, useState } from 'react';

import { useGameClient, useGameStore } from '../state/StoreProvider.js';
import { RouteReplayModal } from '../components/RouteReplayModal.js';
import { colors, fonts, radii } from '../ui/theme.js';

const RESULT_VIEW_MS = 30_000;

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
  const client = useGameClient();
  const result = useGameStore((s) => s.gameResult);
  const room = useGameStore((s) => s.room);
  const mySeatIdx = useGameStore((s) => s.mySeatIdx);
  const dismissGameResult = useGameStore((s) => s.dismissGameResult);
  const resetToLanding = useGameStore((s) => s.resetToLanding);
  const [revealed, setRevealed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESULT_VIEW_MS / 1000);
  const [showRouteReplay, setShowRouteReplay] = useState(false);

  const iAmHost = mySeatIdx !== undefined
    ? (room?.players.find((p) => p.seatIdx === mySeatIdx)?.isHost ?? false)
    : false;

  useEffect(() => {
    ensureKeyframes();
    // Stagger the reveal slightly for impact
    const t = setTimeout(() => setRevealed(true), 120);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const deadline = Date.now() + RESULT_VIEW_MS;
    const updateCountdown = (): void => {
      setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };
    const interval = setInterval(updateCountdown, 250);
    const timeout = setTimeout(dismissGameResult, RESULT_VIEW_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [dismissGameResult]);

  const ranking = result?.ranking ?? [];
  const roundRoutes = result?.roundRoutes ?? [];
  const maxScore = ranking.length > 0 ? Math.max(...ranking.map((r) => r.score), 1) : 1;
  const winner = ranking.find((r) => r.rank === 1);
  const totalRounds = roundRoutes.length || 5;

  const handleRestart = (): void => {
    client.resetRoom();
    dismissGameResult();
  };
  const handleLeave = (): void => {
    client.leaveRoom();
    resetToLanding();
  };

  const roomIsWaiting = room?.phase === 'waiting';
  const canUsePrimaryAction = roomIsWaiting || iAmHost;
  const handlePrimaryAction = roomIsWaiting ? dismissGameResult : handleRestart;

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        {/* Header with trophy */}
        <div style={styles.headerRow}>
          <span style={{ fontSize: 24 }}>🏆</span>
          <span style={styles.title}>최종 결과 · {totalRounds}라운드</span>
        </div>

        {/* Winner highlight — gold accent */}
        {winner && revealed && (
          <div style={styles.winnerBlock}>
            <div style={styles.winnerMedal}>1</div>
            <div style={styles.winnerName}>{winner.nickname}</div>
            <div style={styles.winnerScore}>
              <span style={styles.winnerScoreHighlight}>
                {winner.score}점 우승!
              </span>
            </div>
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
                        fontSize: 14,
                        fontWeight: isWinner ? 700 : 500,
                        color: colors.text,
                      }}>
                        {r.nickname}
                      </span>
                      <span style={{
                        fontFamily: fonts.mono,
                        fontSize: 14,
                        fontWeight: 800,
                        color: isWinner ? colors.text : colors.textDim,
                      }}>
                        {r.score}
                      </span>
                    </div>
                    {/* Score bar — dark fill on light track */}
                    <div style={{
                      height: isWinner ? 10 : 7,
                      borderRadius: radii.full,
                      background: colors.panelAlt,
                      overflow: 'hidden',
                      border: `1px solid ${colors.border}`,
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${barPct}%`,
                        background: isWinner ? colors.text : colors.textDim,
                        borderRadius: radii.full,
                        animation: revealed
                          ? `barGrow 600ms cubic-bezier(0.16,1,0.3,1) ${delay} both`
                          : undefined,
                        opacity: isWinner ? 1 : 0.6,
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

        <div style={styles.countdown} aria-live="polite">
          {secondsLeft}초 후 대기실로 이동합니다
        </div>

        {/* Actions — wireframe layout: 다시하기 + 경로리플레이(disabled) + 나가기 */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            onClick={canUsePrimaryAction ? handlePrimaryAction : undefined}
            disabled={!canUsePrimaryAction}
            style={{
              ...styles.btn,
              flex: 1.5,
              background: canUsePrimaryAction ? colors.btnPrimary : colors.panelAlt,
              color: canUsePrimaryAction ? colors.btnPrimaryText : colors.textMuted,
              cursor: canUsePrimaryAction ? 'pointer' : 'not-allowed',
            }}
          >
            {roomIsWaiting ? '대기실로' : iAmHost ? '다시 하기 ↻' : '방장 대기 중…'}
          </button>
          <button
            type="button"
            onClick={() => setShowRouteReplay(true)}
            disabled={roundRoutes.length === 0}
            style={{
              ...styles.btn,
              flex: 2,
              background: colors.panelAlt,
              color: roundRoutes.length > 0 ? colors.text : colors.textMuted,
              border: `1px solid ${colors.border}`,
              cursor: roundRoutes.length > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            경로 리플레이
          </button>
          <button
            onClick={handleLeave}
            style={{
              ...styles.btn,
              flex: 1,
              background: colors.panel,
              color: colors.text,
              border: `1px solid ${colors.border}`,
            }}
          >
            나가기
          </button>
        </div>
      </div>
      {showRouteReplay && roundRoutes.length > 0 && (
        <RouteReplayModal rounds={roundRoutes} onClose={() => setShowRouteReplay(false)} />
      )}
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
    maxWidth: 480,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.xl,
    padding: '24px 24px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: 400,
    color: colors.text,
    letterSpacing: '-0.01em',
  },
  winnerBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px 0 16px',
    borderRadius: radii.lg,
    background: colors.panelAlt,
    border: `1px solid ${colors.border}`,
    animation: 'winnerReveal 500ms cubic-bezier(0.16,1,0.3,1) forwards',
  },
  winnerMedal: {
    width: 40, height: 40, borderRadius: '50%',
    background: colors.activeGold,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, fontWeight: 900, color: '#fff',
    fontFamily: fonts.mono,
    marginBottom: 8,
  },
  winnerName: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.text,
    letterSpacing: '-0.01em',
    marginBottom: 6,
  },
  winnerScore: {
    marginBottom: 6,
  },
  winnerScoreHighlight: {
    fontFamily: fonts.mono,
    fontSize: 18,
    fontWeight: 800,
    color: colors.text,
    background: colors.activeGoldDim,
    padding: '4px 12px',
    borderRadius: radii.sm,
  },
  btn: {
    fontSize: 14,
    fontFamily: fonts.body,
    fontWeight: 700,
    padding: '13px 16px',
    borderRadius: radii.md,
    border: 'none',
    cursor: 'pointer',
    transition: 'opacity 160ms ease',
    lineHeight: 1,
  },
  countdown: {
    marginTop: -10,
    textAlign: 'center',
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
};
