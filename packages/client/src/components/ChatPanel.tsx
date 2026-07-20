/**
 * ChatPanel: scrollable message list + input for room chat.
 * Used in WaitingRoom and InGame.
 */

import { useEffect, useRef, useState } from 'react';

import type { ChatMessagePayload } from '@subway/shared';
import { colors, fonts, radii } from '../ui/theme.js';

interface ChatPanelProps {
  messages: ChatMessagePayload[];
  onSend: (text: string) => void;
  myNickname?: string;
  maxHeight?: number;
}

export function ChatPanel({
  messages,
  onSend,
  myNickname,
  maxHeight = 180,
}: ChatPanelProps): JSX.Element {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  const send = (): void => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.label}>💬 채팅</span>
      </div>

      {/* Message list */}
      <div ref={listRef} style={{ ...styles.list, maxHeight }}>
        {messages.length === 0 ? (
          <span style={styles.empty}>채팅을 시작해보세요</span>
        ) : (
          messages.map((msg, i) => {
            const isMe = myNickname !== undefined && msg.nickname === myNickname;
            return (
              <div key={i} style={styles.message}>
                <span style={{ ...styles.nick, color: isMe ? colors.accent : colors.textDim }}>
                  {msg.nickname}
                  {isMe && <span style={styles.meTag}> 나</span>}
                </span>
                <span style={styles.colon}>: </span>
                <span style={styles.text}>{msg.text}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div style={styles.inputRow}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="채팅하기…"
          style={styles.input}
        />
        <button onClick={send} style={styles.sendBtn}>
          전송
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    background: colors.panelAlt,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    overflow: 'hidden',
  },
  header: {
    padding: '8px 12px 6px',
    borderBottom: `1px solid ${colors.border}`,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.mono,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  list: {
    overflowY: 'auto',
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minHeight: 48,
  },
  empty: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.textMuted,
    alignSelf: 'center',
    marginTop: 8,
  },
  message: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 1.5,
    wordBreak: 'break-word',
  },
  nick: {
    fontWeight: 700,
    fontSize: 12,
  },
  meTag: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.textMuted,
    fontWeight: 400,
    marginLeft: 2,
  },
  colon: {
    color: colors.textMuted,
  },
  text: {
    color: colors.text,
  },
  inputRow: {
    display: 'flex',
    gap: 0,
    borderTop: `1px solid ${colors.border}`,
  },
  input: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.body,
    padding: '8px 12px',
    border: 'none',
    background: colors.panel,
    color: colors.text,
    outline: 'none',
  },
  sendBtn: {
    fontSize: 12,
    fontFamily: fonts.mono,
    fontWeight: 700,
    padding: '8px 14px',
    border: 'none',
    borderLeft: `1px solid ${colors.border}`,
    background: colors.panel,
    color: colors.textDim,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background 150ms ease',
  },
};
