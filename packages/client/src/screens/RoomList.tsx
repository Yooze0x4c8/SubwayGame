/**
 * RoomList (기획서 1J): public room browser.
 *
 * Visual spec:
 *   - Filter chips: 전체 / 대기중 / 입문 / 일반
 *   - Each row: room code · status · tier · player count · 🔒 for private
 *   - Data/filter enforcement depth = M7; styled shell wired to room:list.
 *
 * Types: uses RoomListEntry from @subway/shared.
 */

import { useEffect, useState } from 'react';

import type { RoomListEntry, RoomListFilter } from '@subway/shared';
import { useGameClient, useGameStore } from '../state/StoreProvider.js';
import { colors, fonts, radii, space } from '../ui/theme.js';

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
          <span style={styles.count}>{roomList.length}개</span>
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
                  background: active ? colors.accent : colors.panelAlt,
                  color: active ? '#04140b' : colors.textDim,
                  border: `1px solid ${active ? colors.accent : colors.border}`,
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
              <RoomRow key={room.roomId} room={room} onBack={onBack} />
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
  onBack,
}: {
  room: RoomListEntry;
  onBack: () => void;
}): JSX.Element {
  const isWaiting = room.phase === 'waiting';
  const tierLabel =
    room.tierFilter.includes('intro')
      ? '입문'
      : room.tierFilter.includes('hardcore')
        ? '하드코어'
        : '일반';
  const statusColor = isWaiting ? colors.accent : colors.textMuted;
  const statusLabel = isWaiting ? '대기중' : '게임 중';

  return (
    <div style={styles.roomRow}>
      {/* Code + lock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 80 }}>
        <span style={styles.roomCode}>{room.code}</span>
        {room.hasPassword && <span style={{ fontSize: 13 }}>🔒</span>}
      </div>

      {/* Status + tier */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        flex: 1, paddingLeft: space[3],
      }}>
        <span style={{ ...styles.statusDot, background: statusColor }} />
        <span style={{ ...styles.statusLabel, color: statusColor }}>{statusLabel}</span>
        <span style={styles.tierBadge}>{tierLabel}</span>
      </div>

      {/* Player count + action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={styles.playerCount}>
          {room.playerCount}/{room.rounds > 0 ? 8 : 8}
        </span>
        {isWaiting ? (
          <button
            onClick={onBack}
            style={styles.joinBtn}
            title={`코드 ${room.code}로 입장`}
          >
            입장
          </button>
        ) : (
          <span style={{
            ...styles.joinBtn,
            background: colors.panelAlt,
            color: colors.textMuted,
            cursor: 'default',
            border: `1px solid ${colors.border}`,
          }}>
            관전
          </span>
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
    maxWidth: 560,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.xl,
    padding: '20px 20px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
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
    background: colors.panelAlt,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
  },
  roomCode: {
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: 600,
    color: colors.text,
    letterSpacing: '0.08em',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
  },
  statusLabel: {
    fontSize: 12,
    fontFamily: fonts.mono,
    fontWeight: 600,
    letterSpacing: '0.04em',
  },
  tierBadge: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: colors.textMuted,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    padding: '2px 7px',
  },
  playerCount: {
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: 600,
    color: colors.textDim,
    minWidth: 30,
    textAlign: 'right',
  },
  joinBtn: {
    fontSize: 12,
    fontFamily: fonts.body,
    fontWeight: 700,
    padding: '6px 14px',
    borderRadius: radii.sm,
    background: colors.accent,
    color: '#04140b',
    border: 'none',
    cursor: 'pointer',
    transition: 'opacity 160ms',
    whiteSpace: 'nowrap',
  },
};
