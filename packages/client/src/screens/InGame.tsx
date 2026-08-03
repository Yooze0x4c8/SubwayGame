/**
 * InGame (기획서 2a): the core in-game screen.
 *
 * Split into a pure `InGameView` (renders from an explicit snapshot — used by
 * the component smoke tests) and a connected `InGame` that wires the store +
 * client.
 *
 * The screen is built as one mounted sign for the line you're riding: a line-
 * colored rail across the very top, then the 역명판 for the station you're
 * standing at, then the route diagram, the two platform-edge clocks, and the
 * entry field. Reading order matches urgency — where am I, where have I been,
 * how long do I have, type.
 *
 * Preserves:
 *   - export InGameView with exact InGameViewProps shape
 *   - data-testid="in-game"
 *   - All sub-component testids (route-ribbon, route-current, route-past,
 *     route-ghost, dual-clock, round-clock, turn-clock, turn-order,
 *     turn-card-active, turn-card, input-box, station-input, submit-btn,
 *     rejection-flash, score-pop)
 */

import { useEffect, useRef, useState } from 'react';

import type { ChatMessagePayload, PlayerSnapshot } from '@subway/shared';

import { DualClock } from '../components/DualClock.js';
import { InputBox } from '../components/InputBox.js';
import { RouteRibbon } from '../components/RouteRibbon.js';
import { ScorePop } from '../components/ScorePop.js';
import { TurnOrderCards } from '../components/TurnOrderCards.js';
import { useGameClient, useGameStore } from '../state/StoreProvider.js';
import type {
  Rejection,
  RouteStop,
  ScorePop as ScorePopModel,
  RoundTimeBonus,
} from '../state/gameStore.js';
import { useIsMobile } from '../ui/responsive.js';
import { colors, fonts, radii, tracking } from '../ui/theme.js';
import { LineRail, StationPlate, Wordmark } from '../ui/signage.js';

/** Everything the in-game view needs, with no store/client coupling. */
export interface InGameViewProps {
  players: PlayerSnapshot[];
  route: RouteStop[];
  roundNumber: number | undefined;
  totalRounds: number | undefined;
  roundDeadline: number;
  turnDeadline: number;
  currentPlayerIdx: number | undefined;
  turnOrder?: readonly number[];
  mySeatIdx: number | undefined;
  scorePop: ScorePopModel | undefined;
  roundTimeBonus?: RoundTimeBonus;
  rejection: Rejection | undefined;
  answerFlash?: string;
  activeLines: string[];
  onSubmit: (text: string) => void;
  onScorePopDone: () => void;
  chatMessages?: ChatMessagePayload[];
  myNickname?: string;
}

function ChatMessages({
  messages,
  myNickname,
  maxHeight = 110,
}: {
  messages: ChatMessagePayload[];
  myNickname?: string;
  maxHeight?: number;
}): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  if (messages.length === 0) return <></>;

  return (
    <div
      ref={listRef}
      style={{
        maxHeight,
        overflowY: 'auto',
        background: colors.panelAlt,
        border: `1px solid ${colors.borderLight}`,
        borderRadius: radii.md,
        padding: '7px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}
    >
      {messages.map((msg, i) => {
        const isMe = myNickname !== undefined && msg.nickname === myNickname;
        return (
          <div
            key={i}
            style={{ fontSize: 12, fontFamily: fonts.body, lineHeight: 1.5, wordBreak: 'break-word' }}
          >
            <span style={{ fontWeight: 700, color: isMe ? colors.accent : colors.textDim }}>
              {msg.nickname}
            </span>
            <span style={{ color: colors.textMuted }}>: </span>
            <span style={{ color: colors.text }}>{msg.text}</span>
          </div>
        );
      })}
    </div>
  );
}

export function InGameView(props: InGameViewProps): JSX.Element {
  const [rejectedName, setRejectedName] = useState<string>();
  const isMobile = useIsMobile();
  // Phone only: while the dock's field holds focus the soft keyboard (and the
  // browser's own autofill accessory bar) eats most of the screen, and the chat
  // log — which lives at the bottom of the scroll body — is the first thing
  // pushed out of sight. Track focus so the log can ride in the dock instead,
  // directly above the field. Blur is debounced because tapping 전송 blurs the
  // input for a frame before the button takes focus; collapsing on that frame
  // would make the dock jump under the user's thumb.
  const [dockFocused, setDockFocused] = useState(false);
  const blurTimerRef = useRef<number>();

  useEffect(() => () => window.clearTimeout(blurTimerRef.current), []);

  useEffect(() => {
    if (!props.rejection?.text) return;
    setRejectedName(props.rejection.text);
    const id = setTimeout(() => setRejectedName(undefined), 300);
    return () => clearTimeout(id);
  }, [props.rejection]);

  const myTurn =
    props.mySeatIdx !== undefined && props.mySeatIdx === props.currentPlayerIdx;

  const currentPlayer = props.players.find(
    (p) => p.seatIdx === props.currentPlayerIdx,
  );

  const current = props.route[props.route.length - 1];
  const previous = props.route[props.route.length - 2];
  const currentLines = current?.lineNames ?? [];
  const isTransfer = currentLines.length > 1;
  const showingRejectedName = !props.answerFlash && rejectedName !== undefined;
  const displayedName = props.answerFlash ?? rejectedName ?? current?.name;

  // ── Shared pieces ──────────────────────────────────────────────────────────
  // The phone *drops* PC-only chrome (the wordmark, the banner's second line)
  // rather than reflowing it: every row above the soft keyboard is expensive.

  const scorePopEl = <ScorePop pop={props.scorePop} onDone={props.onScorePopDone} />;

  /* Header — wordmark and the run's position */
  const headerEl = (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        paddingBottom: isMobile ? 8 : 10,
        borderBottom: `1px solid ${colors.borderLight}`,
      }}
    >
      {!isMobile && <Wordmark size={16} />}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          flex: isMobile ? 1 : undefined,
          justifyContent: isMobile ? 'space-between' : undefined,
          fontFamily: fonts.body,
          fontSize: 11,
          letterSpacing: tracking.ko,
          color: colors.textMuted,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {/* Round code is Latin + digits, so it keeps the tracked mono face. */}
        <span
          style={{
            fontFamily: fonts.mono,
            fontWeight: 600,
            letterSpacing: tracking.caption,
          }}
        >
          R{props.roundNumber ?? '-'}
          {props.totalRounds ? `/${props.totalRounds}` : ''}
        </span>
        {currentPlayer && (
          <>
            {!isMobile && (
              <span aria-hidden="true" style={{ color: colors.border }}>|</span>
            )}
            <span style={{ color: myTurn ? colors.accent : colors.textDim, fontWeight: 600 }}>
              {myTurn ? '내 차례' : `${currentPlayer.nickname} 차례`}
            </span>
          </>
        )}
      </div>
    </div>
  );

  const bannerEl = myTurn ? (
    <div
      data-testid="my-turn-banner"
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: 10,
        padding: isMobile ? '8px 12px' : '10px 14px',
        border: `1px solid ${colors.accent}`,
        borderRadius: radii.md,
        background: colors.accentDim,
        color: colors.accentHover,
        fontFamily: fonts.body,
        animation: 'sgMyTurnBanner 280ms cubic-bezier(0.22,1,0.36,1) both',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 9,
          height: 9,
          flex: '0 0 auto',
          borderRadius: '50%',
          background: colors.accent,
          boxShadow: `0 0 0 4px ${colors.panel}`,
        }}
      />
      <strong style={{ fontSize: 14, letterSpacing: tracking.ko }}>
        지금 내 차례입니다
      </strong>
      {/* The input's placeholder already says this; the phone skips the echo. */}
      {!isMobile && (
        <span style={{ fontSize: 12, color: colors.textDim, textAlign: 'center' }}>
          연결되는 역 이름을 입력하세요
        </span>
      )}
    </div>
  ) : null;

  /* 역명판 — where you are standing right now. */
  const plateEl = current ? (
    <StationPlate
      name={displayedName ?? current.name}
      prevName={previous?.name}
      lineIds={currentLines}
      activeLineIds={props.activeLines}
      isTransfer={isTransfer}
      nameColor={props.answerFlash || showingRejectedName ? colors.danger : undefined}
      strikeThrough={showingRejectedName}
      data-testid="current-station-plate"
    />
  ) : (
    <div
      style={{
        padding: isMobile ? '20px 0' : '28px 0',
        textAlign: 'center',
        fontFamily: fonts.body,
        fontSize: 11,
        letterSpacing: tracking.ko,
        color: colors.textMuted,
        border: `1px dashed ${colors.border}`,
        borderRadius: radii.lg,
      }}
    >
      시작역을 기다리는 중
    </div>
  );

  const railEl = <LineRail lineIds={props.activeLines} height={5} />;
  const routeEl = <RouteRibbon route={props.route} activeLines={props.activeLines} />;
  const clockEl = (
    <DualClock
      roundDeadline={props.roundDeadline}
      turnDeadline={props.turnDeadline}
      roundTimeBonus={props.roundTimeBonus}
    />
  );
  const inputEl = (
    <InputBox
      myTurn={myTurn}
      rejection={
        props.rejection?.byPlayerIdx === undefined ||
        props.rejection.byPlayerIdx === props.mySeatIdx
          ? props.rejection
          : undefined
      }
      onSubmit={props.onSubmit}
    />
  );
  const turnOrderEl = (
    <TurnOrderCards
      players={props.players}
      turnOrder={props.turnOrder}
      currentPlayerIdx={props.currentPlayerIdx}
      mySeatIdx={props.mySeatIdx}
    />
  );
  const chatEl = (
    <ChatMessages
      messages={props.chatMessages ?? []}
      myNickname={props.myNickname}
      maxHeight={isMobile ? 84 : 110}
    />
  );
  // The docked copy is shorter: with the keyboard up, two or three lines of
  // recent chat is all the room there is, and the field must stay reachable.
  const chatDockEl = (
    <div style={{ paddingBottom: 6 }}>
      <ChatMessages
        messages={props.chatMessages ?? []}
        myNickname={props.myNickname}
        maxHeight={68}
      />
    </div>
  );

  const frameClass = myTurn ? 'sg-my-turn-frame' : undefined;

  // ── Phone: fixed shell + scroll body + dock ────────────────────────────────
  // The dock is sized against the *visual* viewport, so the clock and the entry
  // field stay above the soft keyboard while everything else scrolls behind it.
  // `position: fixed` also establishes the containing block <ScorePop> needs.
  if (isMobile) {
    return (
      <div
        className={frameClass}
        data-testid="in-game"
        data-turn-state={myTurn ? 'mine' : 'other'}
        style={{
          position: 'fixed',
          top: 'var(--app-viewport-top)',
          left: 0,
          right: 0,
          height: 'var(--app-height)',
          maxWidth: 720,
          margin: '0 auto',
          background: colors.panel,
          borderLeft: `1px solid ${colors.border}`,
          borderRight: `1px solid ${colors.border}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {railEl}
        {scorePopEl}

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            padding: '10px 14px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {headerEl}
          {bannerEl}
          {plateEl}
          {routeEl}
          {turnOrderEl}
          {!dockFocused && chatEl}
        </div>

        <div
          onFocusCapture={() => {
            window.clearTimeout(blurTimerRef.current);
            setDockFocused(true);
          }}
          onBlurCapture={() => {
            window.clearTimeout(blurTimerRef.current);
            blurTimerRef.current = window.setTimeout(() => setDockFocused(false), 150);
          }}
          style={{
            flexShrink: 0,
            borderTop: `1px solid ${colors.border}`,
            background: colors.panel,
            padding: '8px 12px calc(8px + var(--safe-bottom))',
          }}
        >
          {clockEl}
          {dockFocused && chatDockEl}
          {inputEl}
        </div>
      </div>
    );
  }

  // ── Desktop: unchanged single column ───────────────────────────────────────
  return (
    <div
      className={frameClass}
      data-testid="in-game"
      data-turn-state={myTurn ? 'mine' : 'other'}
      style={{
        position: 'relative',
        maxWidth: 720,
        margin: '0 auto',
        minHeight: 'var(--app-height)',
        background: colors.panel,
        borderLeft: `1px solid ${colors.border}`,
        borderRight: `1px solid ${colors.border}`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* The line you're riding, declared before anything else. */}
      {railEl}

      <div
        style={{
          padding: '12px 18px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          flex: 1,
        }}
      >
        {/* Score readout (absolute, top-right) */}
        {scorePopEl}
        {headerEl}
        {bannerEl}
        {plateEl}
        {/* Route diagram */}
        {routeEl}
        {/* The two clocks */}
        {clockEl}
        {/* Entry field */}
        {inputEl}
        {/* Turn order */}
        {turnOrderEl}
        {/* Chat history */}
        {chatEl}
      </div>
    </div>
  );
}

/** Store-connected in-game screen. */
export function InGame(): JSX.Element {
  const client = useGameClient();
  const room = useGameStore((s) => s.room);
  const round = useGameStore((s) => s.round);
  const turn = useGameStore((s) => s.turn);
  const game = useGameStore((s) => s.game);
  const route = useGameStore((s) => s.route);
  const mySeatIdx = useGameStore((s) => s.mySeatIdx);
  const scorePop = useGameStore((s) => s.scorePop);
  const roundTimeBonus = useGameStore((s) => s.roundTimeBonus);
  const rejection = useGameStore((s) => s.rejection);
  const answerFlash = useGameStore((s) => s.answerFlash);
  const activeLineNames = useGameStore((s) => s.activeLineNames);
  const clearScorePop = useGameStore((s) => s.clearScorePop);
  const chatMessages = useGameStore((s) => s.chatMessages);
  const myNickname = useGameStore((s) => s.myNickname);

  return (
    <InGameView
      players={room?.players ?? []}
      route={answerFlash?.route ?? route}
      roundNumber={round?.round}
      totalRounds={game?.totalRounds}
      roundDeadline={round?.roundDeadline ?? 0}
      turnDeadline={turn?.turnDeadline ?? 0}
      currentPlayerIdx={turn?.playerIdx}
      turnOrder={round?.turnOrder}
      mySeatIdx={mySeatIdx}
      scorePop={scorePop}
      roundTimeBonus={roundTimeBonus}
      rejection={rejection}
      answerFlash={answerFlash?.text}
      activeLines={
        answerFlash?.activeLineNames ??
        (activeLineNames.length > 0 ? activeLineNames : (round?.startLineNames ?? []))
      }
      onSubmit={(text) => client.sendChat(text)}
      onScorePopDone={clearScorePop}
      chatMessages={chatMessages}
      myNickname={myNickname}
    />
  );
}
