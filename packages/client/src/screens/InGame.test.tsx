/**
 * Component smoke tests (jsdom): InGameView renders the current station + both
 * clocks + turn cards from an explicit snapshot; InputBox is disabled off-turn.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

import type { PlayerSnapshot } from '@subway/shared';

import { InGameView } from './InGame.js';
import { InputBox } from '../components/InputBox.js';
import type { RouteStop } from '../state/gameStore.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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
        roundTimeBonus={{ id: 1, deltaMs: 1000 }}
        rejection={undefined}
        activeLines={[]}
        onSubmit={() => {}}
        onScorePopDone={() => {}}
      />,
    );

    // Current (latest) station is the last route entry.
    expect(screen.getByTestId('route-current').textContent).toContain('역삼');
    // Both clock bars present.
    expect(screen.getByTestId('round-clock')).toBeTruthy();
    expect(screen.getByTestId('turn-clock')).toBeTruthy();
    expect(screen.getByTestId('round-time-bonus').textContent).toBe('+1s');
    // Turn cards for both players; the active one shows 입력 중.
    expect(screen.getByTestId('turn-order')).toBeTruthy();
    expect(screen.getByTestId('turn-card-active').textContent).toContain('입력 중');
    expect(screen.queryByText('Yeoksam')).toBeNull();
    expect(screen.getByTestId('my-turn-banner').textContent).toContain('지금 내 차례입니다');
    expect(screen.getByTestId('in-game').dataset['turnState']).toBe('mine');
    expect(screen.getByTestId('in-game').className).toContain('sg-my-turn-frame');
  });

  it('shows a timeout answer in red on the main station plate', () => {
    const now = Date.now();
    render(
      <InGameView
        players={players()}
        route={route}
        roundNumber={1}
        totalRounds={3}
        roundDeadline={now + 60_000}
        turnDeadline={now}
        currentPlayerIdx={0}
        mySeatIdx={0}
        scorePop={undefined}
        rejection={undefined}
        answerFlash="사당"
        activeLines={['seoul_2']}
        onSubmit={() => {}}
        onScorePopDone={() => {}}
      />,
    );

    expect(screen.getByTestId('current-station-plate').textContent).toContain('사당');
    expect(screen.getByTestId('current-station-plate-name').dataset['tone']).toBe('highlight');
    expect(screen.getByTestId('rejection-flash').textContent).toBe('');
  });

  it('shows a rejected entry in red with a strike for 0.3 seconds', () => {
    vi.useFakeTimers();
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
        mySeatIdx={1}
        scorePop={undefined}
        rejection={{ id: 1, reason: 'notFound', text: '없는역', byPlayerIdx: 0 }}
        activeLines={[]}
        onSubmit={() => {}}
        onScorePopDone={() => {}}
      />,
    );

    const name = screen.getByTestId('current-station-plate-name');
    expect(name.textContent).toBe('없는역');
    expect(name.dataset['tone']).toBe('highlight');
    expect(name.dataset['decoration']).toBe('line-through');
    // Other players see the plate effect, but not the submitter-only reason below the input.
    expect(screen.getByTestId('rejection-flash').textContent).toBe('');

    act(() => vi.advanceTimersByTime(300));

    expect(name.textContent).toBe(route[route.length - 1]!.name);
    expect(name.dataset['tone']).toBe('default');
    expect(name.dataset['decoration']).toBe('none');
  });

  it('input is always enabled; placeholder reflects turn state', () => {
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
      activeLines: [] as string[],
      onSubmit: () => {},
      onScorePopDone: () => {},
    };

    // My turn: input enabled, placeholder is station entry.
    const { unmount } = render(
      <InGameView {...base} currentPlayerIdx={0} mySeatIdx={0} />,
    );
    const inputOn = screen.getByTestId('station-input') as HTMLInputElement;
    expect(inputOn.disabled).toBe(false);
    expect(inputOn.placeholder).toContain('역');
    unmount();

    // Off turn: input still enabled (for chat), placeholder changes.
    render(<InGameView {...base} currentPlayerIdx={1} mySeatIdx={0} />);
    const inputOff = screen.getByTestId('station-input') as HTMLInputElement;
    expect(inputOff.disabled).toBe(false);
    expect(screen.queryByTestId('my-turn-banner')).toBeNull();
    expect(screen.getByTestId('in-game').dataset['turnState']).toBe('other');
    expect(screen.getByTestId('in-game').className).not.toContain('sg-my-turn-frame');
    expect(inputOff.placeholder).toContain('채팅');
  });
});

describe('InputBox smoke', () => {
  it('is always enabled (chat + turn unified input)', () => {
    render(<InputBox myTurn={false} rejection={undefined} onSubmit={() => {}} />);
    expect((screen.getByTestId('station-input') as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByTestId('submit-btn') as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not show romanization while typing', () => {
    render(<InputBox myTurn rejection={undefined} onSubmit={() => {}} />);
    fireEvent.change(screen.getByTestId('station-input'), { target: { value: '강남' } });
    expect(screen.queryByText('Gangnam')).toBeNull();
  });
});
