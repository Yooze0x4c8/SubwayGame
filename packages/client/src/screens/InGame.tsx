/**
 * InGame (기획서 2a): the core in-game screen.
 *
 * Split into a pure `InGameView` (renders from an explicit snapshot — used by
 * the component smoke tests) and a connected `InGame` that wires the store +
 * client. Visual polish and 연출 per M6.
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
import { colors, fonts, radii, space } from '../ui/theme.js';

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
        padding: '16px 16px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: '100vh',
      }}
    >
      {/* Score pop (absolute, top-right) */}
      <ScorePop pop={props.scorePop} onDone={props.onScorePopDone} />

      {/* Header row: wordmark + round info */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 8,
        borderBottom: `1px solid ${colors.border}`,
      }}>
        <span style={{
          fontFamily: fonts.display,
          fontSize: 20,
          fontWeight: 400,
          color: colors.accent,
          letterSpacing: '-0.01em',
        }}>
          🚇 SUBWAY
        </span>
        <span style={{
          fontFamily: fonts.mono,
          fontSize: 12,
          color: colors.textDim,
          letterSpacing: '0.04em',
        }}>
          라운드 {props.roundNumber ?? '-'}{props.totalRounds ? ` / ${props.totalRounds}` : ''}
          {currentPlayer && (
            <span style={{ color: colors.textMuted, marginLeft: 8 }}>
              · {currentPlayer.nickname} 차례
            </span>
          )}
        </span>
      </div>

      {/* Route ribbon */}
      <div style={{
        background: colors.panel,
        borderRadius: radii.lg,
        border: `1px solid ${colors.border}`,
        overflow: 'hidden',
      }}>
        <RouteRibbon route={props.route} />
      </div>

      {/* Dual clock */}
      <div style={{
        background: colors.panel,
        borderRadius: radii.md,
        border: `1px solid ${colors.border}`,
        padding: `${space[3]}px ${space[4]}px`,
      }}>
        <DualClock
          roundDeadline={props.roundDeadline}
          turnDeadline={props.turnDeadline}
        />
      </div>

      {/* Turn order cards */}
      <TurnOrderCards
        players={props.players}
        currentPlayerIdx={props.currentPlayerIdx}
        mySeatIdx={props.mySeatIdx}
      />

      {/* Input box — grows to fill remaining space at bottom */}
      <div style={{ marginTop: 'auto', paddingTop: 8 }}>
        <InputBox
          myTurn={myTurn}
          rejection={props.rejection}
          onSubmit={props.onSubmit}
        />
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
      onSubmit={(text) => client.submitTurn(text)}
      onScorePopDone={clearScorePop}
    />
  );
}
