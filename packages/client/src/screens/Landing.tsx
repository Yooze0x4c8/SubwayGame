/**
 * Landing (기획서 1F): guest entry — nickname → 방 만들기 / 방 찾기(코드).
 * No signup; the server issues a session token on connect.
 */

import { useState } from 'react';

import { useGameClient, useGameStore } from '../state/StoreProvider.js';
import { colors } from '../ui/theme.js';

export function Landing(): JSX.Element {
  const client = useGameClient();
  // Select primitives individually — zustand v5's useStore has no default
  // shallow compare, so a selector returning a fresh object each render would
  // loop infinitely (getSnapshot never stable → "Maximum update depth").
  const setMyNickname = useGameStore((s) => s.setMyNickname);
  const connected = useGameStore((s) => s.connected);
  const lastError = useGameStore((s) => s.lastError);

  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');

  const canAct = nickname.trim().length > 0;

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

  return (
    <div style={{ maxWidth: 420, margin: '10vh auto', padding: 24 }}>
      <h1 style={{ color: colors.accent, fontSize: 40, marginBottom: 4 }}>SUBWAY</h1>
      <p style={{ color: colors.textDim, marginTop: 0 }}>지하철 노선 잇기 게임</p>

      <label style={{ display: 'block', color: colors.textDim, fontSize: 13, marginTop: 20 }}>
        닉네임
      </label>
      <input
        data-testid="nickname-input"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="게스트 닉네임"
        style={inputStyle}
      />

      <button
        data-testid="create-room"
        disabled={!canAct}
        onClick={create}
        style={{ ...btnStyle, background: canAct ? colors.accent : colors.panelAlt, marginTop: 16 }}
      >
        방 만들기
      </button>

      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        <input
          data-testid="join-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="입장 코드"
          style={{ ...inputStyle, flex: 1, marginTop: 0 }}
        />
        <button
          data-testid="join-room"
          disabled={!canAct || code.trim().length === 0}
          onClick={join}
          style={{ ...btnStyle, width: 120, background: colors.panel }}
        >
          방 찾기
        </button>
      </div>

      {lastError && (
        <div style={{ color: colors.danger, marginTop: 12 }}>{lastError.message}</div>
      )}
      <div style={{ color: colors.textDim, fontSize: 12, marginTop: 24 }}>
        {connected ? '● 서버 연결됨' : '○ 연결 중…'}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontSize: 16,
  padding: '10px 12px',
  borderRadius: 10,
  border: `2px solid ${colors.panelAlt}`,
  background: colors.panel,
  color: colors.text,
  marginTop: 6,
  outline: 'none',
};

const btnStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  padding: '12px 18px',
  borderRadius: 10,
  border: 'none',
  color: colors.text,
  cursor: 'pointer',
  width: '100%',
};
