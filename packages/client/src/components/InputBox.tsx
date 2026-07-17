/**
 * InputBox (기획서 2a): the station-name entry.
 *
 * Visual spec (wireframe): white background input, bold dark border, large centered text.
 * Rejection reason flashes in red below.
 *
 * Preserves: data-testid="input-box", "station-input", "submit-btn", "rejection-flash".
 */

import { useEffect, useRef, useState } from 'react';

import type { Rejection } from '../state/gameStore.js';
import { colors, fonts, radii } from '../ui/theme.js';

const REJECTION_LABEL: Record<Rejection['reason'], string> = {
  notFound:      '없는 역 이름이에요',
  duplicate:     '이미 지나간 역이에요',
  lineMismatch:  '연결되지 않는 노선이에요',
  wrongTurn:     '당신 차례가 아니에요',
  notRunning:    '게임이 진행 중이 아니에요',
};

interface InputBoxProps {
  myTurn: boolean;
  rejection: Rejection | undefined;
  onSubmit: (text: string) => void;
}

export function InputBox({ myTurn, rejection, onSubmit }: InputBoxProps): JSX.Element {
  const [text, setText] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Surface a rejection briefly (keyed on the rejection id so repeats re-flash).
  useEffect(() => {
    if (!rejection) return;
    setFlash(REJECTION_LABEL[rejection.reason]);
    const id = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(id);
  }, [rejection]);

  // Auto-focus when it becomes your turn.
  useEffect(() => {
    if (myTurn) inputRef.current?.focus();
  }, [myTurn]);

  const submit = (): void => {
    const t = text.trim();
    if (!t || !myTurn) return;
    onSubmit(t);
    setText('');
  };

  const borderColor = flash
    ? colors.danger
    : myTurn
      ? colors.text
      : colors.border;

  return (
    <div data-testid="input-box" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          data-testid="station-input"
          value={text}
          disabled={!myTurn}
          placeholder={myTurn ? '다음 역 이름 입력…' : '상대 차례를 기다리는 중…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          style={{
            flex: 1,
            fontSize: 20,
            fontFamily: fonts.body,
            fontWeight: myTurn ? 700 : 400,
            padding: '14px 18px',
            borderRadius: radii.md,
            border: `2px solid ${borderColor}`,
            background: colors.panel,
            color: myTurn ? colors.text : colors.textDim,
            outline: 'none',
            transition: 'border-color 180ms ease',
            textAlign: 'center',
          }}
        />
        <button
          data-testid="submit-btn"
          disabled={!myTurn}
          onClick={submit}
          style={{
            fontSize: 15,
            fontFamily: fonts.body,
            fontWeight: 700,
            padding: '12px 20px',
            borderRadius: radii.md,
            border: 'none',
            background: myTurn ? colors.btnPrimary : colors.panelAlt,
            color: myTurn ? colors.btnPrimaryText : colors.textMuted,
            cursor: myTurn ? 'pointer' : 'not-allowed',
            transition: 'background 180ms ease, color 180ms ease',
            whiteSpace: 'nowrap',
          }}
        >
          입력
        </button>
      </div>

      {/* Rejection flash */}
      <div
        data-testid="rejection-flash"
        style={{
          minHeight: 18,
          fontSize: 12,
          fontFamily: fonts.body,
          color: colors.danger,
          fontWeight: 600,
          letterSpacing: '0.01em',
          opacity: flash ? 1 : 0,
          transition: 'opacity 200ms ease',
          paddingLeft: 4,
        }}
      >
        {flash ?? ''}
      </div>
    </div>
  );
}
