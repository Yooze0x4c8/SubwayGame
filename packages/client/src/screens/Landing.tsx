/**
 * Landing (기획서 1F): guest entry — nickname → 방 찾기/만들기 or 초대 코드.
 * No signup; the server issues a session token on connect.
 *
 * Composed as a station entrance: two signs mounted on concrete rather than one
 * centered card. The upper sign is the identity plate — line rail, wordmark set
 * in heavy display type, and the tagline in the romanization slot beneath it.
 * The lower sign is the turnstile: nickname, then the way in.
 *
 * Preserves: data-testid="nickname-input", "create-room", "join-code", "join-room".
 */

import { useEffect, useState } from 'react';

import { defaultBalance } from '@subway/shared';
import { useGameClient, useGameStore } from '../state/StoreProvider.js';
import { colors, fonts, radii, space, tracking } from '../ui/theme.js';
import { LineRail, SignPanel } from '../ui/signage.js';

/**
 * The lines on the entrance rail: 1·2·3·4호선 and 신분당선. These are the lines
 * the game's default 수도권 region is built around, so the rail is a statement
 * about what you're about to play, not a decorative gradient.
 */
const ENTRANCE_LINES = ['seoul_1', 'seoul_2', 'seoul_3', 'seoul_4', 'sinbundang'];

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
      <div style={styles.stack}>
        {/* ── Entrance plate ───────────────────────────────────────────────── */}
        <SignPanel rail={ENTRANCE_LINES} frameStyle={{ animation: 'sgArrive 420ms cubic-bezier(0.22,1,0.36,1) both' }}>
          <div style={styles.hero}>
            <h1 style={styles.wordmark}>
              SUB<em style={styles.wordmarkAccent}>WAY</em>
            </h1>
            <div style={styles.heroRoman}>지하철 이어가기</div>
            <DemoRoute />
            <p style={styles.tagline}>
              앞사람이 멈춘 역에서 노선을 이어 달립니다. 시간이 끊기면 라운드도 끊깁니다.
            </p>
            <dl style={styles.specs}>
              <Spec label="인원" value="2~8인" />
              <Spec label="방식" value="실시간" />
              <Spec label="종료" value="서든데스" last />
            </dl>
            <button type="button" onClick={() => setShowGuide(true)} className="sg-btn" style={styles.guideButton}>
              게임 설명
            </button>
          </div>
        </SignPanel>

        {/* ── Turnstile ────────────────────────────────────────────────────── */}
        <SignPanel style={{ padding: '18px 20px 20px' }}>
          <label htmlFor="nickname" style={styles.fieldLabel}>닉네임</label>
          <input
            id="nickname"
            className="sg-input"
            data-testid="nickname-input"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="12자 이내"
            maxLength={12}
            style={styles.input}
            onKeyDown={(e) => { if (e.key === 'Enter' && canAct) browseRooms(); }}
          />

          <button
            className={`sg-btn ${canAct ? 'sg-btn-ink' : ''}`}
            onClick={browseRooms}
            disabled={!canAct}
            style={{
              ...styles.primaryBtn,
              background: canAct ? colors.btnPrimary : colors.panelAlt,
              color: canAct ? colors.btnPrimaryText : colors.textMuted,
              border: canAct ? 'none' : `1px solid ${colors.border}`,
            }}
          >
            방 찾기 · 방 만들기
          </button>

          <div style={styles.divider}>
            <span style={styles.dividerLine} />
            <span style={styles.dividerText}>또는 초대 코드로</span>
            <span style={styles.dividerLine} />
          </div>

          <div style={{ display: 'flex', gap: space[2] }}>
            <input
              className="sg-input"
              data-testid="join-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCDEF"
              aria-label="초대 코드"
              maxLength={8}
              style={{
                ...styles.input,
                flex: 1,
                minWidth: 0,
                fontFamily: fonts.mono,
                fontWeight: 600,
                letterSpacing: tracking.code,
                textAlign: 'center',
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && canJoin) join(); }}
            />
            <button
              className="sg-btn"
              data-testid="join-room"
              disabled={!canJoin}
              onClick={join}
              style={{
                ...styles.codeBtn,
                background: canJoin ? colors.panel : colors.panelAlt,
                borderColor: canJoin ? colors.text : colors.border,
                color: canJoin ? colors.text : colors.textMuted,
              }}
            >
              입장
            </button>
          </div>

          {lastError && (
            <div role="alert" style={styles.error}>
              <span style={styles.errorRule} aria-hidden="true" />
              {lastError.message}
            </div>
          )}
        </SignPanel>

        {/* ── Service status ───────────────────────────────────────────────── */}
        <div style={styles.status}>
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: connected ? colors.accent : colors.textMuted,
              flexShrink: 0,
            }}
          />
          {connected ? '정상 운행' : '연결 중'}
        </div>
      </div>

      {showGuide && <GameGuideModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}

/**
 * A three-stop run ending in the unknown next station — the whole game in one
 * mark. Uses the same diagram vocabulary as the in-game route ribbon: line-2
 * green segments, a donut for the interchange, a dashed slot for what's next.
 */
function DemoRoute(): JSX.Element {
  const stops = [
    { name: '교대', transfer: true },
    { name: '강남', transfer: true },
    { name: '역삼', transfer: false },
  ];

  return (
    <div style={styles.demo} aria-hidden="true">
      {stops.map((stop, i) => (
        <div key={stop.name} style={styles.demoCell}>
          {/* Node sits on the baseline; the segment reaches to the next node. */}
          <div style={styles.demoTrack}>
            <span
              style={stop.transfer ? styles.demoNodeTransfer : styles.demoNodeDot}
            />
            <span
              style={
                i === stops.length - 1 ? styles.demoSegmentAhead : styles.demoSegment
              }
            />
          </div>
          <span style={styles.demoName}>{stop.name}</span>
        </div>
      ))}

      {/* What nobody knows yet — the game itself. */}
      <div style={styles.demoCell}>
        <div style={styles.demoTrack}>
          <span style={styles.demoGhost}>?</span>
        </div>
        <span style={{ ...styles.demoName, color: colors.textMuted }}>다음 역</span>
      </div>
    </div>
  );
}

function Spec({ label, value, last = false }: {
  label: string;
  value: string;
  /** The last cell drops its divider so the row doesn't end on a hanging rule. */
  last?: boolean;
}): JSX.Element {
  return (
    <div style={{ ...SPEC_CELL, borderRight: last ? 'none' : SPEC_DIVIDER }}>
      <dt style={styles.specLabel}>{label}</dt>
      <dd style={styles.specValue}>{value}</dd>
    </div>
  );
}

// ── Guide ─────────────────────────────────────────────────────────────────────

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
      <div role="dialog" aria-modal="true" aria-label="게임 설명" style={styles.modal}>
        <LineRail lineIds={['seoul_2']} height={4} />
        <div style={styles.modalBody}>
          <div style={styles.modalHeader}>
            <h2 style={styles.modalTitle}>게임 설명</h2>
            <button
              type="button"
              aria-label="게임 설명 닫기"
              onClick={onClose}
              className="sg-btn"
              style={styles.closeButton}
            >
              ×
            </button>
          </div>

          <section style={styles.guideSection}>
            <h3 style={styles.guideTitle}>게임 진행</h3>
            <ol style={styles.ruleList}>
              <li>2~8명이 차례대로 현재 노선과 이어지는 지하철역을 입력합니다.</li>
              <li>한 라운드에서 이미 나온 역은 다시 사용할 수 없습니다.</li>
              <li>현재 역이 환승역이면 연결된 다른 노선으로 갈아탈 수 있습니다.</li>
              <li>오답은 다시 입력할 수 있지만, 턴 시간이 끝나면 즉시 라운드가 종료됩니다.</li>
              <li>모든 라운드가 끝난 뒤 누적 점수가 가장 높은 사람이 승리합니다.</li>
            </ol>
          </section>

          <section style={styles.guideSection}>
            <h3 style={styles.guideTitle}>정답 점수</h3>
            <div style={styles.ruleTable}>
              <ScoreRule label="기본 점수" value={`+${scoring.base}`} />
              <ScoreRule
                label="긴 역명"
                value={`+${scoring.nameBonusPerSyllableOver3}`}
                note="4글자부터 글자당"
              />
              <ScoreRule label="환승 성공" value={`+${scoring.transferBonus}`} />
              <ScoreRule label="새 노선 개척" value={`+${scoring.newLineBonus}`} />
              <ScoreRule label="빠른 답변" value={`+${scoring.speedBonusMax}`} note="최대" />
            </div>
            <div style={styles.formula}>
              <span style={styles.formulaRule} aria-hidden="true" />
              기본 + 역명 + 환승 + 새 노선 + 속도
            </div>
          </section>

          <section style={{ ...styles.guideSection, marginBottom: 0 }}>
            <h3 style={styles.guideTitle}>시간 초과 정산</h3>
            {/* Values carry the 점 suffix here: newLineBonus above is also 20, and
                the guide test looks up "+20" by exact text. */}
            <div style={styles.ruleTable}>
              <ScoreRule label="시간 초과 플레이어" value="−10~50점" tone={colors.danger} />
              <ScoreRule label="직전 정답자" value={`+${fail.finisherBonus}점`} tone={colors.accent} />
              <ScoreRule label="그 외 생존자" value={`+${fail.othersBonus}점`} tone={colors.accent} />
            </div>
            <p style={styles.guideNote}>
              감점은 남은 라운드 시간에 비례해 커집니다. 오답·중복·노선 불일치는 즉시 감점되지 않습니다.
            </p>
          </section>

          <button
            type="button"
            onClick={onClose}
            className="sg-btn sg-btn-ink"
            style={styles.modalConfirmButton}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

function ScoreRule({
  label,
  value,
  note,
  tone = colors.text,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: string;
}): JSX.Element {
  return (
    <div style={styles.ruleRow}>
      <span style={styles.ruleLabel}>
        {label}
        {note && <span style={styles.ruleNote}>{note}</span>}
      </span>
      <strong style={{ ...styles.ruleValue, color: tone }}>{value}</strong>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

/** Divider between the three spec cells under the wordmark. */
const SPEC_DIVIDER = `1px solid ${colors.borderLight}`;

const SPEC_CELL: React.CSSProperties = {
  flex: 1,
  padding: '10px 4px 0',
  borderRight: SPEC_DIVIDER,
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 16px',
    background: colors.bg,
  },
  stack: {
    width: '100%',
    maxWidth: 420,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },

  // Entrance plate
  hero: {
    padding: '26px 22px 22px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  wordmark: {
    marginTop: 12,
    fontFamily: fonts.display,
    fontSize: 'clamp(44px, 12vw, 68px)',
    fontWeight: 400,
    letterSpacing: tracking.tight,
    lineHeight: 0.94,
    color: colors.text,
  },
  wordmarkAccent: {
    fontStyle: 'normal',
    color: colors.accent,
  },
  // Korean subtitle in the romanization slot — body face, since mono has no Hangul.
  heroRoman: {
    marginTop: 8,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.16em',
    color: colors.textMuted,
  },
  // Demo route strip
  demo: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    margin: '20px 0 16px',
  },
  demoCell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    width: 58,
  },
  demoTrack: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: 16,
  },
  demoNodeDot: {
    width: 9,
    height: 9,
    borderRadius: '50%',
    background: colors.accent,
    flexShrink: 0,
  },
  demoNodeTransfer: {
    width: 13,
    height: 13,
    borderRadius: '50%',
    boxSizing: 'border-box',
    border: `3px solid ${colors.textDim}`,
    background: colors.panel,
    flexShrink: 0,
  },
  demoSegment: {
    flex: 1,
    height: 3,
    background: colors.accent,
  },
  demoSegmentAhead: {
    flex: 1,
    height: 3,
    backgroundImage: `repeating-linear-gradient(90deg, ${colors.textMuted} 0 4px, transparent 4px 8px)`,
  },
  demoName: {
    marginTop: 5,
    marginLeft: -4,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: 600,
    color: colors.textDim,
    whiteSpace: 'nowrap',
  },
  demoGhost: {
    width: 15,
    height: 15,
    borderRadius: '50%',
    boxSizing: 'border-box',
    border: `1px dashed ${colors.textMuted}`,
    background: colors.panel,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: 700,
    color: colors.textMuted,
    flexShrink: 0,
  },
  tagline: {
    margin: 0,
    maxWidth: '30ch',
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 1.65,
    color: colors.textDim,
  },
  specs: {
    display: 'flex',
    margin: '18px 0 0',
    padding: 0,
    borderTop: `1px solid ${colors.borderLight}`,
    width: '100%',
  },
  specLabel: {
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: 500,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
  },
  specValue: {
    margin: '3px 0 0',
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: 600,
    color: colors.text,
  },
  guideButton: {
    marginTop: 18,
    padding: '7px 14px',
    borderRadius: radii.md,
    border: `1px solid ${colors.border}`,
    background: colors.panelAlt,
    color: colors.textDim,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: tracking.ko,
  },

  // Turnstile
  fieldLabel: {
    display: 'block',
    marginBottom: 6,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    fontSize: 15,
    fontFamily: fonts.body,
    padding: '11px 14px',
    borderRadius: radii.md,
    border: `1px solid ${colors.border}`,
    background: colors.panel,
    color: colors.text,
  },
  primaryBtn: {
    width: '100%',
    marginTop: 14,
    fontSize: 14,
    fontFamily: fonts.body,
    fontWeight: 700,
    padding: '13px 16px',
    borderRadius: radii.md,
    lineHeight: 1,
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    margin: '16px 0 12px',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: colors.borderLight,
  },
  dividerText: {
    fontFamily: fonts.body,
    fontSize: 10,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
    whiteSpace: 'nowrap',
  },
  codeBtn: {
    width: 76,
    flexShrink: 0,
    fontSize: 13,
    fontFamily: fonts.body,
    fontWeight: 700,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'solid',
  },
  error: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: 600,
    color: colors.danger,
  },
  errorRule: {
    width: 3,
    alignSelf: 'stretch',
    minHeight: 14,
    background: colors.danger,
    flexShrink: 0,
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    fontFamily: fonts.body,
    fontSize: 10,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
  },

  // Guide modal
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
  modal: {
    width: '100%',
    maxWidth: 480,
    maxHeight: 'calc(100vh - 32px)',
    overflowY: 'auto',
    boxSizing: 'border-box',
    borderRadius: radii.lg,
    border: `1px solid ${colors.border}`,
    background: colors.panel,
    boxShadow: '0 24px 64px rgba(20,24,27,0.26)',
    animation: 'sgPanelUp 260ms cubic-bezier(0.22,1,0.36,1) both',
  },
  modalBody: {
    padding: '20px 22px 20px',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingBottom: 14,
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  modalTitle: {
    margin: 0,
    fontFamily: fonts.display,
    fontSize: 26,
    fontWeight: 400,
    letterSpacing: tracking.tight,
    color: colors.text,
  },
  closeButton: {
    width: 30,
    height: 30,
    flexShrink: 0,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    background: colors.panelAlt,
    color: colors.textDim,
    fontSize: 20,
    lineHeight: 1,
  },
  guideSection: {
    marginTop: 18,
    marginBottom: 18,
  },
  guideTitle: {
    margin: '0 0 10px',
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: 700,
    color: colors.text,
  },
  ruleList: {
    margin: 0,
    paddingLeft: 18,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 1.8,
    color: colors.textDim,
  },
  ruleTable: {
    borderTop: `1px solid ${colors.borderLight}`,
  },
  ruleRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 14,
    padding: '8px 0',
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  ruleLabel: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textDim,
  },
  ruleNote: {
    fontFamily: fonts.body,
    fontSize: 9,
    letterSpacing: tracking.ko,
    color: colors.textMuted,
  },
  ruleValue: {
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  formula: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    marginTop: 12,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: tracking.ko,
    color: colors.textDim,
  },
  formulaRule: {
    width: 3,
    alignSelf: 'stretch',
    minHeight: 14,
    background: colors.accent,
    flexShrink: 0,
  },
  guideNote: {
    margin: '10px 0 0',
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 1.6,
    color: colors.textMuted,
  },
  modalConfirmButton: {
    width: '100%',
    marginTop: 20,
    padding: '12px 16px',
    border: 'none',
    borderRadius: radii.md,
    background: colors.btnPrimary,
    color: colors.btnPrimaryText,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: 700,
  },
};
