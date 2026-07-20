/**
 * Room registry + lobby lifecycle for SUBWAY (plan §4/§6/§11).
 *
 * Pure-ish and socket-free: this module owns the *lobby* state of a room — its
 * players, host, settings, short code, and password — and the public-room list
 * with filters. It deliberately holds NO Socket.IO reference and NO game engine;
 * `socket.ts` wires those on top. That keeps every transition here unit-testable
 * in isolation (create/join/leave/ready/settings/host-handover/disposal).
 *
 * Determinism note: room-code and roomId generation take an injected `rng` so
 * tests get reproducible codes. There is no `Math.random()` / `Date.now()` in
 * this module — the transport injects clock/rng.
 */

import type {
  Settings,
  LineTier,
  RoomListFilter,
  RoomSnapshot,
  RoomListEntry,
  PlayerSnapshot,
  BalanceConfig,
} from '@subway/shared';

/** A spectator watching a room (no seat, not in rotation). */
export interface SpectatorMember {
  /** Stable id (same as session token for simplicity). */
  id: string;
  /** Session token (for disconnect lookup). */
  token: string;
  /** Display nickname. */
  nickname: string;
  /** Whether this spectator currently has a live socket connection. */
  connected: boolean;
}

/** A lobby member (pre-game / lobby view of a player). */
export interface RoomMember {
  /** Stable player id (session token drives this; seat-stable within a room). */
  id: string;
  /** Session token used for reconnect (issued by the transport). */
  token: string;
  /** Display nickname. */
  nickname: string;
  /** Seat index (assigned on join, stable for the room's life). */
  seatIdx: number;
  /** Lobby ready toggle. */
  ready: boolean;
  /** Whether this member is the host. */
  isHost: boolean;
  /** Whether this member currently has a live socket connection. */
  connected: boolean;
}

/** Room lifecycle phase (mirrors the engine phase at a coarse grain). */
export type RoomLifecycle = 'waiting' | 'playing' | 'ended';

/** A room as tracked by the registry. */
export interface Room {
  /** Internal room id. */
  roomId: string;
  /** Short shareable code (for `subway.gg/r/{code}`). */
  code: string;
  /** Lobby members in seat order. */
  members: RoomMember[];
  /** Spectators watching the room (no seat). */
  spectators: SpectatorMember[];
  /** Current room settings. */
  settings: Settings;
  /** Room lifecycle phase. */
  phase: RoomLifecycle;
}

/** Reason a room operation failed (maps to protocol `ErrorPayload.code`). */
export type RoomError =
  | 'roomNotFound'
  | 'badPassword'
  | 'roomFull'
  | 'notHost'
  | 'notEnoughPlayers'
  | 'alreadyStarted'
  | 'notInRoom';

/** A discriminated success/failure result for room operations. */
export type RoomResult<T> = { ok: true; value: T } | { ok: false; error: RoomError };

const ok = <T>(value: T): RoomResult<T> => ({ ok: true, value });
const err = <T>(error: RoomError): RoomResult<T> => ({ ok: false, error });

/** Maximum players per room (plan §1: 2~8인). */
export const MAX_PLAYERS = 8;
/** Minimum players required to start a game. */
export const MIN_PLAYERS = 2;

/** Characters for the short room code — no ambiguous 0/O/1/I/L. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/** Build the default settings for a new room from balance config (plan §4). */
export function defaultSettings(cfg: BalanceConfig): Settings {
  return {
    isPublic: true,
    rounds: cfg.roomDefaults.rounds,
    roundTimeSec: cfg.R0,
    turnTimeSec: cfg.T0,
    decayR: cfg.r,
    region: 'capital',
    // Carry both intro+normal by default; enforcement of the line-pool is
    // deferred to M7 (see registry note + report). This preset is used purely
    // for room:list filtering today.
    tierFilter: ['intro', 'normal', 'hardcore'],
  };
}

/** Merge a partial settings override, ignoring unknown fields. */
function mergeSettings(base: Settings, patch: Partial<Settings>): Settings {
  return {
    title: 'title' in patch ? patch.title : base.title,
    isPublic: patch.isPublic ?? base.isPublic,
    // password: undefined/empty string clears the password.
    password:
      patch.password === undefined
        ? base.password
        : patch.password === ''
          ? undefined
          : patch.password,
    rounds: patch.rounds ?? base.rounds,
    roundTimeSec: patch.roundTimeSec ?? base.roundTimeSec,
    turnTimeSec: patch.turnTimeSec ?? base.turnTimeSec,
    decayR: patch.decayR ?? base.decayR,
    region: patch.region ?? base.region,
    tierFilter:
      patch.tierFilter && patch.tierFilter.length > 0 ? patch.tierFilter : base.tierFilter,
  };
}

/**
 * The in-memory room registry. One instance per server process (MVP is a single
 * process, plan §10). Injected `rng` keeps code generation deterministic in
 * tests; production passes `Math.random`.
 */
export class RoomRegistry {
  private readonly cfg: BalanceConfig;
  private readonly rng: () => number;
  private readonly rooms = new Map<string, Room>();
  private readonly byCode = new Map<string, string>();
  private roomSeq = 0;

  constructor(cfg: BalanceConfig, rng: () => number = Math.random) {
    this.cfg = cfg;
    this.rng = rng;
  }

  /** Look up a room by internal id. */
  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /** Look up a room by its short code (case-insensitive). */
  getByCode(code: string): Room | undefined {
    const id = this.byCode.get(code.toUpperCase());
    return id ? this.rooms.get(id) : undefined;
  }

  /** All rooms (registry-internal iteration; list() applies public filters). */
  all(): Room[] {
    return [...this.rooms.values()];
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Create a room. The creator becomes host (seat 0). `settings` overrides are
   * merged over the balance defaults. Returns the room + the host member.
   */
  create(host: { id: string; token: string; nickname: string }, settings?: Partial<Settings>): {
    room: Room;
    member: RoomMember;
  } {
    const roomId = this.nextRoomId();
    const code = this.uniqueCode();
    const base = defaultSettings(this.cfg);
    const merged = settings ? mergeSettings(base, settings) : base;

    const member: RoomMember = {
      id: host.id,
      token: host.token,
      nickname: host.nickname,
      seatIdx: 0,
      ready: false,
      isHost: true,
      connected: true,
    };
    const room: Room = {
      roomId,
      code,
      members: [member],
      spectators: [],
      settings: merged,
      phase: 'waiting',
    };
    this.rooms.set(roomId, room);
    this.byCode.set(code, roomId);
    return { room, member };
  }

  /**
   * Join a room by code or roomId. Validates password, capacity, and phase.
   * Assigns the next seat index and appends the member.
   */
  join(
    target: { code?: string; roomId?: string },
    joiner: { id: string; token: string; nickname: string; password?: string },
  ): RoomResult<{ room: Room; member: RoomMember }> {
    // A direct invite-code join is trusted possession of the invitation and
    // intentionally bypasses the room password. Browser/list joins use roomId
    // and must provide the password when one is configured.
    const joinedByCode = target.roomId === undefined && target.code !== undefined;
    const room = joinedByCode
      ? this.getByCode(target.code!)
      : target.roomId
        ? this.rooms.get(target.roomId)
        : undefined;
    if (!room) return err('roomNotFound');
    if (room.phase !== 'waiting') return err('alreadyStarted');
    if (room.members.length >= MAX_PLAYERS) return err('roomFull');
    const passwordRequired = !room.settings.isPublic || Boolean(room.settings.password);
    if (
      !joinedByCode &&
      passwordRequired &&
      (!room.settings.password || room.settings.password !== joiner.password)
    ) {
      return err('badPassword');
    }

    const seatIdx = room.members.length;
    const member: RoomMember = {
      id: joiner.id,
      token: joiner.token,
      nickname: joiner.nickname,
      seatIdx,
      ready: false,
      isHost: false,
      connected: true,
    };
    room.members.push(member);
    return ok({ room, member });
  }

  /**
   * Remove a member (leave / grace-expiry cleanup). Hands over host if the host
   * left, and disposes the room when it becomes empty. Returns the (possibly
   * disposed) room plus the new host seat, or `null` when the room is gone.
   */
  leave(roomId: string, memberId: string): { room: Room; disposed: boolean; newHostIdx: number } | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const idx = room.members.findIndex((m) => m.id === memberId);
    if (idx === -1) return { room, disposed: false, newHostIdx: room.members.findIndex((m) => m.isHost) };

    const leaving = room.members[idx]!;
    room.members.splice(idx, 1);
    // Re-pack seat indices so they stay contiguous 0..n-1.
    room.members.forEach((m, i) => {
      m.seatIdx = i;
    });

    if (room.members.length === 0) {
      this.dispose(roomId);
      return { room, disposed: true, newHostIdx: -1 };
    }

    // Host handover: if the host left, promote the lowest remaining seat.
    if (leaving.isHost) {
      const next = room.members[0]!;
      next.isHost = true;
    }
    return { room, disposed: false, newHostIdx: room.members.findIndex((m) => m.isHost) };
  }

  /** Remove a room from the registry entirely. */
  dispose(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    this.byCode.delete(room.code);
    this.rooms.delete(roomId);
  }

  // -------------------------------------------------------------------------
  // Lobby mutations
  // -------------------------------------------------------------------------

  /** Toggle a member's ready flag. */
  setReady(roomId: string, memberId: string, ready: boolean): RoomResult<Room> {
    const room = this.rooms.get(roomId);
    if (!room) return err('roomNotFound');
    const m = room.members.find((x) => x.id === memberId);
    if (!m) return err('notInRoom');
    m.ready = ready;
    return ok(room);
  }

  /** Update settings — host only, lobby only. */
  updateSettings(roomId: string, memberId: string, patch: Partial<Settings>): RoomResult<Room> {
    const room = this.rooms.get(roomId);
    if (!room) return err('roomNotFound');
    if (room.phase !== 'waiting') return err('alreadyStarted');
    const m = room.members.find((x) => x.id === memberId);
    if (!m) return err('notInRoom');
    if (!m.isHost) return err('notHost');
    room.settings = mergeSettings(room.settings, patch);
    return ok(room);
  }

  /**
   * Validate a start request: host-only, lobby phase, and >= MIN_PLAYERS. On
   * success flips the room to `playing` and returns it.
   */
  startGame(roomId: string, memberId: string): RoomResult<Room> {
    const room = this.rooms.get(roomId);
    if (!room) return err('roomNotFound');
    if (room.phase !== 'waiting') return err('alreadyStarted');
    const m = room.members.find((x) => x.id === memberId);
    if (!m) return err('notInRoom');
    if (!m.isHost) return err('notHost');
    if (room.members.length < MIN_PLAYERS) return err('notEnoughPlayers');
    room.phase = 'playing';
    return ok(room);
  }

  /** Mark the room's game as ended (engine reached `ended`). */
  endGame(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) room.phase = 'ended';
  }

  /** Reset an ended room back to waiting — host only. Clears all ready flags. */
  resetGame(roomId: string, memberId: string): RoomResult<Room> {
    const room = this.rooms.get(roomId);
    if (!room) return err('roomNotFound');
    const m = room.members.find((x) => x.id === memberId);
    if (!m) return err('notInRoom');
    if (!m.isHost) return err('notHost');
    room.phase = 'waiting';
    for (const member of room.members) member.ready = false;
    return ok(room);
  }

  /** Find a member by session token (reconnect path). */
  findByToken(token: string): { room: Room; member: RoomMember } | undefined {
    for (const room of this.rooms.values()) {
      const member = room.members.find((m) => m.token === token);
      if (member) return { room, member };
    }
    return undefined;
  }

  /**
   * Switch a seated player to spectator (lobby phase only). Hands over host if
   * needed. Returns an error when the player is the sole member (would leave the
   * room empty).
   */
  switchToSpectator(roomId: string, memberToken: string): RoomResult<{ room: Room; spectator: SpectatorMember }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('roomNotFound');
    if (room.phase !== 'waiting') return err('alreadyStarted');

    const idx = room.members.findIndex((m) => m.token === memberToken);
    if (idx === -1) return err('notInRoom');
    if (room.members.length === 1) return err('notEnoughPlayers');

    const leaving = room.members[idx]!;
    room.members.splice(idx, 1);
    room.members.forEach((m, i) => { m.seatIdx = i; });

    if (leaving.isHost && room.members.length > 0) {
      room.members[0]!.isHost = true;
    }

    const existing = room.spectators.find((s) => s.token === memberToken);
    if (existing) {
      existing.connected = leaving.connected;
      return ok({ room, spectator: existing });
    }
    const spectator: SpectatorMember = {
      id: leaving.id,
      token: leaving.token,
      nickname: leaving.nickname,
      connected: leaving.connected,
    };
    room.spectators.push(spectator);
    return ok({ room, spectator });
  }

  /**
   * Switch a spectator to a seated player (lobby phase only, room must not be
   * full). The new player is appended at the next available seat.
   */
  switchToPlayer(roomId: string, spectatorToken: string): RoomResult<{ room: Room; member: RoomMember }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('roomNotFound');
    if (room.phase !== 'waiting') return err('alreadyStarted');
    if (room.members.length >= MAX_PLAYERS) return err('roomFull');

    const spectIdx = room.spectators.findIndex((s) => s.token === spectatorToken);
    if (spectIdx === -1) return err('notInRoom');

    const spectator = room.spectators[spectIdx]!;
    room.spectators.splice(spectIdx, 1);

    const member: RoomMember = {
      id: spectator.id,
      token: spectator.token,
      nickname: spectator.nickname,
      seatIdx: room.members.length,
      ready: false,
      isHost: false,
      connected: spectator.connected,
    };
    room.members.push(member);
    return ok({ room, member });
  }

  /**
   * Join a room as a spectator (no seat, not in turn rotation). Allowed in any
   * non-ended phase. Returns the existing entry if the token already has one.
   */
  joinAsSpectator(
    target: { code?: string; roomId?: string },
    joiner: { id: string; token: string; nickname: string; password?: string },
  ): RoomResult<{ room: Room; spectator: SpectatorMember }> {
    const joinedByCode = target.roomId === undefined && target.code !== undefined;
    const room = joinedByCode
      ? this.getByCode(target.code!)
      : target.roomId
        ? this.rooms.get(target.roomId)
        : undefined;
    if (!room) return err('roomNotFound');
    if (room.phase === 'ended') return err('alreadyStarted');
    const passwordRequired = !room.settings.isPublic || Boolean(room.settings.password);
    if (
      !joinedByCode &&
      passwordRequired &&
      (!room.settings.password || room.settings.password !== joiner.password)
    ) {
      return err('badPassword');
    }
    const existing = room.spectators.find((s) => s.token === joiner.token);
    if (existing) {
      existing.connected = true;
      return ok({ room, spectator: existing });
    }
    const spectator: SpectatorMember = {
      id: joiner.id,
      token: joiner.token,
      nickname: joiner.nickname,
      connected: true,
    };
    room.spectators.push(spectator);
    return ok({ room, spectator });
  }

  /** Remove a spectator from a room (disconnect / leave). */
  removeSpectator(roomId: string, spectatorId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const idx = room.spectators.findIndex((s) => s.id === spectatorId);
    if (idx !== -1) room.spectators.splice(idx, 1);
  }

  /** Find a spectator by session token (for disconnect cleanup). */
  findSpectatorByToken(token: string): { room: Room; spectator: SpectatorMember } | undefined {
    for (const room of this.rooms.values()) {
      const spectator = room.spectators.find((s) => s.token === token);
      if (spectator) return { room, spectator };
    }
    return undefined;
  }

  /** Set a member's live-connection flag (does not change seat/rotation). */
  setConnected(roomId: string, memberId: string, connected: boolean): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const m = room.members.find((x) => x.id === memberId);
    if (m) m.connected = connected;
  }

  // -------------------------------------------------------------------------
  // Public list + snapshots
  // -------------------------------------------------------------------------

  /** Room list with the requested filter (plan §4: 전체/대기중/입문/일반). */
  list(filter: RoomListFilter = 'all'): RoomListEntry[] {
    const out: RoomListEntry[] = [];
    for (const room of this.rooms.values()) {
      if (filter === 'waiting' && room.phase !== 'waiting') continue;
      if (filter === 'intro' && !room.settings.tierFilter.includes('intro')) continue;
      if (filter === 'normal' && !room.settings.tierFilter.includes('normal')) continue;
      out.push(this.toListEntry(room));
    }
    return out;
  }

  /** Build the JSON-safe list entry for a room. */
  private toListEntry(room: Room): RoomListEntry {
    const host = room.members.find((m) => m.isHost);
    const hostNickname = host?.nickname ?? '';
    return {
      roomId: room.roomId,
      code: room.code,
      title: room.settings.title || `${hostNickname}의 방`,
      phase: room.phase,
      hostNickname,
      playerCount: room.members.length,
      hasPassword: Boolean(room.settings.password),
      isPublic: room.settings.isPublic,
      region: room.settings.region,
      tierFilter: room.settings.tierFilter as LineTier[],
      rounds: room.settings.rounds,
    };
  }

  /**
   * Build the lobby-phase `room:state` snapshot for a room. In-game round/turn
   * fields are attached by `socket.ts` from the live engine — this base carries
   * only the lobby view (players/settings/host/code).
   */
  snapshot(room: Room): RoomSnapshot {
    const hostIdx = room.members.findIndex((m) => m.isHost);
    const players: PlayerSnapshot[] = room.members.map((m) => ({
      id: m.id,
      nickname: m.nickname,
      seatIdx: m.seatIdx,
      score: 0,
      ready: m.ready,
      isHost: m.isHost,
      status: m.connected ? 'connected' : 'disconnected',
    }));
    // Never broadcast the password itself. Clients only need to know whether
    // one is configured; RoomSnapshot.hasPassword carries that information.
    const safeSettings = { ...room.settings };
    delete safeSettings.password;
    return {
      roomId: room.roomId,
      code: room.code,
      phase: room.phase,
      hostIdx,
      settings: safeSettings,
      hasPassword: Boolean(room.settings.password),
      players,
      spectators: room.spectators.map((s) => ({ id: s.id, nickname: s.nickname })),
    };
  }

  // -------------------------------------------------------------------------
  // Id / code generation (injected rng → deterministic in tests)
  // -------------------------------------------------------------------------

  private nextRoomId(): string {
    this.roomSeq += 1;
    // Seq + a short rng suffix keeps ids unique even under identical rng streams.
    const suffix = Math.floor(this.rng() * 0xffffff)
      .toString(16)
      .padStart(6, '0');
    return `room_${this.roomSeq.toString(36)}_${suffix}`;
  }

  private uniqueCode(): string {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const code = this.randomCode();
      if (!this.byCode.has(code)) return code;
    }
    throw new Error('RoomRegistry: exhausted room-code space');
  }

  private randomCode(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      const j = Math.floor(this.rng() * CODE_ALPHABET.length);
      code += CODE_ALPHABET[j];
    }
    return code;
  }
}
