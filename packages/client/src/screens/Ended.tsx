/**
 * Ended (minimal): final ranking display so a full game reads to completion.
 * Result.tsx is the screen players actually see; this is the plain fallback.
 */

import { useGameStore } from '../state/StoreProvider.js';
import { colors, fonts, tracking } from '../ui/theme.js';
import { SignPanel } from '../ui/signage.js';

export function Ended(): JSX.Element {
  const result = useGameStore((s) => s.gameResult);
  const room = useGameStore((s) => s.room);

  const ranking = result?.ranking ?? [];

  return (
    <div style={styles.root}>
      <div style={styles.stack}>
        <SignPanel rail={['seoul_2']}>
          <div style={styles.head}>
            <div style={styles.noticeLabel}>종착</div>
            <h1 style={styles.title}>게임 종료</h1>
          </div>

          {ranking.length === 0 ? (
            <div style={styles.placeholder}>결과를 집계하는 중…</div>
          ) : (
            <div data-testid="final-ranking" style={styles.list}>
              {ranking.map((r) => {
                const isWinner = r.rank === 1;
                return (
                  <div
                    key={r.id}
                    style={{
                      ...styles.row,
                      background: isWinner ? colors.activeGoldBg : colors.panel,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        ...styles.rail,
                        background: isWinner ? colors.activeGold : colors.border,
                      }}
                    />
                    <span style={styles.rank}>{r.rank}</span>
                    <span style={styles.name}>{r.nickname}</span>
                    <span style={styles.score}>{r.score}</span>
                  </div>
                );
              })}
            </div>
          )}

          {room && <div style={styles.code}>방 코드 {room.code}</div>}
        </SignPanel>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '8vh 16px 32px',
    background: colors.bg,
  },
  stack: {
    width: '100%',
    maxWidth: 420,
  },
  head: {
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
    fontSize: 26,
    fontWeight: 400,
    letterSpacing: tracking.tight,
    color: colors.text,
  },
  placeholder: {
    padding: '32px 18px',
    textAlign: 'center',
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    padding: '11px 16px 11px 0',
    borderBottom: `1px solid ${colors.borderLight}`,
    overflow: 'hidden',
  },
  rail: {
    width: 4,
    alignSelf: 'stretch',
    minHeight: 24,
    flexShrink: 0,
  },
  rank: {
    width: 20,
    textAlign: 'center',
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 700,
    color: colors.textMuted,
    flexShrink: 0,
  },
  name: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: 600,
    color: colors.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  score: {
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: 700,
    color: colors.text,
    fontVariantNumeric: 'tabular-nums',
  },
  code: {
    padding: '11px 18px 13px',
    fontFamily: fonts.body,
    fontSize: 10,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
  },
};
