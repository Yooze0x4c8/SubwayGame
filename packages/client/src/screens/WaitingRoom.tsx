/**
 * WaitingRoom (기획서 1G): player slots + ready toggle; host start.
 *
 * Visual spec (wireframe):
 *   - Light theme, white card on light gray bg
 *   - Two-column layout: left = player slots (white cards), right = host settings
 *   - Player slots: white bg, dark border, circle avatar, crown icon for host
 *   - Ready state: green "준비 ✔" text, not ready: orange "준비중..." text
 *   - Empty slots: dashed border with "+ 대기 중" text
 *   - Setting toggles: selected = gold/yellow bg, unselected = white bg
 *   - Invite link with copy button at top
 *
 * Preserves: data-testid="room-code", "player-slots", "ready-toggle", "start-game".
 */

import { useState } from 'react';

import type { PlayerSnapshot } from '@subway/shared';
import { ChatPanel } from '../components/ChatPanel.js';
import { useGameClient, useGameStore } from '../state/StoreProvider.js';
import { colors, fonts, radii, playerColor, space } from '../ui/theme.js';

const MAX_PLAYERS = 8;

interface WaitingRoomProps {
  onLeave: () => void;
}

export function WaitingRoom({ onLeave }: WaitingRoomProps): JSX.Element {
  const client = useGameClient();
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
      <div style={{ padding: 24, color: colors.textDim, fontFamily: fonts.body }}>
        방 정보를 불러오는 중…
      </div>
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

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.wordmark}>🚇 SUBWAY</span>
          <span style={styles.phaseBadge}>대기실</span>
        </div>

        {/* Invite code */}
        <div style={styles.codeBlock}>
          <div style={styles.codeLabel}>입장 코드</div>
          <div style={styles.codeRow}>
            <span data-testid="room-code" style={styles.codeValue}>
              {room.code}
            </span>
            <button
              onClick={copyCode}
              style={{
                ...styles.copyBtn,
                background: copied ? colors.accentDim : colors.panel,
                color: copied ? colors.accent : colors.textDim,
                borderColor: copied ? colors.accent : colors.border,
              }}
            >
              {copied ? '복사됨 ✓' : '🔗 복사'}
            </button>
          </div>
          <div style={styles.codeHint}>친구에게 공유하세요</div>
        </div>

        {/* Two-column layout */}
        <div style={styles.twoCol}>
          {/* Left: Player slots */}
          <div style={styles.leftCol}>
            <div data-testid="player-slots" style={styles.slotsGrid}>
              {slots.map((p, idx) => (
                <PlayerSlot
                  key={idx}
                  player={p}
                  isMe={idx === mySeatIdx}
                />
              ))}
            </div>
          </div>

          {/* Right: Room settings */}
          <div style={styles.rightCol}>
            <div style={styles.settingsTitle}>방장 설정</div>

            {/* Room title */}
            <div style={{ marginBottom: 12 }}>
              <div style={styles.settingLabel}>방 제목</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  disabled={!iAmHost}
                  value={titleDraft ?? room.settings.title ?? ''}
                  placeholder={`${room.players.find(p => p.isHost)?.nickname ?? '방장'}의 방`}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    boxSizing: 'border-box',
                    fontSize: 13,
                    fontFamily: fonts.body,
                    fontWeight: 600,
                    padding: '6px 10px',
                    borderRadius: radii.sm,
                    border: `1px solid ${colors.border}`,
                    background: iAmHost ? colors.panel : colors.panelAlt,
                    color: colors.text,
                    outline: 'none',
                    cursor: iAmHost ? 'text' : 'default',
                  }}
                />
                {iAmHost && titleDraft !== undefined && (
                  <button
                    onClick={() => {
                      const val = titleDraft.trim();
                      client.updateSettings({ title: val || undefined });
                      setTitleDraft(undefined);
                    }}
                    style={{
                      fontSize: 12,
                      fontFamily: fonts.mono,
                      fontWeight: 700,
                      padding: '6px 12px',
                      borderRadius: radii.sm,
                      border: `1px solid ${colors.accent}`,
                      background: colors.accent,
                      color: '#fff',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
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
              onSelect={(opt) => client.updateSettings(
                opt === '공개'
                  ? { isPublic: true, password: '' }
                  : { isPublic: false },
              )}
            />

            {!room.settings.isPublic && (
              <div style={{ marginBottom: 12 }}>
                <div style={styles.settingLabel}>입장 비밀번호</div>
                {iAmHost ? (
                  <>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="password"
                        aria-label="입장 비밀번호"
                        value={passwordDraft}
                        placeholder={room.hasPassword ? '비밀번호 설정됨' : '비밀번호 없음'}
                        onChange={(e) => setPasswordDraft(e.target.value)}
                        style={styles.passwordInput}
                      />
                      <button
                        disabled={!passwordDraft && !room.hasPassword}
                        onClick={() => {
                          client.updateSettings({ password: passwordDraft });
                          setPasswordDraft('');
                        }}
                        style={{
                          ...styles.passwordButton,
                          opacity: passwordDraft || room.hasPassword ? 1 : 0.45,
                          cursor: passwordDraft || room.hasPassword ? 'pointer' : 'not-allowed',
                        }}
                      >
                        {passwordDraft ? '저장' : '해제'}
                      </button>
                    </div>
                    <div style={styles.passwordHint}>
                      초대 코드를 직접 입력한 참가자는 비밀번호 없이 입장합니다.
                    </div>
                  </>
                ) : (
                  <div style={styles.passwordStatus}>
                    {room.hasPassword ? '🔒 비밀번호 설정됨' : '비밀번호 없음'}
                  </div>
                )}
              </div>
            )}

            <SettingGroup
              label="라운드 수"
              options={['3', '5', '7']}
              selected={String(room.settings.rounds)}
              disabled={!iAmHost}
              onSelect={(opt) => client.updateSettings({ rounds: parseInt(opt, 10) })}
            />
            <SettingGroup
              label="라운드 시간"
              options={['90초', '120초', '180초']}
              selected={`${room.settings.roundTimeSec}초`}
              disabled={!iAmHost}
              onSelect={(opt) => client.updateSettings({ roundTimeSec: parseInt(opt, 10) })}
            />
            <SettingGroup
              label="노선 필터"
              options={['입문', '일반', '하드코어']}
              selected={
                room.settings.tierFilter.includes('intro')
                  ? '입문'
                  : room.settings.tierFilter.includes('hardcore')
                    ? '하드코어'
                    : '일반'
              }
              disabled={!iAmHost}
              onSelect={(opt) => client.updateSettings({
                tierFilter:
                  opt === '입문' ? ['intro'] :
                  opt === '하드코어' ? ['hardcore'] :
                  ['normal'],
              })}
            />
          </div>
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          {/* Leave room button — always visible */}
          <button
            onClick={handleLeave}
            style={{
              ...styles.btn,
              background: colors.panel,
              color: colors.textDim,
              border: `1.5px solid ${colors.border}`,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ← 나가기
          </button>

          {/* Spectator: join as player (if room not full) */}
          {isSpectator && (
            room.players.length < MAX_PLAYERS ? (
              <button
                onClick={() => client.becomePlayer()}
                style={{
                  ...styles.btn,
                  flex: 1,
                  background: colors.btnPrimary,
                  color: colors.btnPrimaryText,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                참가하기 →
              </button>
            ) : (
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '13px 16px',
                borderRadius: radii.md,
                background: colors.panelAlt,
                border: `1.5px solid ${colors.border}`,
                fontSize: 14,
                fontFamily: fonts.body,
                fontWeight: 600,
                color: colors.textDim,
              }}>
                👁 관전 중 (방 인원 꽉 참)
              </div>
            )
          )}

          {/* Switch to spectator — available to any player when room has >1 member */}
          {!isSpectator && room.players.length > 1 && (
            <button
              onClick={() => client.becomeSpectator()}
              style={{
                ...styles.btn,
                background: colors.panel,
                color: colors.textMuted,
                border: `1.5px solid ${colors.border}`,
                cursor: 'pointer',
                flexShrink: 0,
                fontSize: 13,
              }}
            >
              👁 관전
            </button>
          )}

          {/* Host only sees start button; non-host sees ready toggle */}
          {!isSpectator && !iAmHost && (
            <button
              data-testid="ready-toggle"
              onClick={() => client.setReady(!(me?.ready ?? false))}
              style={{
                ...styles.btn,
                flex: 1,
                background: me?.ready ? colors.panel : colors.btnPrimary,
                color: me?.ready ? colors.text : colors.btnPrimaryText,
                border: me?.ready ? `1.5px solid ${colors.border}` : 'none',
                cursor: 'pointer',
              }}
            >
              {me?.ready ? '준비 취소' : '준비 완료'}
            </button>
          )}

          {!isSpectator && iAmHost && (
            <button
              data-testid="start-game"
              disabled={!canStart}
              onClick={() => client.startGame()}
              style={{
                ...styles.btn,
                flex: 1,
                background: canStart ? colors.btnPrimary : colors.panelAlt,
                color: canStart ? colors.btnPrimaryText : colors.textMuted,
                cursor: canStart ? 'pointer' : 'not-allowed',
                border: 'none',
              }}
            >
              {canStart
                ? '게임 시작 →'
                : nonHostPlayers.length === 0
                  ? '참가자 대기 중'
                  : `준비 완료 대기 (${nonHostPlayers.filter((p) => p.ready).length}/${nonHostPlayers.length})`}
            </button>
          )}
        </div>

        {/* Spectator section — always visible */}
        <div style={styles.spectatorSection}>
          <div style={styles.spectatorHeader}>
            <span style={styles.spectatorLabel}>👁 관전</span>
            <span style={styles.spectatorCount}>
              {room.spectators?.length ?? 0}명
            </span>
          </div>
          <div style={styles.spectatorBody}>
            {room.spectators && room.spectators.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {room.spectators.map((s) => (
                  <span key={s.id} style={styles.spectatorChip}>
                    {s.nickname}
                  </span>
                ))}
              </div>
            ) : (
              <span style={styles.spectatorEmpty}>관전자 없음</span>
            )}
          </div>
        </div>

        {/* Chat */}
        <ChatPanel
          messages={chatMessages}
          onSend={(t) => client.sendChat(t)}
          myNickname={myNickname}
          maxHeight={160}
        />

        {/* Player count */}
        <div style={styles.playerCount}>
          {room.players.length} / {MAX_PLAYERS}명 입장 ·{' '}
          {room.players.filter((p) => p.ready).length}명 준비 완료
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PlayerSlot({
  player,
  isMe,
}: {
  player: PlayerSnapshot | null;
  isMe: boolean;
}): JSX.Element {
  if (!player) {
    return (
      <div style={styles.slotEmpty}>
        <span style={styles.slotEmptyText}>+ 대기 중</span>
      </div>
    );
  }

  const pColor = playerColor(player.seatIdx);
  const initial = player.nickname.charAt(0);
  return (
    <div style={{
      ...styles.slotFilled,
      borderColor: player.ready ? colors.accent : colors.border,
      background: colors.panel,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {/* Avatar circle */}
        <span style={{
          width: 28, height: 28, borderRadius: '50%',
          background: pColor, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: '#fff',
          fontFamily: fonts.body,
        }}>
          {initial}
        </span>
        <span style={{
          fontSize: 14, fontFamily: fonts.body, fontWeight: 600,
          color: colors.text, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1, minWidth: 0,
        }}>
          {player.nickname}
        </span>
        {player.isHost && (
          <span style={{ fontSize: 14, flexShrink: 0 }}>
            👑
          </span>
        )}
        {isMe && (
          <span style={{ fontSize: 10, color: colors.textMuted, fontFamily: fonts.mono, flexShrink: 0 }}>
            나
          </span>
        )}
      </div>
      <span style={{
        fontSize: 12, fontFamily: fonts.mono,
        color: player.ready ? colors.accent : '#EF7C1C',
        fontWeight: 600, flexShrink: 0,
      }}>
        {player.ready ? '준비 ✔' : '준비중...'}
      </span>
    </div>
  );
}

function SettingGroup({ label, options, selected, onSelect, disabled }: {
  label: string;
  options: string[];
  selected: string;
  onSelect?: (opt: string) => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={styles.settingLabel}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map((opt) => {
          const isSelected = opt === selected;
          return (
            <button
              key={opt}
              disabled={disabled}
              onClick={() => !disabled && onSelect?.(opt)}
              style={{
                fontSize: 12,
                fontFamily: fonts.mono,
                fontWeight: 600,
                padding: '5px 12px',
                borderRadius: radii.sm,
                border: `1px solid ${isSelected ? colors.activeGold : colors.border}`,
                background: isSelected ? colors.activeGoldDim : colors.panel,
                color: isSelected ? colors.text : colors.textDim,
                cursor: disabled ? 'default' : 'pointer',
                transition: 'background 140ms ease, border-color 140ms ease',
              }}
            >
              {opt}
            </button>
          );
        })}
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
    padding: '5vh 16px 32px',
    background: colors.bg,
  },
  card: {
    width: '100%',
    maxWidth: 860,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.xl,
    padding: '24px 24px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: 400,
    color: colors.text,
    letterSpacing: '-0.01em',
  },
  phaseBadge: {
    fontSize: 11,
    fontFamily: fonts.mono,
    letterSpacing: '0.1em',
    color: colors.textDim,
    background: colors.panelAlt,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.full,
    padding: '3px 10px',
  },
  codeBlock: {
    background: colors.panelAlt,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    padding: '14px 16px 12px',
  },
  codeLabel: {
    fontSize: 10, fontFamily: fonts.mono,
    letterSpacing: '0.12em', textTransform: 'uppercase',
    color: colors.textMuted, marginBottom: 6,
  },
  codeRow: {
    display: 'flex', alignItems: 'center', gap: 10,
  },
  codeValue: {
    fontFamily: fonts.mono, fontSize: 28,
    fontWeight: 600, color: colors.text,
    letterSpacing: '0.18em', flex: 1,
  },
  copyBtn: {
    fontSize: 12, fontFamily: fonts.mono, fontWeight: 600,
    padding: '6px 14px', borderRadius: radii.md,
    border: '1px solid', cursor: 'pointer',
    transition: 'all 180ms ease', whiteSpace: 'nowrap',
  },
  codeHint: {
    fontSize: 11, color: colors.textMuted,
    fontFamily: fonts.body, marginTop: 4,
  },
  twoCol: {
    display: 'flex',
    gap: 20,
  },
  leftCol: {
    flex: 1.2,
  },
  rightCol: {
    flex: 1,
    borderLeft: `1px solid ${colors.border}`,
    paddingLeft: 20,
  },
  settingsTitle: {
    fontSize: 13, fontFamily: fonts.body, fontWeight: 700,
    color: colors.text, marginBottom: 14,
  },
  settingLabel: {
    fontSize: 10, fontFamily: fonts.mono,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    color: colors.textMuted, marginBottom: 6,
  },
  passwordInput: {
    flex: 1,
    minWidth: 0,
    boxSizing: 'border-box',
    fontSize: 12,
    fontFamily: fonts.mono,
    padding: '6px 10px',
    borderRadius: radii.sm,
    border: `1px solid ${colors.border}`,
    background: colors.panel,
    color: colors.text,
    outline: 'none',
  },
  passwordButton: {
    fontSize: 12,
    fontFamily: fonts.mono,
    fontWeight: 700,
    padding: '6px 12px',
    borderRadius: radii.sm,
    border: `1px solid ${colors.accent}`,
    background: colors.accent,
    color: '#fff',
    whiteSpace: 'nowrap',
  },
  passwordHint: {
    marginTop: 5,
    fontSize: 10,
    lineHeight: 1.4,
    color: colors.textMuted,
  },
  passwordStatus: {
    padding: '7px 10px',
    borderRadius: radii.sm,
    background: colors.panelAlt,
    border: `1px solid ${colors.border}`,
    fontSize: 12,
    color: colors.textDim,
  },
  slotsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },
  slotEmpty: {
    height: 52, borderRadius: radii.md,
    border: `1.5px dashed ${colors.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: colors.panelAlt,
  },
  slotEmptyText: {
    fontSize: 12, fontFamily: fonts.body, color: colors.textMuted,
  },
  slotFilled: {
    height: 52, borderRadius: radii.md,
    border: '1.5px solid',
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    transition: 'border-color 200ms ease, background 200ms ease',
    gap: 6,
  },
  actions: {
    display: 'flex', gap: 10, marginTop: 4,
  },
  btn: {
    fontSize: 15, fontFamily: fonts.body,
    fontWeight: 700, padding: '13px 16px',
    borderRadius: radii.md,
    transition: 'background 180ms ease, color 180ms ease',
    lineHeight: 1,
  },
  playerCount: {
    fontSize: 12, fontFamily: fonts.mono,
    color: colors.textMuted, textAlign: 'center',
    letterSpacing: '0.04em',
  },
  spectatorSection: {
    background: colors.panelAlt,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  spectatorHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  spectatorLabel: {
    fontSize: 11,
    fontFamily: fonts.mono,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
    flex: 1,
  },
  spectatorCount: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: colors.textMuted,
  },
  spectatorBody: {
    minHeight: 24,
    display: 'flex',
    alignItems: 'center',
  },
  spectatorChip: {
    fontSize: 12,
    fontFamily: fonts.body,
    fontWeight: 600,
    color: colors.textDim,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.full,
    padding: '3px 10px',
  },
  spectatorEmpty: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.textMuted,
  },
};

// Suppress unused import warning
void space;
