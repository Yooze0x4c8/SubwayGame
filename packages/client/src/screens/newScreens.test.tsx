/**
 * Render smoke tests for the M6 store-connected screens that ship without their
 * own coverage: Settlement (1H), Result (1I), RoomList (1J).
 *
 * Primary guard: the zustand-v5 fresh-object/array selector footgun (a selector
 * returning `?? []` inline loops to "Maximum update depth" → blank screen). Each
 * screen is mounted through a real StoreProvider with an EMPTY store so the
 * coalescing paths (undefined room/gameResult/roomList) are exercised directly.
 * If any regresses, the render throws and the test fails.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import type { RoundEndedPayload, GameEndedPayload } from '@subway/shared';

import { StoreProvider } from '../state/StoreProvider.js';
import { createGameStore, type GameStore } from '../state/gameStore.js';
import type { StoreApi } from 'zustand/vanilla';
import type { SocketClient } from '../net/socket.js';
import { Settlement } from './Settlement.js';
import { Result } from './Result.js';
import { RoomList } from './RoomList.js';

afterEach(() => cleanup());

/** A no-op socket client so tests never open a real connection. */
function fakeClient(): SocketClient {
  const noop = (): void => {};
  const socket = { on: noop, off: noop, emit: noop } as unknown as SocketClient['socket'];
  return {
    socket,
    on: () => noop,
    getToken: () => undefined,
    connect: noop,
    createRoom: noop,
    joinRoom: noop,
    listRooms: noop,
    setReady: noop,
    updateSettings: noop,
    startGame: noop,
    submitTurn: noop,
    disconnect: noop,
  };
}

function renderWithStore(ui: React.ReactElement, store: StoreApi<GameStore> = createGameStore()) {
  return render(
    <StoreProvider store={store} client={fakeClient()}>
      {ui}
    </StoreProvider>,
  );
}

describe('M6 store-connected screens (render smoke)', () => {
  it('Settlement renders on an empty store without an infinite loop', () => {
    const result: RoundEndedPayload = { type: 'complete', deltas: [] };
    renderWithStore(<Settlement result={result} />);
    expect(screen.getByTestId('round-ended-banner')).toBeTruthy();
  });

  it('Settlement renders a sudden-death result (deltas present)', () => {
    const result: RoundEndedPayload = {
      type: 'suddendeath',
      failerIdx: 0,
      deltas: [
        { seatIdx: 0, delta: -17 },
        { seatIdx: 1, delta: 20 },
      ],
      nextFirstPlayerIdx: 1,
    };
    renderWithStore(<Settlement result={result} />);
    expect(screen.getByTestId('round-ended-banner')).toBeTruthy();
  });

  it('Result renders the final ranking from a seeded game result', () => {
    const store = createGameStore();
    const gameResult: GameEndedPayload = {
      ranking: [
        { seatIdx: 0, id: 'a', nickname: '태경', score: 187, rank: 1 },
        { seatIdx: 1, id: 'b', nickname: '유즈', score: 164, rank: 2 },
      ],
    };
    store.getState().onGameEnded(gameResult);
    renderWithStore(<Result />, store);
    expect(screen.getByTestId('final-ranking')).toBeTruthy();
    expect(screen.getByText('태경')).toBeTruthy();
  });

  it('Result renders on an empty store without an infinite loop', () => {
    // Empty gameResult → "결과를 집계하는 중…" placeholder, but must not loop.
    renderWithStore(<Result />);
    expect(screen.getByText('결과를 집계하는 중…')).toBeTruthy();
  });

  it('RoomList renders on an empty store without an infinite loop', () => {
    renderWithStore(<RoomList onBack={() => {}} />);
    // Empty list → "0개" count; the back control is always present.
    expect(screen.getByText('공개 방 목록')).toBeTruthy();
  });
});
