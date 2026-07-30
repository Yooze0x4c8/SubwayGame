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
    gameMode: 'metro',
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

describe('gameStore — timeout answer flash', () => {
  it('stores a repeatable flash event and clears it explicitly', () => {
    const store = createGameStore();
    const result = {
      type: 'suddendeath' as const,
      deltas: [],
      exampleAnswer: '사당',
    };

    store.getState().onRoundEnded(result);
    const first = store.getState().answerFlash;
    expect(first?.text).toBe('사당');

    store.getState().clearAnswerFlash();
    expect(store.getState().answerFlash).toBeUndefined();

    store.getState().onRoundEnded(result);
    expect(store.getState().answerFlash?.id).toBeGreaterThan(first!.id);
  });
});

describe('gameStore - rejected answer', () => {
  it('keeps the submitted text and player for station-plate feedback', () => {
    const store = createGameStore();

    store.getState().onTurnRejected({
      reason: 'notFound',
      text: '없는역',
      byPlayerIdx: 1,
    });

    expect(store.getState().rejection).toMatchObject({
      reason: 'notFound',
      text: '없는역',
      byPlayerIdx: 1,
    });
  });
});

describe('gameStore - accepted-turn round extension', () => {
  it('updates the authoritative round deadline and exposes a +1s effect', () => {
    const store = createGameStore();
    store.getState().onRoundStarted({
      round: 1,
      startStation: 1,
      startStationName: '서울역',
      startLines: [1],
      startLineNames: ['seoul_1'],
      startStationLineNames: ['seoul_1'],
      firstPlayerIdx: 0,
      roundDeadline: 120_000,
    });

    store.getState().onTurnAccepted({
      station: 2,
      stationName: '시청',
      transfer: false,
      newLine: false,
      scoreDelta: 10,
      byPlayerIdx: 0,
      stationLineNames: ['seoul_1'],
      newActiveLineNames: ['seoul_1'],
      roundTimeBonusMs: 1000,
      roundDeadline: 121_000,
    });

    expect(store.getState().round?.roundDeadline).toBe(121_000);
    expect(store.getState().roundTimeBonus?.deltaMs).toBe(1000);
  });
});
