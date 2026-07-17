/**
 * Real-time protocol contract for SUBWAY (plan §4).
 *
 * Event-name constants + payload TYPES for every Socket.IO event in both
 * directions. These live in `@subway/shared` so the future React client reuses
 * the exact same types the server emits/consumes — one source of truth for the
 * wire format. No logic here: pure declarations.
 *
 * The server is authoritative for all state transitions; these types describe
 * only what crosses the wire. Deadlines are absolute epoch milliseconds (the
 * same clock the engine uses), so the client can render a countdown by diffing
 * against its own clock (display only — never authoritative).
 */

import type { LineTier, Settings } from './types.js';

// ---------------------------------------------------------------------------
// Event-name constants
// ---------------------------------------------------------------------------

/** Client → Server event names (plan §4). */
export const ClientEvents = {
  roomCreate: 'room:create',
  roomJoin: 'room:join',
  roomList: 'room:list',
  playerReady: 'player:ready',
  hostUpdateSettings: 'host:updateSettings',
  hostStart: 'host:start',
  turnSubmit: 'turn:submit',
} as const;

/** Server → Client event names (plan §4). */
export const ServerEvents = {
  roomState: 'room:state',
  roomListResult: 'room:list:result',
  gameStarted: 'game:started',
  roundStarted: 'round:started',
  turnStarted: 'turn:started',
  turnRejected: 'turn:rejected',
  turnAccepted: 'turn:accepted',
  roundEnded: 'round:ended',
  gameEnded: 'game:ended',
  /** Delivered once on connect/reconnect: carries the session token to persist. */
  session: 'session',
  /** Generic error channel for rejected client actions (bad code, not host…). */
  error: 'error',
} as const;

/** Union of client→server event-name string literals. */
export type ClientEventName = (typeof ClientEvents)[keyof typeof ClientEvents];
/** Union of server→client event-name string literals. */
export type ServerEventName = (typeof ServerEvents)[keyof typeof ServerEvents];

// ---------------------------------------------------------------------------
// Public-list filter (plan §4/§6): 전체 | 대기중 | 입문 | 일반
// ---------------------------------------------------------------------------

/**
 * Public-room list filter.
 * - `all`     (전체)   — every public room.
 * - `waiting` (대기중) — rooms still in the lobby (not yet started).
 * - `intro`   (입문)   — rooms whose settings preset carries the `intro` tier.
 * - `normal`  (일반)   — rooms whose settings preset carries the `normal` tier.
 */
export type RoomListFilter = 'all' | 'waiting' | 'intro' | 'normal';

// ---------------------------------------------------------------------------
// Serializable room/player snapshots (lobby + reconnect sync)
// ---------------------------------------------------------------------------

/** A player as serialized into a {@link RoomSnapshot} (JSON-safe). */
export interface PlayerSnapshot {
  /** Stable player id (session-scoped). */
  id: string;
  /** Display nickname. */
  nickname: string;
  /** Seat index in the room (turn rotation order). */
  seatIdx: number;
  /** Cumulative score across rounds (0 until the game starts). */
  score: number;
  /** Lobby ready toggle. */
  ready: boolean;
  /** Whether this player is the room host. */
  isHost: boolean;
  /** Connection/participation status. */
  status: 'connected' | 'disconnected' | 'spectating';
}

/** Room phase for the lobby/list UI. */
export type RoomPhase = 'waiting' | 'playing' | 'ended';

/**
 * Full room snapshot (`room:state`) for lobby display and reconnect resync.
 * When a game is live, `round`/`turn` mirror the current engine clocks so a
 * reconnecting client can immediately render the in-game screen.
 */
export interface RoomSnapshot {
  /** Internal room id (uuid-ish). */
  roomId: string;
  /** Short shareable room code (for `subway.gg/r/{code}`). */
  code: string;
  /** Room lifecycle phase. */
  phase: RoomPhase;
  /** Seat index of the host. */
  hostIdx: number;
  /** Current room settings. */
  settings: Settings;
  /** Whether the room requires a password to join. */
  hasPassword: boolean;
  /** All seated players. */
  players: PlayerSnapshot[];
  /** Live round snapshot (present only while `phase === 'playing'`). */
  round?: RoundStartedPayload;
  /** Live turn snapshot (present only while a turn is open). */
  turn?: TurnStartedPayload;
}

/** A public-list room entry (`room:list:result`). */
export interface RoomListEntry {
  /** Internal room id. */
  roomId: string;
  /** Short shareable room code. */
  code: string;
  /** Room lifecycle phase. */
  phase: RoomPhase;
  /** Host nickname (list display). */
  hostNickname: string;
  /** Current player count. */
  playerCount: number;
  /** Whether the room requires a password. */
  hasPassword: boolean;
  /** Region slug. */
  region: string;
  /** Line-tier preset carried in settings (for 입문/일반 filtering). */
  tierFilter: LineTier[];
  /** Number of rounds configured. */
  rounds: number;
}

// ---------------------------------------------------------------------------
// Client → Server payloads
// ---------------------------------------------------------------------------

/** `room:create` — create a room and become its host. */
export interface RoomCreatePayload {
  /** Host's display nickname. */
  nickname: string;
  /** Optional partial settings overriding room defaults. */
  settings?: Partial<Settings>;
  /** Optional session token to reclaim (rare; usually server-issued). */
  token?: string;
}

/** `room:join` — join by code or roomId. */
export interface RoomJoinPayload {
  /** Short room code (either this or `roomId` is required). */
  code?: string;
  /** Internal room id (either this or `code` is required). */
  roomId?: string;
  /** Joiner's display nickname. */
  nickname: string;
  /** Password, if the room requires one. */
  password?: string;
  /** Existing session token, for reconnect to a room already joined. */
  token?: string;
}

/** `room:list` — query the public room list. */
export interface RoomListPayload {
  /** Filter to apply (defaults to `all`). */
  filter?: RoomListFilter;
}

/** `player:ready` — toggle lobby ready state. */
export interface PlayerReadyPayload {
  /** New ready value. */
  ready: boolean;
}

/** `host:updateSettings` — host changes room settings (lobby only). */
export interface HostUpdateSettingsPayload {
  /** Partial settings to merge over the current room settings. */
  settings: Partial<Settings>;
}

/** `turn:submit` — attempt a station name for the current turn. */
export interface TurnSubmitPayload {
  /** Raw station-name text the player typed. */
  text: string;
}

// ---------------------------------------------------------------------------
// Server → Client payloads
// ---------------------------------------------------------------------------

/** `session` — delivered on connect so the client can persist its token. */
export interface SessionPayload {
  /** Opaque session token; resend on reconnect to reclaim the seat. */
  token: string;
}

/** `room:list:result` — the public room list. */
export interface RoomListResultPayload {
  /** Matching public rooms. */
  rooms: RoomListEntry[];
}

/** `game:started` — the game has begun (round/turn arrive right after). */
export interface GameStartedPayload {
  /** 1-based round number that is starting. */
  round: number;
  /** Total rounds in the game. */
  totalRounds: number;
}

/** `round:started` — a new round's start station/line were drawn (plan §4). */
export interface RoundStartedPayload {
  /** 1-based round number. */
  round: number;
  /** Integer `stationIdx` of the drawn start station. */
  startStation: number;
  /** Display name of the start station (client convenience). */
  startStationName: string;
  /** Line bit positions active at round start. */
  startLines: number[];
  /** Line id slugs for startLines (client convenience, e.g. ['seoul_2']). */
  startLineNames: string[];
  /** Line id slugs of every line the start station is on (for transfer indicators). */
  startStationLineNames: string[];
  /** Seat index of the first player this round. */
  firstPlayerIdx: number;
  /** Absolute epoch-ms round-clock deadline. */
  roundDeadline: number;
}

/** `turn:started` — a turn opened (round-gate passed) (plan §4). */
export interface TurnStartedPayload {
  /** Seat index whose turn is live. */
  playerIdx: number;
  /** Turn counter within the round. */
  turnIndex: number;
  /** Absolute epoch-ms turn-clock deadline. */
  turnDeadline: number;
}

/** `turn:rejected` — invalid answer; time keeps running, no state change. */
export interface TurnRejectedPayload {
  /** Why the answer was rejected. */
  reason: 'notFound' | 'duplicate' | 'lineMismatch' | 'wrongTurn' | 'notRunning';
}

/** `turn:accepted` — valid answer confirmed and scored (plan §4). */
export interface TurnAcceptedPayload {
  /** Integer `stationIdx` of the accepted station. */
  station: number;
  /** Display name of the accepted station. */
  stationName: string;
  /** True when the answer was reached via a transfer. */
  transfer: boolean;
  /** True when the answer opened a not-yet-used line. */
  newLine: boolean;
  /** Points added to the answering player. */
  scoreDelta: number;
  /** Seat index of the answering player. */
  byPlayerIdx: number;
  /** Line id slugs of every line this station is on (for transfer indicators). */
  stationLineNames: string[];
}

/** A single player's round-settlement score change. */
export interface RoundDelta {
  /** Seat index of the affected player. */
  seatIdx: number;
  /** Score change applied by this round's settlement. */
  delta: number;
}

/** `round:ended` — settlement of a finished round (plan §4). */
export interface RoundEndedPayload {
  /** How the round ended. */
  type: 'suddendeath' | 'complete';
  /** Seat index of the failer (sudden-death only). */
  failerIdx?: number;
  /** Per-player settlement deltas. */
  deltas: RoundDelta[];
  /** Seat index that will lead the next round (undefined if game ended). */
  nextFirstPlayerIdx?: number;
  /** `stationIdx` of the next round's start station (undefined if game ended). */
  nextStartStation?: number;
}

/** A single ranked entry in the final result (`game:ended`). */
export interface RankingEntryPayload {
  /** Seat index of the player. */
  seatIdx: number;
  /** Player id. */
  id: string;
  /** Display nickname. */
  nickname: string;
  /** Final cumulative score. */
  score: number;
  /** 1-based rank (ties share the lower rank number). */
  rank: number;
}

/** `game:ended` — final ranking (plan §4). */
export interface GameEndedPayload {
  /** Players ranked by final score (desc). */
  ranking: RankingEntryPayload[];
}

/** `error` — a client action was rejected (bad code, not host, etc.). */
export interface ErrorPayload {
  /** Machine-readable error code. */
  code:
    | 'roomNotFound'
    | 'badPassword'
    | 'roomFull'
    | 'notHost'
    | 'notEnoughPlayers'
    | 'alreadyStarted'
    | 'notInRoom'
    | 'invalid';
  /** Human-readable message (for dev/logging). */
  message: string;
}

// ---------------------------------------------------------------------------
// Typed event maps (usable by socket.io ServerToClientEvents / vice-versa)
// ---------------------------------------------------------------------------

/** Server→Client typed event signatures (for `Server<...>` generics). */
export interface ServerToClientEvents {
  'session': (p: SessionPayload) => void;
  'room:state': (p: RoomSnapshot) => void;
  'room:list:result': (p: RoomListResultPayload) => void;
  'game:started': (p: GameStartedPayload) => void;
  'round:started': (p: RoundStartedPayload) => void;
  'turn:started': (p: TurnStartedPayload) => void;
  'turn:rejected': (p: TurnRejectedPayload) => void;
  'turn:accepted': (p: TurnAcceptedPayload) => void;
  'round:ended': (p: RoundEndedPayload) => void;
  'game:ended': (p: GameEndedPayload) => void;
  'error': (p: ErrorPayload) => void;
}

/** Client→Server typed event signatures (for `Server<...>` generics). */
export interface ClientToServerEvents {
  'room:create': (p: RoomCreatePayload) => void;
  'room:join': (p: RoomJoinPayload) => void;
  'room:list': (p: RoomListPayload) => void;
  'player:ready': (p: PlayerReadyPayload) => void;
  'host:updateSettings': (p: HostUpdateSettingsPayload) => void;
  'host:start': () => void;
  'turn:submit': (p: TurnSubmitPayload) => void;
}
