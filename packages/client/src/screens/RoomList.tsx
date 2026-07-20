/**
 * RoomList (기획서 1J): public room browser.
 *
 * Visual spec (wireframe):
 *   - Light theme, white container on gray bg
 *   - Search input with magnifying glass icon on left
 *   - Filter chips: selected = black bg + white text, unselected = white bg + dark text
 *   - Room rows: white cards with status dot, title, player capacity grid, action button
 *   - Room capacity: 8 square slots (filled dark, empty light)
 *   - "입장" button: dark bg, "관전" button: white bg + gray border
 *
 * Types: uses RoomListEntry from @subway/shared.
 */

import { useEffect, useState } from 'react';

import type { RoomListEntry, RoomListFilter } from '@subway/shared';
import { useGameClient, useGameStore } from '../state/StoreProvider.js';
import { colors, fonts, radii } from '../ui/theme.js';

// Map UI label → wire filter value
const FILTER_MAP: Record<string, RoomListFilter> = {
  '전체':  'all',
  '대기중': 'waiting',
  '입문':  'intro',
  '일반':  'normal',
};
const FILTER_LABELS = ['전체', '대기중', '입문', '일반'] as const;
type FilterLabel = typeof FILTER_LABELS[number];

interface RoomListProps {
  onBack: () => void;
}

export function RoomList({ onBack }: RoomListProps): JSX.Element {
  const client = useGameClient();
  const roomList = useGameStore((s) => s.roomList);
  const myNickname = useGameStore((s) => s.myNickname);
  const [activeLabel, setActiveLabel] = useState<FilterLabel>('전체');

  // Request list on mount and on filter change; refresh every 5 s
  useEffect(() => {
    client.listRooms(FILTER_MAP[activeLabel]);
    const id = setInterval(
      () => client.listRooms(FILTER_MAP[activeLabel]),
      5000,
    );
    return () => clearInterval(id);
  }, [client, activeLabel]);

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <button onClick={onBack} style={styles.backBtn}>
            ← 돌아가기
          </button>
          <span style={styles.title}>공개 방 목록</span>
          <span style={styles.count}>{roomList.length}개 방</span>
          <button
            disabled={!myNickname}
            onClick={() => {
              if (myNickname) client.createRoom(myNickname, { region: 'capital' });
            }}
            style={{
              ...styles.createBtn,
              opacity: myNickname ? 1 : 0.4,
              cursor: myNickname ? 'pointer' : 'not-allowed',
            }}
          >
            + 방 만들기
          </button>
        </div>

        {/* Filter chips */}
        <div style={styles.filterRow}>
          {FILTER_LABELS.map((label) => {
            const active = label === activeLabel;
            return (
              <button
                key={label}
                onClick={() => setActiveLabel(label)}
                style={{
                  ...styles.filterChip,
                  background: active ? colors.btnPrimary : colors.panel,
                  color: active ? colors.btnPrimaryText : colors.text,
                  border: `1px solid ${active ? colors.btnPrimary : colors.border}`,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Room list */}
        <div style={styles.list}>
          {roomList.length === 0 ? (
            <div style={styles.empty}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🚉</div>
              <div style={{ color: colors.textDim, fontSize: 14 }}>
                공개 방이 없습니다
              </div>
              <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                방을 만들거나 코드로 입장하세요
              </div>
            </div>
          ) : (
            roomList.map((room) => (
              <RoomRow key={room.roomId} room={room} nickname={myNickname} client={client} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Room row ──────────────────────────────────────────────────────────────────

function RoomRow({
  room,
  nickname,
  client,
}: {
  room: RoomListEntry;
  nickname: string | undefined;
  client: ReturnType<typeof useGameClient>;
}): JSX.Element {
  const [password, setPassword] = useState('');
  const [askingPassword, setAskingPassword] = useState(false);
  const isWaiting = room.phase === 'waiting';
  const tierLabel =
    room.tierFilter.includes('intro')
      ? '입문'
      : room.tierFilter.includes('hardcore')
        ? '하드코어'
        : '일반';
  const statusColor = isWaiting ? colors.accent : '#EF7C1C';
  const statusLabel = isWaiting ? '대기중' : '게임 중';

  // Capacity grid (8 squares)
  const capacitySlots = Array(8).fill(false).map((_, i) => i < room.playerCount);

  const enter = (): void => {
    if (!nickname) return;
    if (room.hasPassword && !askingPassword) {
      setAskingPassword(true);
      return;
    }
    client.joinRoom({
      roomId: room.roomId,
      nickname,
      password: room.hasPassword ? password : undefined,
      isSpectator: !isWaiting,
    });
  };

  return (
    <div style={styles.roomRow}>
      {/* Left: lock + status + tier */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        {room.hasPassword && <span style={{ fontSize: 13 }}>🔒</span>}
        <span style={{ ...styles.statusDot, background: statusColor }} />
        <span style={{
          fontSize: 12, fontFamily: fonts.mono, fontWeight: 600,
          color: statusColor,
          background: isWaiting ? colors.accentDim : '#FFF5E6',
          padding: '2px 8px', borderRadius: radii.full,
        }}>
          {statusLabel}
        </span>
        <span style={styles.roomTitle}>{room.title}</span>
        <span style={styles.tierBadge}>{tierLabel} · {room.rounds}라운드</span>
      </div>

      {/* Right: capacity grid + password/action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Capacity squares */}
        <div style={{ display: 'flex', gap: 3 }}>
          {capacitySlots.map((filled, i) => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: 2,
              background: filled ? colors.text : colors.panelAlt,
              border: `1px solid ${filled ? colors.text : colors.border}`,
            }} />
          ))}
        </div>
        <span style={styles.playerCount}>
          {room.playerCount}/8
        </span>
        {askingPassword && (
          <input
            autoFocus
            type="password"
            aria-label="방 비밀번호"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') enter();
            }}
            style={styles.passwordInput}
          />
        )}
        {isWaiting ? (
          <button
            disabled={!nickname}
            onClick={enter}
            style={{ ...styles.joinBtn, opacity: nickname ? 1 : 0.5 }}
            title={room.hasPassword ? '비밀번호를 입력해 입장' : '방 입장'}
          >
            {askingPassword ? '확인' : '입장'}
          </button>
        ) : (
          <button
            disabled={!nickname}
            onClick={enter}
            style={{ ...styles.spectateBtn, opacity: nickname ? 1 : 0.5, cursor: nickname ? 'pointer' : 'not-allowed' }}
            title={room.hasPassword ? '비밀번호를 입력해 관전' : '방 관전'}
          >
            {askingPassword ? '확인' : '관전'}
          </button>
        )}
      </div>
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
    padding: '4vh 16px 32px',
    background: colors.bg,
  },
  card: {
    width: '100%',
    maxWidth: 640,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.xl,
    padding: '20px 20px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    fontSize: 13,
    fontFamily: fonts.body,
    fontWeight: 500,
    color: colors.textDim,
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: '6px 12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: 400,
    color: colors.text,
    flex: 1,
    letterSpacing: '-0.01em',
  },
  count: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textMuted,
  },
  createBtn: {
    fontSize: 13,
    fontFamily: fonts.body,
    fontWeight: 700,
    color: colors.btnPrimaryText,
    background: colors.btnPrimary,
    border: 'none',
    borderRadius: radii.md,
    padding: '7px 14px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  filterRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterChip: {
    fontSize: 12,
    fontFamily: fonts.mono,
    fontWeight: 600,
    letterSpacing: '0.04em',
    padding: '5px 14px',
    borderRadius: radii.full,
    cursor: 'pointer',
    transition: 'all 160ms ease',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minHeight: 120,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 0',
    textAlign: 'center',
  },
  roomRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 14px',
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
  },
  roomTitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: 600,
    color: colors.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 200,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
  },
  tierBadge: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: colors.textMuted,
  },
  playerCount: {
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: 600,
    color: colors.textDim,
    minWidth: 30,
    textAlign: 'right',
  },
  passwordInput: {
    width: 92,
    boxSizing: 'border-box',
    fontSize: 12,
    fontFamily: fonts.mono,
    padding: '6px 8px',
    borderRadius: radii.sm,
    border: `1px solid ${colors.border}`,
    background: colors.panel,
    color: colors.text,
    outline: 'none',
  },
  joinBtn: {
    fontSize: 12,
    fontFamily: fonts.body,
    fontWeight: 700,
    padding: '6px 14px',
    borderRadius: radii.sm,
    background: colors.btnPrimary,
    color: colors.btnPrimaryText,
    border: 'none',
    cursor: 'pointer',
    transition: 'opacity 160ms',
    whiteSpace: 'nowrap',
  },
  spectateBtn: {
    fontSize: 12,
    fontFamily: fonts.body,
    fontWeight: 600,
    padding: '6px 14px',
    borderRadius: radii.sm,
    background: colors.panel,
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    cursor: 'default',
    whiteSpace: 'nowrap',
  },
};
