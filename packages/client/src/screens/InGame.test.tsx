/**
 * Component smoke tests (jsdom): InGameView renders the current station + both
 * clocks + turn cards from an explicit snapshot; InputBox is disabled off-turn.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import type { PlayerSnapshot } from '@subway/shared';

import { InGameView } from './InGame.js';
import { InputBox } from '../components/InputBox.js';
import type { RouteStop } from '../state/gameStore.js';

afterEach(() => cleanup());

function players(): PlayerSnapshot[] {
  return [
    {
      id: 'a',
      nickname: 'Host',
      seatIdx: 0,
      score: 30,
      ready: true,
      isHost: true,
      status: 'connected',
    },
    {
      id: 'b',
      nickname: 'Guest',
      seatIdx: 1,
      score: 10,
      ready: true,
      isHost: false,
      status: 'connected',
    },
  ];
}

const route: RouteStop[] = [
  { station: 1, name: '강남' },
  { station: 2, name: '역삼', byPlayerIdx: 0 },
];

describe('InGameView smoke', () => {
  it('renders current station, both clocks, and turn cards', () => {
    const now = Date.now();
    render(
      <InGameView
        players={players()}
        route={route}
        roundNumber={1}
        totalRounds={3}
        roundDeadline={now + 60_000}
        turnDeadline={now + 12_000}
        currentPlayerIdx={0}
        mySeatIdx={0}
        scorePop={undefined}
        rejection={undefined}
        onSubmit={() => {}}
        onScorePopDone={() => {}}
      />,
    );

    // Current (latest) station is the last route entry.
    expect(screen.getByTestId('route-current').textContent).toContain('역삼');
    // Both clock bars present.
    expect(screen.getByTestId('round-clock')).toBeTruthy();
    expect(screen.getByTestId('turn-clock')).toBeTruthy();
    // Turn cards for both players; the active one shows 입력 중.
    expect(screen.getByTestId('turn-order')).toBeTruthy();
    expect(screen.getByTestId('turn-card-active').textContent).toContain('입력 중');
  });

  it('enables the input on your turn and disables it off-turn', () => {
    const now = Date.now();
    const base = {
      players: players(),
      route,
      roundNumber: 1,
      totalRounds: 3,
      roundDeadline: now + 60_000,
      turnDeadline: now + 12_000,
      scorePop: undefined,
      rejection: undefined,
      onSubmit: () => {},
      onScorePopDone: () => {},
    };

    // My turn (mySeat 0 === current 0): input enabled.
    const { unmount } = render(
      <InGameView {...base} currentPlayerIdx={0} mySeatIdx={0} />,
    );
    expect((screen.getByTestId('station-input') as HTMLInputElement).disabled).toBe(false);
    unmount();

    // Off turn (current 1, mySeat 0): input disabled.
    render(<InGameView {...base} currentPlayerIdx={1} mySeatIdx={0} />);
    expect((screen.getByTestId('station-input') as HTMLInputElement).disabled).toBe(true);
  });
});

describe('InputBox smoke', () => {
  it('is disabled when it is not your turn', () => {
    render(<InputBox myTurn={false} rejection={undefined} onSubmit={() => {}} />);
    expect((screen.getByTestId('station-input') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId('submit-btn') as HTMLButtonElement).disabled).toBe(true);
  });
});
