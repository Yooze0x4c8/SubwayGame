/**
 * ChatPanel: scrollable message list + input for room chat.
 * Used in WaitingRoom and InGame.
 *
 * Styled as a recessed field on the sign face, with a tracked mono header —
 * the same caption grammar as every other label in the app.
 *
 * Two optional modes let the same panel sit in a mobile bottom dock. Both
 * default to `false`, which is the original desktop panel, unchanged:
 *
 *   collapsible  The header turns into a real toggle button (`aria-expanded`)
 *                and the message list starts hidden, so only the one-line input
 *                row occupies the dock. Expanded, the list is capped at ~34% of
 *                the visible viewport (`--app-height`) instead of `maxHeight`.
 *   dock         Drops the panel's own radius and outer border so it reads as
 *                part of the dock's face rather than a card floating on it.
 *
 * On phone widths the input is forced to 16px: iOS Safari zooms the whole page
 * when a focused field computes below that.
 */

import { useEffect, useRef, useState } from 'react';

import type { ChatMessagePayload } from '@subway/shared';
import { useIsMobile } from '../ui/responsive.js';
import { colors, fonts, radii, tracking } from '../ui/theme.js';

interface ChatPanelProps {
  messages: ChatMessagePayload[];
  onSend: (text: string) => void;
  myNickname?: string;
  maxHeight?: number;
  /** Hide the message list behind a header toggle; starts collapsed. */
  collapsible?: boolean;
  /** Render flush inside a bottom dock (no radius, no outer border). */
  dock?: boolean;
}

export function ChatPanel({
  messages,
  onSend,
  myNickname,
  maxHeight = 180,
  collapsible = false,
  dock = false,
}: ChatPanelProps): JSX.Element {
  const isMobile = useIsMobile();
  const [text, setText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Korean IME: Android fires Enter mid-composition, which would send a
  // half-assembled 한글 syllable. Track composition and ignore Enter during it.
  const composingRef = useRef(false);

  const listOpen = !collapsible || expanded;

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, listOpen]);

  const send = (): void => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };

  const header = (
    <>
      <span style={styles.label}>채팅</span>
      <span style={styles.count}>{messages.length}</span>
    </>
  );

  return (
    <div style={dock ? { ...styles.root, ...styles.rootDock } : styles.root}>
      {collapsible ? (
        <button
          type="button"
          className="sg-btn"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          style={{ ...styles.header, ...styles.headerBtn }}
        >
          {header}
          <span aria-hidden="true" style={styles.chevron}>{expanded ? '▴' : '▾'}</span>
        </button>
      ) : (
        <div style={styles.header}>{header}</div>
      )}

      {/* Message list */}
      {listOpen && (
        <div
          ref={listRef}
          style={{
            ...styles.list,
            maxHeight: collapsible ? 'calc(var(--app-height) * 0.34)' : maxHeight,
          }}
        >
          {messages.length === 0 ? (
            <span style={styles.empty}>첫 메시지를 남겨보세요</span>
          ) : (
            messages.map((msg, i) => {
              const isMe = myNickname !== undefined && msg.nickname === myNickname;
              const displayNickname = msg.seatIdx === undefined
                ? `[관전] ${msg.nickname}`
                : msg.nickname;
              return (
                <div key={i} style={styles.message}>
                  <span style={{ ...styles.nick, color: isMe ? colors.accent : colors.textDim }}>
                    {displayNickname}
                    {isMe && <span style={styles.meTag}> 나</span>}
                  </span>
                  <span style={styles.colon}>: </span>
                  <span style={styles.text}>{msg.text}</span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Input */}
      <div style={styles.inputRow}>
        <input
          className="sg-input"
          value={text}
          aria-label="채팅 입력"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
          onChange={(e) => setText(e.target.value)}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            if (composingRef.current || e.nativeEvent.isComposing) return;
            send();
          }}
          placeholder="채팅하기"
          style={isMobile ? { ...styles.input, ...styles.inputMobile } : styles.input}
        />
        <button
          className="sg-btn"
          onClick={send}
          style={isMobile ? { ...styles.sendBtn, ...styles.sendBtnMobile } : styles.sendBtn}
        >
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
    overflow: 'hidden',
  },
  rootDock: {
    border: 'none',
    borderRadius: 0,
    background: colors.panel,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 12px 6px',
    borderBottom: `1px solid ${colors.border}`,
  },
  headerBtn: {
    width: '100%',
    minHeight: 44,
    boxSizing: 'border-box',
    border: 'none',
    borderBottom: `1px solid ${colors.border}`,
    borderRadius: 0,
    background: colors.panelAlt,
    textAlign: 'left',
    cursor: 'pointer',
  },
  chevron: {
    fontSize: 10,
    lineHeight: 1,
    color: colors.textMuted,
  },
  label: {
    flex: 1,
    fontSize: 10,
    fontFamily: fonts.body,
    fontWeight: 500,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
  },
  count: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.textMuted,
    fontVariantNumeric: 'tabular-nums',
  },
  list: {
    overflowY: 'auto',
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minHeight: 44,
    background: colors.panel,
  },
  empty: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.textMuted,
    alignSelf: 'center',
    marginTop: 6,
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
    fontSize: 9,
    fontFamily: fonts.body,
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
    borderTop: `1px solid ${colors.border}`,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontFamily: fonts.body,
    padding: '9px 12px',
    border: 'none',
    borderRadius: 0,
    background: colors.panel,
    color: colors.text,
  },
  // iOS zooms the page when a focused field computes under 16px.
  inputMobile: {
    fontSize: 16,
    padding: '12px 12px',
  },
  sendBtn: {
    fontSize: 10,
    fontFamily: fonts.body,
    fontWeight: 700,
    letterSpacing: tracking.ko,
    padding: '9px 14px',
    border: 'none',
    borderLeft: `1px solid ${colors.border}`,
    background: colors.panelAlt,
    color: colors.textDim,
    whiteSpace: 'nowrap',
  },
  sendBtnMobile: {
    fontSize: 12,
    minWidth: 60,
    padding: '12px 16px',
  },
};
