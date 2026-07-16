/**
 * Landing (기획서 1F): guest entry — nickname → 방 만들기 / 방 찾기(코드) / 방 목록.
 * No signup; the server issues a session token on connect.
 *
 * Design: SUBWAY wordmark (Black Han Sans), dark transit aesthetic.
 * Preserves: data-testid="nickname-input", "create-room", "join-code", "join-room".
 */

import { useState } from 'react';

import { useGameClient, useGameStore } from '../state/StoreProvider.js';
import { colors, fonts, radii, space } from '../ui/theme.js';

interface LandingProps {
  /** Called when the user taps "방 찾기 목록" → switches to RoomList screen. */
  onBrowseRooms?: () => void;
}

export function Landing({ onBrowseRooms }: LandingProps = {}): JSX.Element {
  const client = useGameClient();
  const setMyNickname = useGameStore((s) => s.setMyNickname);
  const connected = useGameStore((s) => s.connected);
  const lastError = useGameStore((s) => s.lastError);

  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');

  const canAct = nickname.trim().length > 0;
  const canJoin = canAct && code.trim().length > 0;

  const create = (): void => {
    const nick = nickname.trim();
    if (!nick) return;
    setMyNickname(nick);
    client.createRoom(nick, { region: 'capital' });
  };

  const join = (): void => {
    const nick = nickname.trim();
    const c = code.trim().toUpperCase();
    if (!nick || !c) return;
    setMyNickname(nick);
    client.joinRoom({ code: c, nickname: nick });
  };

  const browseRooms = (): void => {
    const nick = nickname.trim();
    if (nick) setMyNickname(nick);
    client.listRooms('all');
    onBrowseRooms?.();
  };

  return (
    <div style={styles.root}>
      {/* Line stripe — 기획서 헤더 accent */}
      <div style={styles.stripe}>
        <span style={{ ...styles.stripeSegment, background: '#00A84D' }} />
        <span style={{ ...styles.stripeSegment, background: '#EF7C1C' }} />
        <span style={{ ...styles.stripeSegment, background: '#00A5DE' }} />
        <span style={{ ...styles.stripeSegment, background: '#D4003B' }} />
      </div>

      <div style={styles.card}>
        {/* Wordmark */}
        <div style={styles.wordmarkWrap}>
          <h1 style={styles.wordmark}>
            SUB<span style={{ color: colors.accent }}>WAY</span>
          </h1>
          <p style={styles.tagline}>지하철 이어가기 실시간 웹게임</p>
        </div>

        {/* Nickname */}
        <label style={styles.label}>닉네임</label>
        <input
          data-testid="nickname-input"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="게스트 닉네임"
          maxLength={12}
          style={styles.input}
          onKeyDown={(e) => { if (e.key === 'Enter' && canAct) create(); }}
        />

        {/* 방 만들기 */}
        <button
          data-testid="create-room"
          disabled={!canAct}
          onClick={create}
          style={{
            ...styles.btn,
            marginTop: space[4],
            background: canAct ? colors.accent : colors.panelAlt,
            color: canAct ? '#04140b' : colors.textDim,
            cursor: canAct ? 'pointer' : 'not-allowed',
          }}
        >
          방 만들기
        </button>

        {/* Divider */}
        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>또는</span>
          <span style={styles.dividerLine} />
        </div>

        {/* 코드로 입장 */}
        <div style={{ display: 'flex', gap: space[2] }}>
          <input
            data-testid="join-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="입장 코드"
            maxLength={8}
            style={{ ...styles.input, flex: 1, marginTop: 0, fontFamily: fonts.mono, letterSpacing: '0.12em' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && canJoin) join(); }}
          />
          <button
            data-testid="join-room"
            disabled={!canJoin}
            onClick={join}
            style={{
              ...styles.btn,
              width: 100,
              background: canJoin ? colors.panelAlt : colors.panel,
              border: `1.5px solid ${canJoin ? colors.borderLight : colors.border}`,
              color: canJoin ? colors.text : colors.textMuted,
              cursor: canJoin ? 'pointer' : 'not-allowed',
            }}
          >
            입장
          </button>
        </div>

        {/* 공개 방 목록 */}
        <button
          onClick={browseRooms}
          style={{
            ...styles.btn,
            marginTop: space[2],
            background: 'transparent',
            border: `1.5px solid ${colors.border}`,
            color: colors.textDim,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          공개 방 목록 보기
        </button>

        {/* Error */}
        {lastError && (
          <div style={styles.error}>{lastError.message}</div>
        )}

        {/* Connection status */}
        <div style={styles.status}>
          <span style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: connected ? colors.accent : colors.textMuted,
            marginRight: 6,
            verticalAlign: 'middle',
          }} />
          {connected ? '서버 연결됨' : '연결 중…'}
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
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    background: colors.bg,
  },
  stripe: {
    display: 'flex',
    width: 200,
    height: 5,
    borderRadius: radii.full,
    overflow: 'hidden',
    marginBottom: 28,
    gap: 2,
  },
  stripeSegment: {
    flex: 1,
    borderRadius: radii.full,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.xl,
    padding: '32px 28px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  wordmarkWrap: {
    marginBottom: 28,
  },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: 'clamp(40px, 10vw, 72px)',
    fontWeight: 400,
    letterSpacing: '-0.02em',
    lineHeight: 0.9,
    margin: '0 0 8px',
    color: colors.text,
  },
  tagline: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textDim,
    margin: 0,
    letterSpacing: '0.02em',
  },
  label: {
    display: 'block',
    fontSize: 11,
    fontFamily: fonts.mono,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: colors.textDim,
    marginBottom: 6,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    fontSize: 15,
    fontFamily: fonts.body,
    padding: '11px 14px',
    borderRadius: radii.md,
    border: `1.5px solid ${colors.border}`,
    background: colors.panelAlt,
    color: colors.text,
    marginTop: 0,
    outline: 'none',
    transition: 'border-color 160ms',
  },
  btn: {
    width: '100%',
    fontSize: 15,
    fontFamily: fonts.body,
    fontWeight: 700,
    padding: '12px 16px',
    borderRadius: radii.md,
    border: 'none',
    transition: 'background 160ms, opacity 120ms',
    lineHeight: 1,
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    margin: '16px 0',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: colors.border,
  },
  dividerText: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fonts.mono,
  },
  error: {
    marginTop: 12,
    fontSize: 13,
    color: colors.danger,
    fontFamily: fonts.body,
  },
  status: {
    marginTop: 20,
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    textAlign: 'center' as const,
  },
};
