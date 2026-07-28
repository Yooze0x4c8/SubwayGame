/**
 * Result (기획서 1I): final ranking + 우승 하이라이트 + 다시하기/나가기.
 *
 * The terminus notice. One ranking board carries everything: first place is the
 * highlighted row — gold rail, name in display type, a 우승 tag — rather than a
 * separate hero block repeating the same name above the same list. Score bars are
 * the platform-edge bar again, growing in as the board posts.
 *
 * Preserves: data-testid="final-ranking".
 * Replaces: Ended.tsx (which is kept as a fallback import alias).
 */

import { useEffect, useState } from 'react';

import { useGameClient, useGameStore } from '../state/StoreProvider.js';
import { RouteReplayModal } from '../components/RouteReplayModal.js';
import { colors, fonts, radii, tracking } from '../ui/theme.js';
import { SafetyBar, SignPanel } from '../ui/signage.js';

const RESULT_VIEW_MS = 30_000;

export function Result(): JSX.Element {
  const client = useGameClient();
  const result = useGameStore((s) => s.gameResult);
  const room = useGameStore((s) => s.room);
  const mySeatIdx = useGameStore((s) => s.mySeatIdx);
  const dismissGameResult = useGameStore((s) => s.dismissGameResult);
  const resetToLanding = useGameStore((s) => s.resetToLanding);
  const [secondsLeft, setSecondsLeft] = useState(RESULT_VIEW_MS / 1000);
  const [showRouteReplay, setShowRouteReplay] = useState(false);

  const iAmHost = mySeatIdx !== undefined
    ? (room?.players.find((p) => p.seatIdx === mySeatIdx)?.isHost ?? false)
    : false;

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
      <div style={styles.stack}>
        <SignPanel rail={['seoul_2', 'seoul_3']}>
          <div style={styles.head}>
            <div>
              <div style={styles.noticeLabel}>종착</div>
              <h1 style={styles.title}>최종 결과</h1>
            </div>
            <div style={styles.roundsBadge}>{totalRounds}라운드</div>
          </div>

          {ranking.length === 0 ? (
            <div style={styles.placeholder}>결과를 집계하는 중…</div>
          ) : (
            <div data-testid="final-ranking" style={styles.board}>
              {ranking.map((r, idx) => {
                const barPct = maxScore > 0 ? (r.score / maxScore) * 100 : 0;
                const isWinner = r.rank === 1;
                const delay = `${idx * 70}ms`;

                return (
                  <div
                    key={r.id}
                    style={{
                      ...styles.row,
                      background: isWinner ? colors.activeGoldBg : colors.panel,
                      animation: `sgArrive 320ms cubic-bezier(0.22,1,0.36,1) ${delay} both`,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        ...styles.rowRail,
                        background: isWinner ? colors.activeGold : colors.border,
                      }}
                    />

                    {/* Rank disc — the numbered-line mark, borrowed for standings. */}
                    <span
                      style={{
                        ...styles.rankDisc,
                        background: isWinner ? colors.activeGold : 'transparent',
                        color: isWinner ? '#fff' : colors.textMuted,
                        border: isWinner ? 'none' : `1px solid ${colors.border}`,
                      }}
                    >
                      {r.rank}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={styles.rowTop}>
                        <span
                          style={{
                            ...styles.name,
                            fontFamily: isWinner ? fonts.display : fonts.body,
                            fontSize: isWinner ? 21 : 14,
                            fontWeight: isWinner ? 400 : 600,
                            letterSpacing: isWinner ? tracking.tight : 0,
                          }}
                        >
                          {r.nickname}
                        </span>
                        {isWinner && <span style={styles.winTag}>우승</span>}
                        <span style={{ flex: 1 }} />
                        <span
                          style={{
                            ...styles.score,
                            fontSize: isWinner ? 17 : 14,
                            color: isWinner ? colors.text : colors.textDim,
                          }}
                        >
                          {r.score}
                        </span>
                      </div>
                      <div style={{ display: 'flex', marginTop: 6 }}>
                        <SafetyBar
                          pct={barPct}
                          height={isWinner ? 9 : 6}
                          color={isWinner ? colors.activeGold : colors.textMuted}
                          growIn={{ delay }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={styles.footer}>
            {room && <span style={styles.code}>방 코드 {room.code}</span>}
            <span style={styles.countdown} aria-live="polite">
              {secondsLeft}초 후 대기실로 이동합니다
            </span>
          </div>
        </SignPanel>

        {/* Actions */}
        <div style={styles.actions}>
          <button
            onClick={canUsePrimaryAction ? handlePrimaryAction : undefined}
            disabled={!canUsePrimaryAction}
            className={`sg-btn ${canUsePrimaryAction ? 'sg-btn-ink' : ''}`}
            style={{
              ...styles.btn,
              flex: 1.4,
              background: canUsePrimaryAction ? colors.btnPrimary : colors.panelAlt,
              color: canUsePrimaryAction ? colors.btnPrimaryText : colors.textMuted,
              border: canUsePrimaryAction ? 'none' : `1px solid ${colors.border}`,
            }}
          >
            {roomIsWaiting ? '대기실로' : iAmHost ? '다시 하기' : '방장 대기 중'}
          </button>
          <button
            type="button"
            onClick={() => setShowRouteReplay(true)}
            disabled={roundRoutes.length === 0}
            className="sg-btn"
            style={{
              ...styles.btn,
              flex: 1.6,
              background: colors.panel,
              color: roundRoutes.length > 0 ? colors.text : colors.textMuted,
              border: `1px solid ${roundRoutes.length > 0 ? colors.text : colors.border}`,
            }}
          >
            경로 리플레이
          </button>
          <button
            onClick={handleLeave}
            className="sg-btn"
            style={{
              ...styles.btn,
              flex: 1,
              background: colors.panel,
              color: colors.textDim,
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
  stack: {
    width: '100%',
    maxWidth: 480,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  head: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: '16px 18px 14px',
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
    fontSize: 28,
    fontWeight: 400,
    letterSpacing: tracking.tight,
    color: colors.text,
  },
  roundsBadge: {
    flexShrink: 0,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: tracking.ko,
    color: colors.textDim,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    padding: '4px 8px',
  },
  placeholder: {
    padding: '40px 18px',
    textAlign: 'center',
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
  },
  board: {
    display: 'flex',
    flexDirection: 'column',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 16px 12px 0',
    borderBottom: `1px solid ${colors.borderLight}`,
    overflow: 'hidden',
  },
  rowRail: {
    width: 4,
    alignSelf: 'stretch',
    minHeight: 38,
    flexShrink: 0,
  },
  rankDisc: {
    width: 22,
    height: 22,
    flexShrink: 0,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 700,
    boxSizing: 'border-box',
  },
  rowTop: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 7,
    minWidth: 0,
  },
  name: {
    color: colors.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
  },
  winTag: {
    flexShrink: 0,
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: tracking.ko,
    color: '#fff',
    background: colors.activeGold,
    borderRadius: 2,
    padding: '2px 5px',
  },
  score: {
    flexShrink: 0,
    fontFamily: fonts.mono,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    padding: '11px 18px 13px',
  },
  code: {
    fontFamily: fonts.body,
    fontSize: 10,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
  },
  countdown: {
    fontFamily: fonts.body,
    fontSize: 10,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
    fontVariantNumeric: 'tabular-nums',
  },
  actions: {
    display: 'flex',
    gap: 8,
  },
  btn: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: 700,
    padding: '13px 12px',
    borderRadius: radii.md,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
};
