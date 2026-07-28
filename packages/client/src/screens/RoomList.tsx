/**
 * RoomList (기획서 1J): public room browser, laid out as a departures board.
 *
 * A list of rooms waiting to leave is a departures board, so it's built like one:
 * a fixed header of tracked mono column captions, then one row per service with
 * its status lamp, name, grade, seat map and boarding control. Filters are the
 * board's tabs.
 *
 * The seat map (8 squares) is kept from the wireframe — it reads capacity faster
 * than "3/8" does, and it's the same mark a platform car-position sign uses.
 */

import { useEffect, useState } from 'react';

import type { RoomListEntry, RoomListFilter } from '@subway/shared';
import { useGameClient, useGameStore } from '../state/StoreProvider.js';
import { colors, fonts, radii, tracking } from '../ui/theme.js';
import { RouteMark, SignPanel } from '../ui/signage.js';

// Map UI label → wire filter value
const FILTER_MAP: Record<string, RoomListFilter> = {
  '전체':  'all',
  '대기중': 'waiting',
  '입문':  'intro',
  '일반':  'normal',
};
const FILTER_LABELS = ['전체', '대기중', '입문', '일반'] as const;
type FilterLabel = typeof FILTER_LABELS[number];

const MAX_SEATS = 8;

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
      <div style={styles.stack}>
        {/* Board header */}
        <div style={styles.topBar}>
          <button onClick={onBack} className="sg-btn" style={styles.backBtn}>
            ← 처음으로
          </button>
          <button
            className={`sg-btn ${myNickname ? 'sg-btn-ink' : ''}`}
            disabled={!myNickname}
            onClick={() => {
              if (myNickname) client.createRoom(myNickname, { region: 'capital' });
            }}
            style={{
              ...styles.createBtn,
              background: myNickname ? colors.btnPrimary : colors.panelAlt,
              color: myNickname ? colors.btnPrimaryText : colors.textMuted,
              border: myNickname ? 'none' : `1px solid ${colors.border}`,
            }}
            title={myNickname ? undefined : '닉네임을 먼저 입력하세요'}
          >
            방 만들기
          </button>
        </div>

        <SignPanel rail={['seoul_2', 'seoul_3', 'seoul_4']}>
          <div style={styles.boardHead}>
            <h1 style={styles.title}>방 목록</h1>
            <span style={styles.count}>
              {roomList.length}
              <span style={styles.countUnit}>개</span>
            </span>
          </div>

          {/* Filters */}
          <div style={styles.filterRow}>
            {FILTER_LABELS.map((label) => {
              const active = label === activeLabel;
              return (
                <button
                  key={label}
                  onClick={() => setActiveLabel(label)}
                  className="sg-btn"
                  aria-pressed={active}
                  style={{
                    ...styles.filterChip,
                    background: active ? colors.text : colors.panel,
                    color: active ? colors.panel : colors.textDim,
                    borderColor: active ? colors.text : colors.border,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Column captions */}
          {roomList.length > 0 && (
            <div style={styles.columnHead}>
              <span style={{ flex: 1 }}>운행 정보</span>
              <span style={{ width: 106, textAlign: 'right' }}>탑승</span>
            </div>
          )}

          {/* Rows */}
          <div style={styles.list}>
            {roomList.length === 0 ? (
              <div style={styles.empty}>
                <RouteMark size={30} />
                <div style={styles.emptyTitle}>대기 중인 방이 없습니다</div>
                <div style={styles.emptyHint}>방을 만들면 첫 번째 열차가 됩니다</div>
              </div>
            ) : (
              roomList.map((room) => (
                <RoomRow key={room.roomId} room={room} nickname={myNickname} client={client} />
              ))
            )}
          </div>
        </SignPanel>
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
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const isWaiting = room.phase === 'waiting';
  const isPrivate = !room.isPublic;
  const tierLabel =
    room.tierFilter.includes('intro')
      ? '입문'
      : room.tierFilter.includes('hardcore')
        ? '하드코어'
        : '일반';
  const statusColor = isWaiting ? colors.accent : colors.activeGold;
  const statusLabel = isWaiting ? '대기중' : '운행중';

  const enter = (): void => {
    if (!nickname) return;
    if (isPrivate || room.hasPassword) {
      setShowPasswordModal(true);
      return;
    }
    join();
  };

  const join = (): void => {
    if (!nickname) return;
    client.joinRoom({
      roomId: room.roomId,
      nickname,
      password: password || undefined,
      isSpectator: !isWaiting,
    });
    setShowPasswordModal(false);
    setPassword('');
  };

  return (
    <div className="sg-row" style={styles.roomRow}>
      {/* Status lamp — the row's line color */}
      <span aria-hidden="true" style={{ ...styles.statusLamp, background: statusColor }} />

      {/* Service info */}
      <div style={styles.rowInfo}>
        <div style={styles.rowTitleLine}>
          {isPrivate ? (
            <button
              className="sg-btn"
              disabled={!nickname}
              onClick={enter}
              style={styles.privateRoomTitle}
              title="비밀번호를 입력해 입장"
            >
              <LockGlyph />
              <span style={styles.titleText}>{room.title}</span>
            </button>
          ) : (
            <span style={styles.titleText}>{room.title}</span>
          )}
        </div>
        <div style={styles.rowMeta}>
          <span style={{ ...styles.statusText, color: statusColor }}>{statusLabel}</span>
          <span aria-hidden="true" style={styles.metaDot}>·</span>
          <span>{tierLabel}</span>
          <span aria-hidden="true" style={styles.metaDot}>·</span>
          <span>{room.rounds}라운드</span>
        </div>
      </div>

      {/* Seat map + boarding */}
      <div style={styles.rowAction}>
        <div style={styles.seatMap} title={`${room.playerCount}/${MAX_SEATS}명`}>
          {Array.from({ length: MAX_SEATS }, (_, i) => (
            <span
              key={i}
              style={{
                ...styles.seat,
                background: i < room.playerCount ? colors.text : 'transparent',
                borderColor: i < room.playerCount ? colors.text : colors.border,
              }}
            />
          ))}
        </div>
        <span style={styles.seatCount}>
          {room.playerCount}/{MAX_SEATS}
        </span>
        <button
          className={`sg-btn ${isWaiting && nickname ? 'sg-btn-ink' : ''}`}
          disabled={!nickname}
          onClick={enter}
          style={{
            ...styles.boardBtn,
            background: isWaiting ? colors.btnPrimary : colors.panel,
            color: isWaiting ? colors.btnPrimaryText : colors.textDim,
            border: isWaiting ? 'none' : `1px solid ${colors.border}`,
            opacity: nickname ? 1 : 0.45,
          }}
          title={room.hasPassword ? '비밀번호를 입력해 입장' : undefined}
        >
          {isWaiting ? '입장' : '관전'}
        </button>
      </div>

      {showPasswordModal && (
        <div
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowPasswordModal(false);
          }}
          style={styles.modalBackdrop}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`password-title-${room.roomId}`}
            style={styles.modalCard}
          >
            <div style={styles.modalHead}>
              <LockGlyph size={13} decorative />
              <span id={`password-title-${room.roomId}`} style={styles.modalTitle}>
                {room.title}
              </span>
            </div>
            {room.hasPassword ? (
              <>
                <p style={styles.modalDescription}>방장이 설정한 비밀번호를 입력하세요.</p>
                <input
                  autoFocus
                  className="sg-input"
                  type="password"
                  aria-label="방 비밀번호"
                  placeholder="••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && password) join();
                    if (e.key === 'Escape') setShowPasswordModal(false);
                  }}
                  style={styles.modalPasswordInput}
                />
              </>
            ) : (
              <p style={styles.modalDescription}>
                방장이 아직 비밀번호를 설정하지 않았습니다. 초대 코드를 이용해 주세요.
              </p>
            )}
            <div style={styles.modalActions}>
              <button
                onClick={() => setShowPasswordModal(false)}
                className="sg-btn"
                style={styles.modalCancelButton}
              >
                취소
              </button>
              {room.hasPassword && (
                <button
                  className="sg-btn sg-btn-ink"
                  disabled={!password}
                  onClick={join}
                  style={{ ...styles.modalJoinButton, opacity: password ? 1 : 0.45 }}
                >
                  {isWaiting ? '입장' : '관전'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A drawn padlock. Replaces the 🔒 emoji so the mark matches the signage
 * line weight instead of rendering as whatever the OS ships.
 */
function LockGlyph({
  size = 12,
  decorative = false,
}: {
  size?: number;
  decorative?: boolean;
}): JSX.Element {
  return (
    <svg
      width={size}
      height={size * 1.15}
      viewBox="0 0 12 14"
      aria-label={decorative ? undefined : '비공개 방'}
      role={decorative ? 'presentation' : 'img'}
      aria-hidden={decorative ? true : undefined}
      style={{ flexShrink: 0, display: 'block' }}
    >
      <path
        d="M3 6V4.2A3 3 0 0 1 9 4.2V6"
        fill="none"
        stroke={colors.textDim}
        strokeWidth="1.6"
      />
      <rect x="1.2" y="6" width="9.6" height="7" rx="1" fill={colors.textDim} />
    </svg>
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
  stack: {
    width: '100%',
    maxWidth: 620,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  backBtn: {
    fontSize: 11,
    fontFamily: fonts.body,
    fontWeight: 500,
    letterSpacing: tracking.ko,
    color: colors.textDim,
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: '7px 12px',
    whiteSpace: 'nowrap',
  },
  createBtn: {
    fontSize: 12,
    fontFamily: fonts.body,
    fontWeight: 700,
    borderRadius: radii.md,
    padding: '8px 16px',
    whiteSpace: 'nowrap',
  },
  boardHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    padding: '16px 18px 12px',
  },
  title: {
    margin: 0,
    fontFamily: fonts.display,
    fontSize: 26,
    fontWeight: 400,
    letterSpacing: tracking.tight,
    color: colors.text,
  },
  count: {
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: 600,
    color: colors.text,
    fontVariantNumeric: 'tabular-nums',
  },
  countUnit: {
    marginLeft: 2,
    fontFamily: fonts.body,
    fontSize: 10,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
  },
  filterRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    padding: '0 18px 14px',
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  filterChip: {
    fontSize: 11,
    fontFamily: fonts.body,
    fontWeight: 600,
    letterSpacing: tracking.ko,
    padding: '6px 13px',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderStyle: 'solid',
  },
  columnHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 18px 8px',
    background: colors.panelAlt,
    borderBottom: `1px solid ${colors.borderLight}`,
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: 500,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '46px 20px',
    textAlign: 'center',
  },
  emptyTitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: 600,
    color: colors.textDim,
  },
  emptyHint: {
    fontFamily: fonts.body,
    fontSize: 10,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
  },
  roomRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    padding: '13px 18px',
    borderBottom: `1px solid ${colors.borderLight}`,
    background: colors.panel,
  },
  statusLamp: {
    width: 4,
    alignSelf: 'stretch',
    minHeight: 30,
    flexShrink: 0,
    borderRadius: 1,
  },
  rowInfo: {
    flex: 1,
    minWidth: 0,
  },
  rowTitleLine: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
  },
  titleText: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: 600,
    color: colors.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  privateRoomTitle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    padding: 0,
    border: 'none',
    background: 'transparent',
    textAlign: 'left',
  },
  rowMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
  },
  statusText: {
    fontWeight: 700,
  },
  metaDot: {
    color: colors.border,
  },
  rowAction: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    flexShrink: 0,
  },
  seatMap: {
    display: 'flex',
    gap: 2,
  },
  seat: {
    width: 7,
    height: 11,
    borderRadius: 1,
    borderWidth: 1,
    borderStyle: 'solid',
    boxSizing: 'border-box',
  },
  seatCount: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 600,
    color: colors.textDim,
    fontVariantNumeric: 'tabular-nums',
  },
  boardBtn: {
    fontSize: 11,
    fontFamily: fonts.body,
    fontWeight: 700,
    letterSpacing: tracking.ko,
    padding: '7px 13px',
    borderRadius: radii.sm,
    whiteSpace: 'nowrap',
  },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    background: 'rgba(20, 24, 27, 0.55)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    padding: 20,
    borderRadius: radii.lg,
    border: `1px solid ${colors.border}`,
    background: colors.panel,
    boxShadow: '0 24px 64px rgba(20,24,27,0.26)',
    animation: 'sgPanelUp 240ms cubic-bezier(0.22,1,0.36,1) both',
  },
  modalHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  modalTitle: {
    fontFamily: fonts.display,
    fontSize: 19,
    fontWeight: 400,
    letterSpacing: tracking.tight,
    color: colors.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  modalDescription: {
    margin: '0 0 12px',
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 1.6,
    color: colors.textDim,
  },
  modalPasswordInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    borderRadius: radii.md,
    border: `1px solid ${colors.border}`,
    background: colors.panel,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 15,
    letterSpacing: tracking.code,
    textAlign: 'center',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  modalCancelButton: {
    padding: '9px 15px',
    borderRadius: radii.md,
    border: `1px solid ${colors.border}`,
    background: colors.panel,
    color: colors.textDim,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: 600,
  },
  modalJoinButton: {
    padding: '9px 17px',
    borderRadius: radii.md,
    border: 'none',
    background: colors.btnPrimary,
    color: colors.btnPrimaryText,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: 700,
  },
};
