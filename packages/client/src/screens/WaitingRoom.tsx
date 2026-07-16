/**
 * WaitingRoom (기획서 1G): player slots + ready toggle; host start.
 *
 * Visual spec:
 *   - 8 player slots (filled + empty ghost slots in a 2-column grid)
 *   - Invite code prominent with copy button
 *   - Room settings display (read-only; editing = M7)
 *   - Ready states with color accents
 *   - Host sees 시작 button (enabled ≥2 players)
 *
 * Preserves: data-testid="room-code", "player-slots", "ready-toggle", "start-game".
 */

import { useState } from 'react';

import type { PlayerSnapshot } from '@subway/shared';
import { useGameClient, useGameStore } from '../state/StoreProvider.js';
import { colors, fonts, radii, playerColor, space } from '../ui/theme.js';

const MAX_PLAYERS = 8;

export function WaitingRoom(): JSX.Element {
  const client = useGameClient();
  const room = useGameStore((s) => s.room);
  const mySeatIdx = useGameStore((s) => s.mySeatIdx);
  const [copied, setCopied] = useState(false);

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
  const canStart = room.players.length >= 2;

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
                background: copied ? colors.accentDim : colors.panelAlt,
                color: copied ? colors.accent : colors.textDim,
                borderColor: copied ? colors.accent : colors.border,
              }}
            >
              {copied ? '복사됨 ✓' : '복사'}
            </button>
          </div>
          <div style={styles.codeHint}>친구에게 공유하세요</div>
        </div>

        {/* Room settings display (read-only) */}
        <div style={styles.settingsRow}>
          <SettingChip label="라운드" value={`${room.settings.rounds}라운드`} />
          <SettingChip label="라운드 시간" value={`${room.settings.roundTimeSec}초`} />
          <SettingChip
            label="노선"
            value={
              room.settings.tierFilter.includes('intro')
                ? '입문'
                : room.settings.tierFilter.includes('hardcore')
                  ? '하드코어'
                  : '일반'
            }
          />
        </div>

        {/* Player slots */}
        <div data-testid="player-slots" style={styles.slotsGrid}>
          {slots.map((p, idx) => (
            <PlayerSlot
              key={idx}
              player={p}
              seatIdx={idx}
              isMe={idx === mySeatIdx}
            />
          ))}
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button
            data-testid="ready-toggle"
            onClick={() => client.setReady(!(me?.ready ?? false))}
            style={{
              ...styles.btn,
              flex: 1,
              background: me?.ready ? colors.panelAlt : colors.accent,
              color: me?.ready ? colors.textDim : '#04140b',
              border: me?.ready ? `1.5px solid ${colors.border}` : 'none',
              cursor: 'pointer',
            }}
          >
            {me?.ready ? '준비 취소' : '준비 완료'}
          </button>

          {iAmHost && (
            <button
              data-testid="start-game"
              disabled={!canStart}
              onClick={() => client.startGame()}
              style={{
                ...styles.btn,
                flex: 1,
                background: canStart ? colors.accent : colors.panelAlt,
                color: canStart ? '#04140b' : colors.textMuted,
                cursor: canStart ? 'pointer' : 'not-allowed',
                border: 'none',
              }}
            >
              {canStart ? '게임 시작 →' : '2인 이상 필요'}
            </button>
          )}
        </div>

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
        <span style={styles.slotEmptyText}>{seatIdx + 1}</span>
      </div>
    );
  }

  const pColor = playerColor(player.seatIdx);
  return (
    <div style={{
      ...styles.slotFilled,
      borderColor: player.ready ? pColor : colors.border,
      background: player.ready ? `${pColor}12` : colors.panelAlt,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          background: pColor, flexShrink: 0,
        }} />
        <span style={{
          fontSize: 13, fontFamily: fonts.body, fontWeight: 600,
          color: colors.text, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {player.nickname}
        </span>
        {player.isHost && (
          <span style={{ fontSize: 10, color: colors.warn, fontFamily: fonts.mono, flexShrink: 0 }}>
            방장
          </span>
        )}
        {isMe && (
          <span style={{ fontSize: 10, color: colors.textMuted, fontFamily: fonts.mono, flexShrink: 0 }}>
            나
          </span>
        )}
      </div>
      <span style={{
        fontSize: 11, fontFamily: fonts.mono,
        color: player.ready ? pColor : colors.textMuted,
        fontWeight: 600, flexShrink: 0,
      }}>
        {player.ready ? '준비 ✓' : '대기'}
      </span>
    </div>
  );
}

function SettingChip({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={styles.settingChip}>
      <span style={styles.settingLabel}>{label}</span>
      <span style={styles.settingValue}>{value}</span>
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
    maxWidth: 520,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.xl,
    padding: '24px 24px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
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
    color: colors.accent,
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
    fontWeight: 600, color: colors.accent,
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
  settingsRow: {
    display: 'flex', gap: 8, flexWrap: 'wrap',
  },
  settingChip: {
    display: 'flex', flexDirection: 'column', gap: 2,
    padding: '6px 10px',
    background: colors.panelAlt,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
  },
  settingLabel: {
    fontSize: 9, fontFamily: fonts.mono,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    color: colors.textMuted,
  },
  settingValue: {
    fontSize: 13, fontFamily: fonts.body,
    fontWeight: 600, color: colors.text,
  },
  slotsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },
  slotEmpty: {
    height: 44, borderRadius: radii.md,
    border: `1.5px dashed ${colors.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: 0.35,
  },
  slotEmptyText: {
    fontSize: 12, fontFamily: fonts.mono, color: colors.textMuted,
  },
  slotFilled: {
    height: 44, borderRadius: radii.md,
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
};

// Suppress unused import warning
void space;
