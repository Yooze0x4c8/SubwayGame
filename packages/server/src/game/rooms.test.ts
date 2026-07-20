/**
 * Unit tests for the room registry (plan §4/§6/§11). No sockets: the registry is
 * socket-free by design, so lobby lifecycle is fully testable in isolation.
 *
 * A seeded rng makes room-code/id generation reproducible (no Math.random).
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { loadBalance } from '@subway/shared';
import type { BalanceConfig } from '@subway/shared';

import { RoomRegistry, MAX_PLAYERS, defaultSettings } from './rooms.js';

// Seeded PRNG (mulberry32) — deterministic room codes/ids across runs.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cfg: BalanceConfig = loadBalance();

let reg: RoomRegistry;
beforeEach(() => {
  reg = new RoomRegistry(cfg, mulberry32(42));
});

function host(id: string) {
  return { id, token: id, nickname: id.toUpperCase() };
}

describe('RoomRegistry — create', () => {
  it('creates a room with the creator as host at seat 0', () => {
    const { room, member } = reg.create(host('a'));
    expect(member.isHost).toBe(true);
    expect(member.seatIdx).toBe(0);
    expect(room.phase).toBe('waiting');
    expect(reg.get(room.roomId)).toBe(room);
    expect(reg.getByCode(room.code)).toBe(room);
  });

  it('applies default settings and merges overrides', () => {
    const { room } = reg.create(host('a'), { rounds: 7, region: 'busan', password: '1234' });
    const d = defaultSettings(cfg);
    expect(room.settings.rounds).toBe(7);
    expect(room.settings.region).toBe('busan');
    expect(room.settings.password).toBe('1234');
    // Unspecified fields fall back to defaults.
    expect(room.settings.turnTimeSec).toBe(d.turnTimeSec);
  });

  it('generates unique room codes across many rooms', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const { room } = reg.create(host(`h${i}`));
      expect(codes.has(room.code)).toBe(false);
      codes.add(room.code);
    }
    expect(codes.size).toBe(200);
  });
});

describe('RoomRegistry — join', () => {
  it('joins by code and assigns the next seat', () => {
    const { room } = reg.create(host('a'));
    const res = reg.join({ code: room.code }, host('b'));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.member.seatIdx).toBe(1);
      expect(res.value.member.isHost).toBe(false);
    }
  });

  it('joins by roomId', () => {
    const { room } = reg.create(host('a'));
    const res = reg.join({ roomId: room.roomId }, host('b'));
    expect(res.ok).toBe(true);
  });

  it('rejects an unknown room', () => {
    const res = reg.join({ code: 'ZZZZZZ' }, host('b'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('roomNotFound');
  });

  it('requires the password for roomId joins', () => {
    const { room } = reg.create(host('a'), { password: '4321' });
    const bad = reg.join({ roomId: room.roomId }, { ...host('b'), password: '0000' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe('badPassword');
    const good = reg.join({ roomId: room.roomId }, { ...host('c'), password: '4321' });
    expect(good.ok).toBe(true);
  });

  it('lets an invite-code join bypass the configured password', () => {
    const { room } = reg.create(host('a'), { isPublic: false, password: '4321' });
    const res = reg.join({ code: room.code }, host('b'));
    expect(res.ok).toBe(true);
  });

  it('does not admit a private roomId join before the host sets a password', () => {
    const { room } = reg.create(host('a'), { isPublic: false });
    const res = reg.join({ roomId: room.roomId }, { ...host('b'), password: 'anything' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('badPassword');
  });

  it('rejects joining a full room', () => {
    const { room } = reg.create(host('a'));
    for (let i = 1; i < MAX_PLAYERS; i++) {
      expect(reg.join({ code: room.code }, host(`p${i}`)).ok).toBe(true);
    }
    const overflow = reg.join({ code: room.code }, host('overflow'));
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) expect(overflow.error).toBe('roomFull');
  });

  it('rejects joining a room that already started', () => {
    const { room } = reg.create(host('a'));
    reg.join({ code: room.code }, host('b'));
    reg.startGame(room.roomId, 'a');
    const res = reg.join({ code: room.code }, host('c'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('alreadyStarted');
  });
});

describe('RoomRegistry — ready toggle', () => {
  it('toggles a member ready flag', () => {
    const { room } = reg.create(host('a'));
    reg.setReady(room.roomId, 'a', true);
    expect(room.members[0]!.ready).toBe(true);
    reg.setReady(room.roomId, 'a', false);
    expect(room.members[0]!.ready).toBe(false);
  });

  it('errors readying a non-member', () => {
    const { room } = reg.create(host('a'));
    const res = reg.setReady(room.roomId, 'ghost', true);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('notInRoom');
  });
});

describe('RoomRegistry — host-only guards', () => {
  it('lets the host update settings but rejects non-hosts', () => {
    const { room } = reg.create(host('a'));
    reg.join({ code: room.code }, host('b'));
    const asHost = reg.updateSettings(room.roomId, 'a', { rounds: 3 });
    expect(asHost.ok).toBe(true);
    expect(room.settings.rounds).toBe(3);
    const asGuest = reg.updateSettings(room.roomId, 'b', { rounds: 7 });
    expect(asGuest.ok).toBe(false);
    if (!asGuest.ok) expect(asGuest.error).toBe('notHost');
  });

  it('requires host + >=2 players to start', () => {
    const { room } = reg.create(host('a'));
    const solo = reg.startGame(room.roomId, 'a');
    expect(solo.ok).toBe(false);
    if (!solo.ok) expect(solo.error).toBe('notEnoughPlayers');

    reg.join({ code: room.code }, host('b'));
    const asGuest = reg.startGame(room.roomId, 'b');
    expect(asGuest.ok).toBe(false);
    if (!asGuest.ok) expect(asGuest.error).toBe('notHost');

    const asHost = reg.startGame(room.roomId, 'a');
    expect(asHost.ok).toBe(true);
    expect(room.phase).toBe('playing');
  });
});

describe('RoomRegistry — leave / host handover / disposal', () => {
  it('re-packs seats and hands host to the next seat on host leave', () => {
    const { room } = reg.create(host('a'));
    reg.join({ code: room.code }, host('b'));
    reg.join({ code: room.code }, host('c'));

    const left = reg.leave(room.roomId, 'a');
    expect(left).not.toBeNull();
    expect(left!.disposed).toBe(false);
    // b is now host at seat 0, c at seat 1.
    expect(room.members[0]!.id).toBe('b');
    expect(room.members[0]!.isHost).toBe(true);
    expect(room.members[0]!.seatIdx).toBe(0);
    expect(room.members[1]!.id).toBe('c');
    expect(room.members[1]!.seatIdx).toBe(1);
  });

  it('disposes the room when the last member leaves', () => {
    const { room } = reg.create(host('a'));
    const left = reg.leave(room.roomId, 'a');
    expect(left!.disposed).toBe(true);
    expect(reg.get(room.roomId)).toBeUndefined();
    expect(reg.getByCode(room.code)).toBeUndefined();
  });
});

describe('RoomRegistry — room list filtering', () => {
  it('includes locked private rooms and filters by phase/tier', () => {
    const pubWaiting = reg.create(host('a'), { isPublic: true, tierFilter: ['intro'] });
    const privRoom = reg.create(host('b'), { isPublic: false });
    const pubNormal = reg.create(host('c'), { isPublic: true, tierFilter: ['normal'] });
    reg.join({ code: pubNormal.room.code }, host('c2'));
    reg.startGame(pubNormal.room.roomId, 'c'); // now 'playing'

    const all = reg.list('all');
    expect(all.map((r) => r.roomId).sort()).toEqual(
      [pubWaiting.room.roomId, privRoom.room.roomId, pubNormal.room.roomId].sort(),
    );
    expect(all.find((r) => r.roomId === privRoom.room.roomId)?.isPublic).toBe(false);

    const waiting = reg.list('waiting');
    expect(waiting.map((r) => r.roomId)).toEqual([
      pubWaiting.room.roomId,
      privRoom.room.roomId,
    ]);

    const intro = reg.list('intro');
    expect(intro.map((r) => r.roomId)).toEqual([
      pubWaiting.room.roomId,
      privRoom.room.roomId,
    ]);

    const normal = reg.list('normal');
    expect(normal.map((r) => r.roomId)).toEqual([
      privRoom.room.roomId,
      pubNormal.room.roomId,
    ]);
  });

  it('list entries carry code/host/count/password/tier', () => {
    const { room } = reg.create(host('a'), { password: '9999', tierFilter: ['intro', 'normal'] });
    reg.join({ code: room.code }, { ...host('b'), password: '9999' });
    const [entry] = reg.list('all');
    expect(entry).toBeDefined();
    expect(entry!.code).toBe(room.code);
    expect(entry!.hostNickname).toBe('A');
    expect(entry!.playerCount).toBe(2);
    expect(entry!.hasPassword).toBe(true);
    expect(entry!.isPublic).toBe(true);
    expect(entry!.tierFilter).toEqual(['intro', 'normal']);
  });
});

describe('RoomRegistry — password privacy', () => {
  it('does not expose the password in room snapshots', () => {
    const { room } = reg.create(host('a'), { isPublic: false, password: 'secret' });
    const snapshot = reg.snapshot(room);
    expect(snapshot.hasPassword).toBe(true);
    expect(snapshot.settings.password).toBeUndefined();
  });

  it('applies the same roomId/code password policy to spectators', () => {
    const { room } = reg.create(host('a'), { password: 'secret' });
    const denied = reg.joinAsSpectator({ roomId: room.roomId }, host('b'));
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error).toBe('badPassword');

    expect(reg.joinAsSpectator({ code: room.code }, host('c')).ok).toBe(true);
  });
});

describe('RoomRegistry — reconnect lookup', () => {
  it('finds a member by session token', () => {
    const { room } = reg.create(host('a'));
    reg.join({ code: room.code }, host('b'));
    const found = reg.findByToken('b');
    expect(found).toBeDefined();
    expect(found!.member.seatIdx).toBe(1);
    expect(found!.room.roomId).toBe(room.roomId);
  });
});
