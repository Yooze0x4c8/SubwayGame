/**
 * Landing (기획서 1F): guest entry — nickname → 방 만들기 / 방 찾기(코드) / 방 목록.
 * No signup; the server issues a session token on connect.
 *
 * Design: SUBWAY wordmark (Black Han Sans), **light transit aesthetic** per wireframe.
 * Wireframe: white card on light gray bg, dark buttons, green/pink accent stripes.
 * Preserves: data-testid="nickname-input", "create-room", "join-code", "join-room".
 */

import { useEffect, useState } from 'react';

import { defaultBalance } from '@subway/shared';
import { useGameClient, useGameStore } from '../state/StoreProvider.js';
import { colors, fonts, radii, space } from '../ui/theme.js';

interface LandingProps {
  /** Called when the user taps "방 찾기 목록" → switches to RoomList screen. */
  onBrowseRooms?: () => void;
}

export function Landing({ onBrowseRooms }: LandingProps = {}): JSX.Element {
  const client = useGameClient();
  const setMyNickname = useGameStore((s) => s.setMyNickname);
  const connected = useGameStore((s) => s.connected);
  const lastError = useGameStore((s) => s.lastError);

  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  const canAct = nickname.trim().length > 0;
  const canJoin = canAct && code.trim().length > 0;

  const join = (): void => {
    const nick = nickname.trim();
    const c = code.trim().toUpperCase();
    if (!nick || !c) return;
    setMyNickname(nick);
    client.joinRoom({ code: c, nickname: nick });
  };

  const browseRooms = (): void => {
    const nick = nickname.trim();
    if (nick) setMyNickname(nick);
    client.listRooms('all');
    onBrowseRooms?.();
  };

  return (
    <div style={styles.root}>
      {/* Line stripe — 4색 per 기획서 §7 (line2 green, line3 orange, line4 blue, sinb red) */}
      <div style={styles.stripe}>
        <span style={{ ...styles.stripeSegment, background: '#00A84D' }} />
        <span style={{ ...styles.stripeSegment, background: '#EF7C1C' }} />
        <span style={{ ...styles.stripeSegment, background: '#00A5DE' }} />
        <span style={{ ...styles.stripeSegment, background: '#D4003B' }} />
      </div>

      <div style={styles.card}>
        {/* Wordmark — SUB[ink]WAY[line2 green] per 기획서 §7 */}
        <div style={styles.wordmarkWrap}>
          <h1 style={styles.wordmark}>
            SUB<em style={{ fontStyle: 'normal', color: colors.accent }}>WAY</em>
          </h1>
          <p style={styles.tagline}>지하철 이어가기 · 2~8인 실시간 · 서든데스</p>
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            style={styles.guideButton}
          >
            ? 게임 설명
          </button>
        </div>

        {/* Nickname */}
        <label style={styles.label}>닉네임</label>
        <input
          data-testid="nickname-input"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="닉네임 입력..."
          maxLength={12}
          style={styles.input}
          onKeyDown={(e) => { if (e.key === 'Enter' && canAct) browseRooms(); }}
        />

        {/* 방 찾기 — 방 만들기는 RoomList 화면에서 */}
        <div style={{ marginTop: space[4] }}>
          <button
            onClick={browseRooms}
            disabled={!canAct}
            style={{
              ...styles.btn,
              width: '100%',
              background: canAct ? colors.btnPrimary : colors.panelAlt,
              color: canAct ? colors.btnPrimaryText : colors.textMuted,
              cursor: canAct ? 'pointer' : 'not-allowed',
            }}
          >
            🔍 방 찾기 / 만들기
          </button>
        </div>

        {/* Divider */}
        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>또는</span>
          <span style={styles.dividerLine} />
        </div>

        {/* 코드로 입장 (invite link style per wireframe) */}
        <div style={{ display: 'flex', gap: space[2] }}>
          <input
            data-testid="join-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="🔗 초대 링크 붙여넣기..."
            maxLength={8}
            style={{ ...styles.input, flex: 1, marginTop: 0, fontFamily: fonts.mono, letterSpacing: '0.12em' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && canJoin) join(); }}
          />
          <button
            data-testid="join-room"
            disabled={!canJoin}
            onClick={join}
            style={{
              ...styles.btn,
              width: 80,
              background: canJoin ? colors.panelAlt : colors.panelHover,
              border: `1.5px solid ${canJoin ? colors.borderLight : colors.border}`,
              color: canJoin ? colors.text : colors.textMuted,
              cursor: canJoin ? 'pointer' : 'not-allowed',
            }}
          >
            입장
          </button>
        </div>

        {/* Error */}
        {lastError && (
          <div style={styles.error}>{lastError.message}</div>
        )}

        {/* Connection status */}
        <div style={styles.status}>
          <span style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: connected ? colors.accent : colors.textMuted,
            marginRight: 6,
            verticalAlign: 'middle',
          }} />
          {connected ? '서버 연결됨' : '연결 중…'}
        </div>
      </div>

      {showGuide && <GameGuideModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}

function GameGuideModal({ onClose }: { onClose: () => void }): JSX.Element {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const { scoring, fail } = defaultBalance;

  return (
    <div
      style={styles.modalBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-guide-title"
        style={styles.modal}
      >
        <div style={styles.modalHeader}>
          <div>
            <div style={styles.modalEyebrow}>HOW TO PLAY</div>
            <h2 id="game-guide-title" style={styles.modalTitle}>게임 설명</h2>
          </div>
          <button type="button" aria-label="게임 설명 닫기" onClick={onClose} style={styles.closeButton}>
            ×
          </button>
        </div>

        <div style={styles.guideSection}>
          <h3 style={styles.guideTitle}>게임 진행</h3>
          <ol style={styles.ruleList}>
            <li>2~8명이 차례대로 현재 노선과 이어지는 지하철역을 입력합니다.</li>
            <li>한 라운드에서 이미 나온 역은 다시 사용할 수 없습니다.</li>
            <li>현재 역이 환승역이면 연결된 다른 노선으로 갈아탈 수 있습니다.</li>
            <li>오답은 다시 입력할 수 있지만, 턴 시간이 끝나면 즉시 라운드가 종료됩니다.</li>
            <li>모든 라운드가 끝난 뒤 누적 점수가 가장 높은 사람이 승리합니다.</li>
          </ol>
        </div>

        <div style={styles.guideSection}>
          <h3 style={styles.guideTitle}>정답 점수</h3>
          <div style={styles.scoreGrid}>
            <ScoreRule label="기본 점수" value={`+${scoring.base}`} />
            <ScoreRule
              label="긴 역명"
              value={`4글자부터 글자당 +${scoring.nameBonusPerSyllableOver3}`}
            />
            <ScoreRule label="환승 성공" value={`+${scoring.transferBonus}`} />
            <ScoreRule label="새 노선 개척" value={`+${scoring.newLineBonus}`} />
            <ScoreRule label="빠른 답변" value={`최대 +${scoring.speedBonusMax}`} />
          </div>
          <div style={styles.formulaBox}>
            정답 점수 = 기본 + 역명 + 환승 + 새 노선 + 속도 보너스
          </div>
        </div>

        <div style={{ ...styles.guideSection, marginBottom: 0 }}>
          <h3 style={styles.guideTitle}>시간 초과 정산</h3>
          <div style={styles.settlementRows}>
            <SettlementRule label="시간 초과 플레이어" value="−10~50점" danger />
            <SettlementRule label="직전 정답자" value={`+${fail.finisherBonus}점`} />
            <SettlementRule label="그 외 생존자" value={`+${fail.othersBonus}점`} />
          </div>
          <p style={styles.settlementHint}>
            감점은 남은 라운드 시간에 비례해 커집니다. 오답·중복·노선 불일치는 즉시 감점되지 않습니다.
          </p>
        </div>

        <button type="button" onClick={onClose} style={styles.modalConfirmButton}>
          확인
        </button>
      </div>
    </div>
  );
}

function ScoreRule({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={styles.scoreRule}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SettlementRule({ label, value, danger = false }: {
  label: string;
  value: string;
  danger?: boolean;
}): JSX.Element {
  return (
    <div style={styles.settlementRow}>
      <span>{label}</span>
      <strong style={{ color: danger ? colors.danger : colors.accent }}>{value}</strong>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    background: colors.bg,
  },
  stripe: {
    display: 'flex',
    width: 200,
    height: 5,
    borderRadius: radii.full,
    overflow: 'hidden',
    marginBottom: 28,
    gap: 2,
  },
  stripeSegment: {
    flex: 1,
    borderRadius: radii.full,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.xl,
    padding: '32px 28px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
  },
  wordmarkWrap: {
    textAlign: 'center',
    marginBottom: 28,
  },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: 'clamp(40px, 10vw, 72px)',
    fontWeight: 400,
    letterSpacing: '-0.02em',
    lineHeight: 0.9,
    margin: '0 0 8px',
    color: colors.text,
  },
  tagline: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textDim,
    margin: 0,
    letterSpacing: '0.02em',
  },
  guideButton: {
    marginTop: 12,
    padding: '6px 12px',
    borderRadius: radii.full,
    border: `1px solid ${colors.border}`,
    background: colors.panelAlt,
    color: colors.info,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  label: {
    display: 'block',
    fontSize: 11,
    fontFamily: fonts.mono,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: colors.textDim,
    marginBottom: 6,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    fontSize: 15,
    fontFamily: fonts.body,
    padding: '11px 14px',
    borderRadius: radii.md,
    border: `1.5px solid ${colors.border}`,
    background: colors.panel,
    color: colors.text,
    marginTop: 0,
    outline: 'none',
    transition: 'border-color 160ms',
  },
  btn: {
    width: '100%',
    fontSize: 15,
    fontFamily: fonts.body,
    fontWeight: 700,
    padding: '12px 16px',
    borderRadius: radii.md,
    border: 'none',
    transition: 'background 160ms, opacity 120ms',
    lineHeight: 1,
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    margin: '16px 0',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: colors.border,
    borderTop: `1px dashed ${colors.border}`,
  },
  dividerText: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fonts.mono,
  },
  error: {
    marginTop: 12,
    fontSize: 13,
    color: colors.danger,
    fontFamily: fonts.body,
  },
  status: {
    marginTop: 20,
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    textAlign: 'center' as const,
  },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    background: 'rgba(16, 20, 24, 0.58)',
    backdropFilter: 'blur(3px)',
  },
  modal: {
    width: '100%',
    maxWidth: 560,
    maxHeight: 'calc(100vh - 32px)',
    overflowY: 'auto',
    boxSizing: 'border-box',
    padding: '24px 24px 20px',
    borderRadius: radii.xl,
    border: `1px solid ${colors.border}`,
    background: colors.panel,
    boxShadow: '0 20px 60px rgba(0,0,0,0.24)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingBottom: 16,
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  modalEyebrow: {
    marginBottom: 3,
    color: colors.info,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
  },
  modalTitle: {
    margin: 0,
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: 400,
  },
  closeButton: {
    width: 34,
    height: 34,
    flexShrink: 0,
    border: `1px solid ${colors.border}`,
    borderRadius: '50%',
    background: colors.panelAlt,
    color: colors.textDim,
    fontSize: 24,
    lineHeight: 1,
    cursor: 'pointer',
  },
  guideSection: {
    marginTop: 18,
    marginBottom: 20,
  },
  guideTitle: {
    margin: '0 0 10px',
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: 800,
  },
  ruleList: {
    margin: 0,
    paddingLeft: 22,
    color: colors.textDim,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 1.75,
  },
  scoreGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
    gap: 7,
  },
  scoreRule: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    padding: '10px 11px',
    border: `1px solid ${colors.borderLight}`,
    borderRadius: radii.md,
    background: colors.panelAlt,
    color: colors.textDim,
    fontFamily: fonts.body,
    fontSize: 11,
  },
  formulaBox: {
    marginTop: 8,
    padding: '9px 11px',
    borderRadius: radii.md,
    background: '#EAF6FB',
    color: colors.info,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.5,
  },
  settlementRows: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    color: colors.textDim,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  settlementRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: '7px 9px',
    borderRadius: radii.sm,
    background: colors.panelAlt,
  },
  settlementHint: {
    margin: '9px 0 0',
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 1.55,
  },
  modalConfirmButton: {
    width: '100%',
    marginTop: 20,
    padding: '11px 16px',
    border: 'none',
    borderRadius: radii.md,
    background: colors.btnPrimary,
    color: colors.btnPrimaryText,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
};
