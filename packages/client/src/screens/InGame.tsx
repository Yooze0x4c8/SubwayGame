/**
 * InGame (기획서 2a): the core in-game screen.
 *
 * Split into a pure `InGameView` (renders from an explicit snapshot — used by
 * the component smoke tests) and a connected `InGame` that wires the store +
 * client. Functional layout only; screen 폭 + 연출 are M6.
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
import { colors } from '../ui/theme.js';

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

  return (
    <div
      data-testid="in-game"
      style={{
        position: 'relative',
        maxWidth: 720,
        margin: '0 auto',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <ScorePop pop={props.scorePop} onDone={props.onScorePopDone} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: colors.textDim, fontSize: 13 }}>
          라운드 {props.roundNumber ?? '-'}
          {props.totalRounds ? ` / ${props.totalRounds}` : ''}
        </span>
      </div>

      <div style={{ background: colors.panel, borderRadius: 12, padding: '0 8px' }}>
        <RouteRibbon route={props.route} />
      </div>

      <DualClock roundDeadline={props.roundDeadline} turnDeadline={props.turnDeadline} />

      <TurnOrderCards
        players={props.players}
        currentPlayerIdx={props.currentPlayerIdx}
        mySeatIdx={props.mySeatIdx}
      />

      <InputBox myTurn={myTurn} rejection={props.rejection} onSubmit={props.onSubmit} />
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
