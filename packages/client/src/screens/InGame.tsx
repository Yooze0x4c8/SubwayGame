/**
 * InGame (기획서 2a): the core in-game screen.
 *
 * Split into a pure `InGameView` (renders from an explicit snapshot — used by
 * the component smoke tests) and a connected `InGame` that wires the store +
 * client. Visual polish per wireframe: **light theme** with white panels,
 * dark borders, and gold active-player highlight.
 *
 * Preserves:
 *   - export InGameView with exact InGameViewProps shape
 *   - data-testid="in-game"
 *   - All sub-component testids (route-ribbon, route-current, route-past,
 *     route-ghost, dual-clock, round-clock, turn-clock, turn-order,
 *     turn-card-active, turn-card, input-box, station-input, submit-btn,
 *     rejection-flash, score-pop)
 */

import { useEffect, useRef } from 'react';

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
} from '../state/gameStore.js';
import { colors, fonts, radii } from '../ui/theme.js';

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
        maxHeight: 120,
        overflowY: 'auto',
        background: colors.panelAlt,
        border: `1px solid ${colors.borderLight}`,
        borderRadius: radii.md,
        padding: '6px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        marginTop: 4,
      }}
    >
      {messages.map((msg, i) => {
        const isMe = myNickname !== undefined && msg.nickname === myNickname;
        return (
          <div key={i} style={{ fontSize: 12, fontFamily: fonts.body, lineHeight: 1.5, wordBreak: 'break-word' }}>
            <span style={{ fontWeight: 700, color: isMe ? colors.accent : colors.textDim }}>{msg.nickname}</span>
            <span style={{ color: colors.textMuted }}>: </span>
            <span style={{ color: colors.text }}>{msg.text}</span>
          </div>
        );
      })}
    </div>
  );
}

export function InGameView(props: InGameViewProps): JSX.Element {
  const myTurn =
    props.mySeatIdx !== undefined && props.mySeatIdx === props.currentPlayerIdx;

  const currentPlayer = props.players.find(
    (p) => p.seatIdx === props.currentPlayerIdx,
  );

  return (
    <div
      data-testid="in-game"
      style={{
        position: 'relative',
        maxWidth: 720,
        margin: '0 auto',
        padding: '16px 18px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        minHeight: '100vh',
        background: colors.panel, // white, matching wireframe mock
      }}
    >
      {/* Score pop (absolute, top-right) */}
      <ScorePop pop={props.scorePop} onDone={props.onScorePopDone} />

      {/* Header row — 🚇 SUBWAY | 라운드 N / M · 턴 name */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 10,
        marginBottom: 0,
        borderBottom: `1px solid ${colors.borderLight}`,
      }}>
        <span style={{
          fontFamily: fonts.mono,
          fontSize: 12,
          fontWeight: 500,
          color: colors.textMuted,
          letterSpacing: '0.02em',
        }}>
          🚇 SUBWAY
        </span>
        <span style={{
          fontFamily: fonts.mono,
          fontSize: 12,
          color: colors.textMuted,
          letterSpacing: '0.04em',
        }}>
          라운드 {props.roundNumber ?? '-'}{props.totalRounds ? ` / ${props.totalRounds}` : ''}
          {currentPlayer && (
            <span style={{ marginLeft: 6 }}>
              · 턴 {currentPlayer.nickname}
            </span>
          )}
        </span>
      </div>

      {/* Route ribbon — direct on white, no card wrapper */}
      <RouteRibbon route={props.route} activeLines={props.activeLines} />

      {/* Dual clock — padding matches wireframe .timer margin */}
      <div style={{ padding: '4px 0 2px' }}>
        <DualClock
          roundDeadline={props.roundDeadline}
          turnDeadline={props.turnDeadline}
        />
      </div>

      {/* Input box */}
      <div style={{ margin: '10px 0 16px' }}>
        <InputBox
          myTurn={myTurn}
          rejection={props.rejection}
          answerFlash={props.answerFlash}
          onSubmit={props.onSubmit}
        />
      </div>

      {/* Turn order cards */}
      <TurnOrderCards
        players={props.players}
        currentPlayerIdx={props.currentPlayerIdx}
        mySeatIdx={props.mySeatIdx}
      />

      {/* Chat history */}
      <ChatMessages messages={props.chatMessages ?? []} myNickname={props.myNickname} />
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
  const rejection = useGameStore((s) => s.rejection);
  const answerFlash = useGameStore((s) => s.answerFlash);
  const activeLineNames = useGameStore((s) => s.activeLineNames);
  const clearScorePop = useGameStore((s) => s.clearScorePop);
  const chatMessages = useGameStore((s) => s.chatMessages);
  const myNickname = useGameStore((s) => s.myNickname);

  return (
    <InGameView
      players={room?.players ?? []}
      route={route}
      roundNumber={round?.round}
      totalRounds={game?.totalRounds}
      roundDeadline={round?.roundDeadline ?? 0}
      turnDeadline={turn?.turnDeadline ?? 0}
      currentPlayerIdx={turn?.playerIdx}
      mySeatIdx={mySeatIdx}
      scorePop={scorePop}
      rejection={rejection}
      answerFlash={answerFlash}
      activeLines={activeLineNames.length > 0 ? activeLineNames : (round?.startLineNames ?? [])}
      onSubmit={(text) => client.sendChat(text)}
      onScorePopDone={clearScorePop}
      chatMessages={chatMessages}
      myNickname={myNickname}
    />
  );
}
