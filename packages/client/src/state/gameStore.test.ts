import { describe, expect, it } from 'vitest';

import type { GameEndedPayload, RoomSnapshot } from '@subway/shared';

import { createGameStore } from './gameStore.js';

const endedRoom: RoomSnapshot = {
  roomId: 'room-1',
  code: 'ABCDEF',
  phase: 'ended',
  hostIdx: 0,
  settings: {
    isPublic: true,
    rounds: 1,
    roundTimeSec: 120,
    turnTimeSec: 15,
    decayR: 0.96,
    region: 'capital',
    tierFilter: ['intro'],
  },
  hasPassword: false,
  players: [
    {
      id: 'host',
      nickname: '방장',
      seatIdx: 0,
      score: 10,
      ready: false,
      isHost: true,
      status: 'connected',
    },
    {
      id: 'guest',
      nickname: '참가자',
      seatIdx: 1,
      score: 5,
      ready: false,
      isHost: false,
      status: 'connected',
    },
  ],
  spectators: [],
};

const finalResult: GameEndedPayload = {
  ranking: [
    { seatIdx: 0, id: 'host', nickname: '방장', score: 10, rank: 1 },
    { seatIdx: 1, id: 'guest', nickname: '참가자', score: 5, rank: 2 },
  ],
  roundRoutes: [{
    round: 1,
    endType: 'suddendeath',
    stops: [{ station: 0, stationName: '시청', stationLineNames: ['seoul_1', 'seoul_2'] }],
  }],
};

describe('gameStore — independent final-result viewing', () => {
  it('keeps this client on results when the host resets the room', () => {
    const store = createGameStore();
    store.getState().onRoomState(endedRoom);
    store.getState().onGameEnded(finalResult);

    store.getState().onRoomState({ ...endedRoom, phase: 'waiting' });

    expect(store.getState().phase).toBe('ended');
    expect(store.getState().gameResult).toEqual(finalResult);
    expect(store.getState().resultScreenActive).toBe(true);
  });

  it('moves only this client to waiting when result viewing is dismissed', () => {
    const store = createGameStore();
    store.getState().onRoomState(endedRoom);
    store.getState().onGameEnded(finalResult);

    store.getState().dismissGameResult();

    expect(store.getState().phase).toBe('waiting');
    expect(store.getState().gameResult).toBeUndefined();
    expect(store.getState().resultScreenActive).toBe(false);
  });
});
