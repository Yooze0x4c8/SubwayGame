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

import type { PlayerSnapshot } from '@subway/shared';

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
import { colors, fonts } from '../ui/theme.js';

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
  activeLines: string[];
  onSubmit: (text: string) => void;
  onScorePopDone: () => void;
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
          onSubmit={props.onSubmit}
        />
      </div>

      {/* Turn order cards */}
      <TurnOrderCards
        players={props.players}
        currentPlayerIdx={props.currentPlayerIdx}
        mySeatIdx={props.mySeatIdx}
      />
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
  const clearScorePop = useGameStore((s) => s.clearScorePop);

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
      activeLines={round?.startLineNames ?? []}
      onSubmit={(text) => client.submitTurn(text)}
      onScorePopDone={clearScorePop}
    />
  );
}
