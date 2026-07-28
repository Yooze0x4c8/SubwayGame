/**
 * InputBox (기획서 2a): the station-name entry.
 *
 * Styled as a destination entry field: large centered Korean and an ink edge
 * when it's your turn.
 *
 * Preserves: data-testid="input-box", "station-input", "submit-btn", "rejection-flash".
 */

import { useEffect, useRef, useState } from 'react';

import type { Rejection } from '../state/gameStore.js';
import { colors, fonts, radii, tracking } from '../ui/theme.js';

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
    if (!t) return;
    onSubmit(t);
    setText('');
  };

  const borderColor = flash ? colors.danger : myTurn ? colors.text : colors.border;

  return (
    <div data-testid="input-box" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            ref={inputRef}
            className="sg-input"
            data-testid="station-input"
            value={text}
            placeholder={myTurn ? '다음 역 이름' : '채팅하기'}
            aria-label={myTurn ? '다음 역 이름 입력' : '채팅 입력'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              fontSize: myTurn ? 22 : 16,
              fontFamily: myTurn ? fonts.display : fonts.body,
              fontWeight: 400,
              padding: myTurn ? '13px 16px 11px' : '13px 16px',
              borderRadius: radii.md,
              border: `2px solid ${borderColor}`,
              background: colors.panel,
              color: myTurn ? colors.text : colors.textDim,
              textAlign: 'center',
              letterSpacing: myTurn ? tracking.tight : 0,
            }}
          />
        </div>

        <button
          className={`sg-btn ${myTurn ? 'sg-btn-ink' : ''}`}
          data-testid="submit-btn"
          onClick={submit}
          style={{
            alignSelf: 'flex-start',
            fontSize: 13,
            fontFamily: fonts.body,
            fontWeight: 700,
            letterSpacing: tracking.ko,
            padding: myTurn ? '17px 18px' : '15px 18px',
            borderRadius: radii.md,
            border: myTurn ? 'none' : `1px solid ${colors.border}`,
            background: myTurn ? colors.btnPrimary : colors.panel,
            color: myTurn ? colors.btnPrimaryText : colors.textDim,
            whiteSpace: 'nowrap',
          }}
        >
          {myTurn ? '입력' : '전송'}
        </button>
      </div>

      {/* Rejection flash */}
      <div
        data-testid="rejection-flash"
        role="status"
        style={{
          minHeight: 17,
          fontSize: 12,
          fontFamily: fonts.body,
          color: colors.danger,
          fontWeight: 600,
          textAlign: 'center',
          opacity: flash ? 1 : 0,
          transition: 'opacity 200ms ease',
        }}
      >
        {flash ?? ''}
      </div>
    </div>
  );
}
