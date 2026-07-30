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
}: {
  messages: ChatMessagePayload[];
  myNickname?: string;
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
        maxHeight: 110,
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

  return (
    <div
      className={myTurn ? 'sg-my-turn-frame' : undefined}
      data-testid="in-game"
      data-turn-state={myTurn ? 'mine' : 'other'}
      style={{
        position: 'relative',
        maxWidth: 720,
        margin: '0 auto',
        minHeight: '100vh',
        background: colors.panel,
        borderLeft: `1px solid ${colors.border}`,
        borderRight: `1px solid ${colors.border}`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* The line you're riding, declared before anything else. */}
      <LineRail lineIds={props.activeLines} height={5} />

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
        <ScorePop pop={props.scorePop} onDone={props.onScorePopDone} />

        {/* Header — wordmark and the run's position */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            paddingBottom: 10,
            borderBottom: `1px solid ${colors.borderLight}`,
          }}
        >
          <Wordmark size={16} />
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
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
                <span aria-hidden="true" style={{ color: colors.border }}>|</span>
                <span style={{ color: myTurn ? colors.accent : colors.textDim, fontWeight: 600 }}>
                  {myTurn ? '내 차례' : `${currentPlayer.nickname} 차례`}
                </span>
              </>
            )}
          </div>
        </div>

        {/* 역명판 — where you are standing right now. */}
        {myTurn && (
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
              padding: '10px 14px',
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
            <span style={{ fontSize: 12, color: colors.textDim, textAlign: 'center' }}>
              연결되는 역 이름을 입력하세요
            </span>
          </div>
        )}

        {current ? (
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
              padding: '28px 0',
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
        )}

        {/* Route diagram */}
        <RouteRibbon route={props.route} activeLines={props.activeLines} />

        {/* The two clocks */}
        <DualClock
          roundDeadline={props.roundDeadline}
          turnDeadline={props.turnDeadline}
          roundTimeBonus={props.roundTimeBonus}
        />

        {/* Entry field */}
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

        {/* Turn order */}
        <TurnOrderCards
          players={props.players}
          currentPlayerIdx={props.currentPlayerIdx}
          mySeatIdx={props.mySeatIdx}
        />

        {/* Chat history */}
        <ChatMessages messages={props.chatMessages ?? []} myNickname={props.myNickname} />
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
