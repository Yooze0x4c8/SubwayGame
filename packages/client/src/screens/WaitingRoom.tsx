/**
 * WaitingRoom (기획서 1G): player slots + ready toggle; host start.
 *
 * This is the platform before departure. The invite code is set like the code on
 * a ticket — oversized mono, wide tracking, the one thing you're meant to read
 * across a table. The eight seats are a car seating map: each occupied seat
 * carries its player's color as a rail and turns to 준비 when they're ready.
 * Host settings sit in the right column as a signage spec sheet.
 *
 * On phone widths the same content is rebuilt as a fixed shell: a scrolling body
 * over a dock that holds the action row and a collapsed chat bar, so the chat
 * input stays above the soft keyboard. The phone also drops what it cannot act
 * on — empty seats collapse to one 빈 좌석 N chip, a non-host sees a one-line
 * settings read-out instead of the spec sheet, and the 관전 panel only appears
 * when someone is actually spectating.
 *
 * Preserves: data-testid="room-code", "player-slots", "ready-toggle", "start-game".
 */

import { useState } from 'react';

import type { PlayerSnapshot } from '@subway/shared';
import { ChatPanel } from '../components/ChatPanel.js';
import { useGameClient, useGameStore } from '../state/StoreProvider.js';
import { useIsMobile } from '../ui/responsive.js';
import { colors, fonts, radii, tracking, playerColor } from '../ui/theme.js';
import { SignPanel, Wordmark } from '../ui/signage.js';

const MAX_PLAYERS = 8;

interface WaitingRoomProps {
  onLeave: () => void;
}

export function WaitingRoom({ onLeave }: WaitingRoomProps): JSX.Element {
  const client = useGameClient();
  const isMobile = useIsMobile();
  const room = useGameStore((s) => s.room);
  const mySeatIdx = useGameStore((s) => s.mySeatIdx);
  const isSpectator = useGameStore((s) => s.isSpectator);
  const resetToLanding = useGameStore((s) => s.resetToLanding);
  const chatMessages = useGameStore((s) => s.chatMessages);
  const myNickname = useGameStore((s) => s.myNickname);
  const [copied, setCopied] = useState(false);
  const [titleDraft, setTitleDraft] = useState<string | undefined>(undefined);
  const [passwordDraft, setPasswordDraft] = useState('');

  if (!room) {
    return (
      <div style={styles.loading}>방 정보를 불러오는 중…</div>
    );
  }

  const me = mySeatIdx !== undefined
    ? room.players.find((p) => p.seatIdx === mySeatIdx)
    : undefined;
  const iAmHost = me?.isHost ?? false;
  const nonHostPlayers = room.players.filter((p) => !p.isHost);
  const canStart =
    room.players.length >= 2 &&
    nonHostPlayers.length > 0 &&
    nonHostPlayers.every((p) => p.ready);
  const lineFilterDescription = room.settings.tierFilter.includes('intro')
    ? '시작 노선·역: 서울 1~9호선'
    : room.settings.tierFilter.includes('hardcore')
      ? '시작 노선·역: 경전철(신림선·우이신설선 등)'
      : '시작 노선·역: 광역철도·인천 지하철';

  const handleLeave = (): void => {
    resetToLanding();
    client.leaveRoom();
    onLeave();
  };

  const copyCode = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available — no-op
    }
  };

  // Build 8-slot array (filled | null for empty)
  const slots: Array<PlayerSnapshot | null> = Array(MAX_PLAYERS).fill(null);
  for (const p of room.players) {
    if (p.seatIdx >= 0 && p.seatIdx < MAX_PLAYERS) slots[p.seatIdx] = p;
  }

  const readyCount = room.players.filter((p) => p.ready).length;
  const emptySeats = MAX_PLAYERS - room.players.length;
  const tierLabel = room.settings.tierFilter.includes('intro')
    ? '입문'
    : room.settings.tierFilter.includes('hardcore')
      ? '하드코어'
      : '일반';
  const modeLabel = room.settings.gameMode === 'railExpansion' ? '고속철도 확장' : '일반 지하철';
  const spectatorCount = room.spectators?.length ?? 0;

  // Mobile fields must compute at ≥16px or iOS zooms the page on focus.
  // Spread rather than alias: `styles` is a Record, so under
  // noUncheckedIndexedAccess a bare `styles.textInput` is possibly-undefined.
  const textInputStyle: React.CSSProperties = isMobile
    ? { ...styles.textInput, ...styles.textInputMobile }
    : { ...styles.textInput };
  const mobileTextProps = {
    autoComplete: 'off',
    autoCorrect: 'off',
    autoCapitalize: 'off',
    spellCheck: false,
  } as const;

  const topBar = (
    <div style={styles.topBar}>
      <Wordmark size={17} />
      <span style={styles.phaseBadge}>대기실</span>
    </div>
  );

  // Invite code — the ticket. Kept on mobile: it is why the screen is open.
  const invitePanel = (
    <SignPanel rail={['seoul_2']}>
      <div style={styles.codeBlock}>
        <div style={styles.codeLabel}>입장 코드</div>
        <div style={styles.codeRow}>
          <span
            data-testid="room-code"
            style={isMobile ? { ...styles.codeValue, fontSize: 26 } : styles.codeValue}
          >
            {room.code}
          </span>
          <button
            onClick={copyCode}
            className="sg-btn"
            style={{
              ...styles.copyBtn,
              ...(isMobile ? styles.copyBtnMobile : null),
              background: copied ? colors.accentDim : colors.panel,
              color: copied ? colors.accent : colors.textDim,
              borderColor: copied ? colors.accent : colors.border,
            }}
          >
            {copied ? '복사됨' : '복사'}
          </button>
        </div>
      </div>
    </SignPanel>
  );

  // Seats. On a phone eight dashed placeholders are most of the screen, so only
  // occupied seats render and the remainder collapses into one chip.
  const seatsPanel = (
    <SignPanel
      style={{ padding: isMobile ? '12px 12px 13px' : '14px 14px 16px' }}
    >
      <div style={styles.colHead}>
        <span style={styles.colTitle}>탑승</span>
        <span style={styles.colCount}>
          {room.players.length}/{MAX_PLAYERS}
        </span>
      </div>
      <div
        data-testid="player-slots"
        style={isMobile ? { ...styles.slotsGrid, gridTemplateColumns: '1fr' } : styles.slotsGrid}
      >
        {isMobile
          ? slots.map((p, idx) => (
            p && <PlayerSlot key={idx} player={p} seatIdx={idx} isMe={idx === mySeatIdx} />
          ))
          : slots.map((p, idx) => (
            <PlayerSlot key={idx} player={p} seatIdx={idx} isMe={idx === mySeatIdx} />
          ))}
        {isMobile && emptySeats > 0 && (
          <div style={styles.emptySeatChip}>빈 좌석 {emptySeats}</div>
        )}
      </div>
      <div style={styles.readyLine}>
        준비 {readyCount}/{room.players.length}
      </div>
    </SignPanel>
  );

  // Host settings, the full spec sheet.
  const settingsPanel = (
    <SignPanel
      style={{ padding: isMobile ? '12px 12px 4px' : '14px 14px 16px' }}
    >
      <div style={styles.colHead}>
        <span style={styles.colTitle}>운행 설정</span>
        {!iAmHost && <span style={styles.colCount}>방장 전용</span>}
      </div>

      {/* Room title */}
      <div style={styles.settingBlock}>
        <div style={styles.settingLabel}>방 제목</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="sg-input"
            disabled={!iAmHost}
            aria-label="방 제목"
            {...mobileTextProps}
            value={titleDraft ?? room.settings.title ?? ''}
            placeholder={`${room.players.find((p) => p.isHost)?.nickname ?? '방장'}의 방`}
            onChange={(e) => setTitleDraft(e.target.value)}
            style={{
              ...textInputStyle,
              background: iAmHost ? colors.panel : colors.panelAlt,
              cursor: iAmHost ? 'text' : 'default',
            }}
          />
          {iAmHost && titleDraft !== undefined && (
            <button
              className="sg-btn"
              onClick={() => {
                const val = titleDraft.trim();
                client.updateSettings({ title: val || undefined });
                setTitleDraft(undefined);
              }}
              style={isMobile ? { ...styles.saveBtn, ...styles.saveBtnMobile } : styles.saveBtn}
            >
              저장
            </button>
          )}
        </div>
      </div>

      <SettingGroup
        label="방 공개"
        options={['공개', '비공개']}
        selected={room.settings.isPublic ? '공개' : '비공개'}
        disabled={!iAmHost}
        mobile={isMobile}
        onSelect={(opt) => client.updateSettings(
          opt === '공개'
            ? { isPublic: true, password: '' }
            : { isPublic: false },
        )}
      />

      {!room.settings.isPublic && (
        <div style={styles.settingBlock}>
          <div style={styles.settingLabel}>입장 비밀번호</div>
          {iAmHost ? (
            <>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="sg-input"
                  type="password"
                  aria-label="입장 비밀번호"
                  {...mobileTextProps}
                  value={passwordDraft}
                  placeholder={room.hasPassword ? '설정됨' : '없음'}
                  onChange={(e) => setPasswordDraft(e.target.value)}
                  style={{ ...textInputStyle, fontFamily: fonts.mono }}
                />
                <button
                  className="sg-btn"
                  disabled={!passwordDraft && !room.hasPassword}
                  onClick={() => {
                    client.updateSettings({ password: passwordDraft });
                    setPasswordDraft('');
                  }}
                  style={{
                    ...styles.saveBtn,
                    ...(isMobile ? styles.saveBtnMobile : null),
                    opacity: passwordDraft || room.hasPassword ? 1 : 0.45,
                  }}
                >
                  {passwordDraft ? '저장' : '해제'}
                </button>
              </div>
              {/* Phone drops the explainer line; the control is self-evident. */}
              {!isMobile && (
                <div style={styles.settingHint}>
                  초대 코드를 직접 입력한 참가자는 비밀번호 없이 입장합니다.
                </div>
              )}
            </>
          ) : (
            <div style={styles.readonlyField}>
              {room.hasPassword ? '비밀번호 설정됨' : '비밀번호 없음'}
            </div>
          )}
        </div>
      )}

      <SettingGroup
        label="라운드 수"
        options={['3', '5', '7']}
        selected={String(room.settings.rounds)}
        disabled={!iAmHost}
        mobile={isMobile}
        onSelect={(opt) => client.updateSettings({ rounds: parseInt(opt, 10) })}
      />
      <SettingGroup
        label="라운드 시간"
        options={['90초', '120초', '180초']}
        selected={`${room.settings.roundTimeSec}초`}
        disabled={!iAmHost}
        mobile={isMobile}
        onSelect={(opt) => client.updateSettings({ roundTimeSec: parseInt(opt, 10) })}
      />
      <SettingGroup
        label="게임 모드"
        options={['일반 지하철', '고속철도 확장']}
        description={
          room.settings.gameMode === 'railExpansion'
            ? '수도권에서 출발해 KTX·SRT로 전국을 잇는 확장 모드입니다.'
            : '선택한 지역의 지하철만으로 플레이합니다.'
        }
        selected={room.settings.gameMode === 'railExpansion' ? '고속철도 확장' : '일반 지하철'}
        descriptionTestId="game-mode-description"
        disabled={!iAmHost}
        mobile={isMobile}
        onSelect={(opt) => client.updateSettings({
          gameMode: opt === '고속철도 확장' ? 'railExpansion' : 'metro',
        })}
      />
      {/* Line-tier filter applies to the region metro game only; in
          rail-expansion the line set is fixed nation-wide. */}
      {room.settings.gameMode !== 'railExpansion' && (
        <SettingGroup
          label="노선 필터"
          options={['입문', '일반', '하드코어']}
          description={lineFilterDescription}
          selected={tierLabel}
          disabled={!iAmHost}
          mobile={isMobile}
          onSelect={(opt) => client.updateSettings({
            tierFilter:
              opt === '입문' ? ['intro'] :
              opt === '하드코어' ? ['hardcore'] :
              ['normal'],
          })}
        />
      )}
    </SignPanel>
  );

  // A non-host can change none of the above, so the phone gets the read-out only.
  const settingsSummary = (
    <SignPanel style={{ padding: '12px 12px 13px' }}>
      <div style={styles.colHead}>
        <span style={styles.colTitle}>운행 설정</span>
        <span style={styles.colCount}>방장 전용</span>
      </div>
      <div style={styles.settingsSummary}>
        {room.settings.rounds}라운드 · {room.settings.roundTimeSec}초 · {modeLabel}
        {room.settings.gameMode !== 'railExpansion' && ` · ${tierLabel}`}
      </div>
    </SignPanel>
  );

  const actions = (
    <div style={styles.actions}>
      <button
        onClick={handleLeave}
        className="sg-btn"
        style={isMobile ? { ...styles.secondaryBtn, ...styles.tapBtnMobile } : styles.secondaryBtn}
      >
        ← 나가기
      </button>

      {/* Spectator: join as player (if room not full) */}
      {isSpectator && (
        room.players.length < MAX_PLAYERS ? (
          <button
            onClick={() => client.becomePlayer()}
            className="sg-btn sg-btn-ink"
            style={{ ...styles.primaryBtn, ...(isMobile ? styles.tapBtnMobile : null), flex: 1 }}
          >
            참가하기 →
          </button>
        ) : (
          <div style={styles.fullNotice}>관전 중 · 좌석이 모두 찼습니다</div>
        )
      )}

      {/* Switch to spectator */}
      {!isSpectator && room.players.length > 1 && (
        <button
          onClick={() => client.becomeSpectator()}
          className="sg-btn"
          style={isMobile ? { ...styles.secondaryBtn, ...styles.tapBtnMobile } : styles.secondaryBtn}
        >
          관전으로
        </button>
      )}

      {/* Non-host: ready toggle */}
      {!isSpectator && !iAmHost && (
        <button
          data-testid="ready-toggle"
          onClick={() => client.setReady(!(me?.ready ?? false))}
          className={`sg-btn ${me?.ready ? '' : 'sg-btn-ink'}`}
          style={{
            ...styles.primaryBtn,
            ...(isMobile ? styles.tapBtnMobile : null),
            flex: 1,
            background: me?.ready ? colors.panel : colors.btnPrimary,
            color: me?.ready ? colors.text : colors.btnPrimaryText,
            border: me?.ready ? `1px solid ${colors.text}` : 'none',
          }}
        >
          {me?.ready ? '준비 취소' : '준비 완료'}
        </button>
      )}

      {/* Host: start */}
      {!isSpectator && iAmHost && (
        <button
          data-testid="start-game"
          disabled={!canStart}
          onClick={() => client.startGame()}
          className={`sg-btn ${canStart ? 'sg-btn-ink' : ''}`}
          style={{
            ...styles.primaryBtn,
            ...(isMobile ? styles.tapBtnMobile : null),
            flex: 1,
            background: canStart ? colors.btnPrimary : colors.panelAlt,
            color: canStart ? colors.btnPrimaryText : colors.textMuted,
            border: canStart ? 'none' : `1px solid ${colors.border}`,
          }}
        >
          {canStart
            ? '출발 →'
            : nonHostPlayers.length === 0
              ? '참가자 대기 중'
              : `준비 완료 대기 (${nonHostPlayers.filter((p) => p.ready).length}/${nonHostPlayers.length})`}
        </button>
      )}
    </div>
  );

  const spectatorsPanel = (
    <SignPanel style={{ padding: '10px 14px 12px' }}>
      <div style={styles.colHead}>
        <span style={styles.colTitle}>관전</span>
        <span style={styles.colCount}>{spectatorCount}명</span>
      </div>
      <div style={styles.spectatorBody}>
        {room.spectators && room.spectators.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {room.spectators.map((s) => (
              <span key={s.id} style={styles.spectatorChip}>
                [관전] {s.nickname}
              </span>
            ))}
          </div>
        ) : (
          <span style={styles.spectatorEmpty}>관전자 없음</span>
        )}
      </div>
    </SignPanel>
  );

  if (isMobile) {
    // Fixed shell sized to the visual viewport: the dock lands on top of the
    // soft keyboard instead of behind it, and the page cannot scroll away.
    return (
      <div style={styles.mobileRoot}>
        <div style={styles.mobileBody}>
          {topBar}
          {invitePanel}
          {seatsPanel}
          {iAmHost ? settingsPanel : settingsSummary}
          {spectatorCount > 0 && spectatorsPanel}
        </div>
        <div style={styles.mobileDock}>
          {actions}
          <ChatPanel
            messages={chatMessages}
            onSend={(t) => client.sendChat(t)}
            myNickname={myNickname}
            collapsible
            dock
          />
        </div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <div style={styles.stack}>
        {topBar}
        {invitePanel}

        {/* Two columns. The settings spec sheet is much taller than the seat map,
            so 관전 and 채팅 ride in the seats column rather than below the fold —
            otherwise the left column ends in dead space while the chat, the one
            thing people are waiting on, sits off-screen. */}
        <div style={styles.twoCol}>
          <div style={styles.colSeats}>
            {seatsPanel}
            {spectatorsPanel}
            <ChatPanel
              messages={chatMessages}
              onSend={(t) => client.sendChat(t)}
              myNickname={myNickname}
              maxHeight={150}
            />
          </div>
          <div style={styles.colSettings}>{settingsPanel}</div>
        </div>

        {actions}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** One seat in the car. Empty seats are dashed outlines; taken ones carry a rail. */
function PlayerSlot({
  player,
  seatIdx,
  isMe,
}: {
  player: PlayerSnapshot | null;
  seatIdx: number;
  isMe: boolean;
}): JSX.Element {
  if (!player) {
    return (
      <div style={styles.slotEmpty}>
        <span style={styles.slotNumber}>{seatIdx + 1}</span>
        <span style={styles.slotEmptyText}>빈 좌석</span>
      </div>
    );
  }

  const pColor = playerColor(player.seatIdx);

  return (
    <div
      style={{
        ...styles.slotFilled,
        borderColor: player.ready ? colors.accent : colors.border,
      }}
    >
      <span aria-hidden="true" style={{ ...styles.slotRail, background: pColor }} />
      <div style={styles.slotMain}>
        <div style={styles.slotNameRow}>
          <span style={styles.slotName}>{player.nickname}</span>
          {player.isHost && <span style={styles.hostBadge}>방장</span>}
          {isMe && <span style={styles.meBadge}>나</span>}
        </div>
        <span
          style={{
            ...styles.slotStatus,
            color: player.ready ? colors.accent : colors.textMuted,
          }}
        >
          {player.ready ? '준비 완료' : '대기 중'}
        </span>
      </div>
    </div>
  );
}

function SettingGroup({ label, options, selected, description, descriptionTestId, onSelect, disabled, mobile = false }: {
  label: string;
  options: string[];
  selected: string;
  description?: string;
  /** data-testid for the description line (defaults to the line-filter id). */
  descriptionTestId?: string;
  onSelect?: (opt: string) => void;
  disabled?: boolean;
  /** Phone layout: options grow to a 44px touch target. */
  mobile?: boolean;
}): JSX.Element {
  return (
    <div style={styles.settingBlock}>
      <div style={styles.settingLabel}>{label}</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {options.map((opt) => {
          const isSelected = opt === selected;
          return (
            <button
              key={opt}
              className="sg-btn"
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => !disabled && onSelect?.(opt)}
              style={{
                fontSize: mobile ? 13 : 12,
                fontFamily: fonts.body,
                fontWeight: 600,
                letterSpacing: tracking.ko,
                padding: mobile ? '12px 14px' : '6px 11px',
                minHeight: mobile ? 44 : undefined,
                borderRadius: radii.sm,
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: isSelected ? colors.text : colors.border,
                background: isSelected ? colors.text : colors.panel,
                color: isSelected ? colors.panel : colors.textDim,
                cursor: disabled ? 'default' : 'pointer',
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {description && (
        <div
          data-testid={descriptionTestId ?? 'line-filter-description'}
          style={styles.settingDescription}
        >
          {description}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: 'var(--app-height)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '4vh 16px 32px',
    background: colors.bg,
  },
  stack: {
    width: '100%',
    maxWidth: 820,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },

  // Phone shell: pinned to the *visual* viewport so the dock sits on top of the
  // soft keyboard rather than behind it.
  mobileRoot: {
    position: 'fixed',
    top: 'var(--app-viewport-top)',
    left: 0,
    right: 0,
    height: 'var(--app-height)',
    maxWidth: 820,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: colors.bg,
  },
  mobileBody: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '10px 12px 12px',
  },
  mobileDock: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    borderTop: `1px solid ${colors.border}`,
    background: colors.panel,
    padding: '8px 12px calc(8px + var(--safe-bottom))',
  },
  loading: {
    padding: 24,
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: tracking.ko,
    color: colors.textDim,
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  phaseBadge: {
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: tracking.ko,
    color: colors.panel,
    background: colors.text,
    borderRadius: radii.sm,
    padding: '4px 10px',
  },

  // Invite code
  codeBlock: {
    padding: '13px 16px 14px',
  },
  codeLabel: {
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: 500,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
    marginBottom: 5,
  },
  codeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  codeValue: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.mono,
    fontSize: 30,
    fontWeight: 600,
    letterSpacing: tracking.code,
    color: colors.text,
    lineHeight: 1.1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  copyBtn: {
    flexShrink: 0,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: tracking.ko,
    padding: '7px 13px',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderStyle: 'solid',
    whiteSpace: 'nowrap',
  },
  copyBtnMobile: {
    fontSize: 12,
    minHeight: 44,
    padding: '11px 16px',
  },

  // Columns
  twoCol: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  /* The two desktop columns. Sizing lives here rather than on each SignPanel,
     because the left column now stacks three panels (탑승 · 관전 · 채팅) and they
     all have to share one track. */
  colSeats: {
    flex: '1.15 1 300px',
    minWidth: 280,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  colSettings: {
    flex: '1 1 260px',
    minWidth: 240,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  colHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 9,
    marginBottom: 11,
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  colTitle: {
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: tracking.ko,
    color: colors.textDim,
  },
  // Mixes counts with Korean units ("8/8", "2명", "방장 전용") — body face.
  colCount: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: 500,
    color: colors.textMuted,
    fontVariantNumeric: 'tabular-nums',
  },

  // Seats
  // 8 seats, so the track count must divide 8 evenly or the last row goes ragged.
  slotsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: 6,
  },
  slotEmpty: {
    height: 50,
    borderRadius: radii.md,
    border: `1px dashed ${colors.border}`,
    background: colors.panelAlt,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  slotNumber: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: 600,
    color: colors.textMuted,
  },
  slotEmptyText: {
    fontFamily: fonts.body,
    fontSize: 9,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
  },
  slotFilled: {
    height: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'solid',
    background: colors.panel,
    display: 'flex',
    alignItems: 'stretch',
    overflow: 'hidden',
    transition: 'border-color 200ms ease',
  },
  slotRail: {
    width: 4,
    flexShrink: 0,
  },
  slotMain: {
    flex: 1,
    minWidth: 0,
    padding: '0 9px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 2,
  },
  slotNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
  },
  slotName: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: 600,
    color: colors.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  hostBadge: {
    flexShrink: 0,
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: tracking.ko,
    color: colors.panel,
    background: colors.text,
    borderRadius: 2,
    padding: '2px 4px',
  },
  meBadge: {
    flexShrink: 0,
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: 600,
    color: colors.textMuted,
  },
  slotStatus: {
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: tracking.ko,
  },
  // Mobile stand-in for the dashed placeholder seats.
  emptySeatChip: {
    height: 34,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    border: `1px dashed ${colors.border}`,
    background: colors.panelAlt,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
    fontVariantNumeric: 'tabular-nums',
  },
  readyLine: {
    marginTop: 10,
    fontFamily: fonts.body,
    fontSize: 10,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },

  // Settings
  settingBlock: {
    marginBottom: 12,
  },
  settingLabel: {
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: 500,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
    marginBottom: 5,
  },
  textInput: {
    flex: 1,
    minWidth: 0,
    boxSizing: 'border-box',
    fontSize: 12,
    fontFamily: fonts.body,
    fontWeight: 600,
    padding: '7px 10px',
    borderRadius: radii.sm,
    border: `1px solid ${colors.border}`,
    color: colors.text,
    background: colors.panel,
  },
  // iOS zooms the page when a focused field computes under 16px.
  textInputMobile: {
    fontSize: 16,
    fontWeight: 500,
    padding: '11px 12px',
    minHeight: 44,
  },
  saveBtn: {
    flexShrink: 0,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: tracking.ko,
    padding: '7px 11px',
    borderRadius: radii.sm,
    border: 'none',
    background: colors.text,
    color: colors.panel,
    whiteSpace: 'nowrap',
  },
  saveBtnMobile: {
    fontSize: 12,
    minHeight: 44,
    padding: '11px 14px',
  },
  settingHint: {
    marginTop: 5,
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 1.5,
    color: colors.textMuted,
  },
  settingDescription: {
    marginTop: 6,
    display: 'flex',
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1.45,
    color: colors.info,
  },
  readonlyField: {
    padding: '7px 10px',
    borderRadius: radii.sm,
    background: colors.panelAlt,
    border: `1px solid ${colors.border}`,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textDim,
  },
  // Mobile non-host read-out: "5라운드 · 120초 · 일반 지하철 · 일반".
  settingsSummary: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.5,
    color: colors.textDim,
    fontVariantNumeric: 'tabular-nums',
  },

  // Actions
  actions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  primaryBtn: {
    minWidth: 150,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: 700,
    padding: '13px 18px',
    borderRadius: radii.md,
    lineHeight: 1,
  },
  secondaryBtn: {
    flexShrink: 0,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: tracking.ko,
    padding: '13px 15px',
    borderRadius: radii.md,
    border: `1px solid ${colors.border}`,
    background: colors.panel,
    color: colors.textDim,
    lineHeight: 1,
  },
  tapBtnMobile: {
    minHeight: 46,
    minWidth: 0,
    padding: '13px 14px',
  },
  fullNotice: {
    flex: 1,
    minWidth: 150,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '13px 16px',
    borderRadius: radii.md,
    background: colors.panelAlt,
    border: `1px solid ${colors.border}`,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: 600,
    color: colors.textDim,
  },

  // Spectators
  spectatorBody: {
    minHeight: 22,
    display: 'flex',
    alignItems: 'center',
  },
  spectatorChip: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: 600,
    color: colors.textDim,
    background: colors.panelAlt,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    padding: '3px 9px',
  },
  spectatorEmpty: {
    fontFamily: fonts.body,
    fontSize: 10,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
  },
};
