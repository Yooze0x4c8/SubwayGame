/**
 * InputBox (기획서 2a): the station-name entry.
 *
 * Enabled only on your turn. Submits on Enter → `turn:submit`. A rejection
 * reason flashes briefly (the store surfaces it; this component only reads).
 */

import { useEffect, useState } from 'react';

import type { Rejection } from '../state/gameStore.js';
import { colors } from '../ui/theme.js';

const REJECTION_LABEL: Record<Rejection['reason'], string> = {
  notFound: '없는 역 이름이에요',
  duplicate: '이미 지나간 역이에요',
  lineMismatch: '연결되지 않는 노선이에요',
  wrongTurn: '당신 차례가 아니에요',
  notRunning: '게임이 진행 중이 아니에요',
};

interface InputBoxProps {
  myTurn: boolean;
  rejection: Rejection | undefined;
  onSubmit: (text: string) => void;
}

export function InputBox({ myTurn, rejection, onSubmit }: InputBoxProps): JSX.Element {
  const [text, setText] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  // Surface a rejection briefly (keyed on the rejection id so repeats re-flash).
  useEffect(() => {
    if (!rejection) return;
    setFlash(REJECTION_LABEL[rejection.reason]);
    const id = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(id);
  }, [rejection]);

  const submit = (): void => {
    const t = text.trim();
    if (!t || !myTurn) return;
    onSubmit(t);
    setText('');
  };

  return (
    <div data-testid="input-box" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          data-testid="station-input"
          value={text}
          disabled={!myTurn}
          placeholder={myTurn ? '다음 역 이름을 입력…' : '상대 차례를 기다리는 중…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          style={{
            flex: 1,
            fontSize: 18,
            padding: '10px 12px',
            borderRadius: 10,
            border: `2px solid ${myTurn ? colors.accent : colors.panelAlt}`,
            background: myTurn ? colors.panel : colors.panelAlt,
            color: colors.text,
            outline: 'none',
          }}
        />
        <button
          data-testid="submit-btn"
          disabled={!myTurn}
          onClick={submit}
          style={{
            fontSize: 16,
            fontWeight: 700,
            padding: '10px 18px',
            borderRadius: 10,
            border: 'none',
            background: myTurn ? colors.accent : colors.panelAlt,
            color: myTurn ? '#04140b' : colors.textDim,
            cursor: myTurn ? 'pointer' : 'not-allowed',
          }}
        >
          입력
        </button>
      </div>
      <div
        data-testid="rejection-flash"
        style={{ minHeight: 18, fontSize: 13, color: colors.danger, fontWeight: 600 }}
      >
        {flash ?? ''}
      </div>
    </div>
  );
}
