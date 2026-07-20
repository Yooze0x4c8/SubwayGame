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

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import type {
  RoundEndedPayload,
  GameEndedPayload,
  RoomListEntry,
  RoomSnapshot,
} from '@subway/shared';

import { StoreProvider } from '../state/StoreProvider.js';
import { createGameStore, type GameStore } from '../state/gameStore.js';
import type { StoreApi } from 'zustand/vanilla';
import type { SocketClient } from '../net/socket.js';
import { Settlement } from './Settlement.js';
import { Result } from './Result.js';
import { RoomList } from './RoomList.js';
import { WaitingRoom } from './WaitingRoom.js';

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
    resetRoom: noop,
    submitTurn: noop,
    becomeSpectator: noop,
    becomePlayer: noop,
    sendChat: noop,
    leaveRoom: noop,
    disconnect: noop,
  };
}

function renderWithStore(
  ui: React.ReactElement,
  store: StoreApi<GameStore> = createGameStore(),
  client: SocketClient = fakeClient(),
) {
  return render(
    <StoreProvider store={store} client={client}>
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

  it('RoomList asks for a password and joins a listed room by roomId', () => {
    const store = createGameStore();
    const room: RoomListEntry = {
      roomId: 'room-1',
      code: 'ABCDEF',
      title: '잠긴 방',
      phase: 'waiting',
      hostNickname: '방장',
      playerCount: 1,
      hasPassword: true,
      region: 'capital',
      tierFilter: ['intro'],
      rounds: 5,
    };
    store.setState({ roomList: [room], myNickname: '참가자' });
    const client = fakeClient();
    client.joinRoom = vi.fn();

    renderWithStore(<RoomList onBack={() => {}} />, store, client);
    fireEvent.click(screen.getByRole('button', { name: '입장' }));
    fireEvent.change(screen.getByLabelText('방 비밀번호'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));

    expect(client.joinRoom).toHaveBeenCalledWith({
      roomId: 'room-1',
      nickname: '참가자',
      password: '1234',
      isSpectator: false,
    });
  });

  it('WaitingRoom lets the host save a private-room password without exposing it', () => {
    const store = createGameStore();
    const room: RoomSnapshot = {
      roomId: 'room-1',
      code: 'ABCDEF',
      phase: 'waiting',
      hostIdx: 0,
      settings: {
        isPublic: false,
        rounds: 5,
        roundTimeSec: 120,
        turnTimeSec: 15,
        decayR: 0.96,
        region: 'capital',
        tierFilter: ['intro'],
      },
      hasPassword: false,
      players: [{
        id: 'host-token',
        nickname: '방장',
        seatIdx: 0,
        score: 0,
        ready: false,
        isHost: true,
        status: 'connected',
      }],
      spectators: [],
    };
    store.getState().setToken('host-token');
    store.getState().onRoomState(room);
    const client = fakeClient();
    client.updateSettings = vi.fn();

    renderWithStore(<WaitingRoom onLeave={() => {}} />, store, client);
    fireEvent.change(screen.getByLabelText('입장 비밀번호'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(client.updateSettings).toHaveBeenCalledWith({ password: 'secret' });
    expect(screen.queryByDisplayValue('secret')).toBeNull();
  });
});
