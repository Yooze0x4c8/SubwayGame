/**
 * Typed Socket.IO client for the SUBWAY web client.
 *
 * One source of truth for the wire format: the generics come straight from
 * `@subway/shared` so emits/handlers match the server exactly. The transport is
 * intentionally dumb — it owns the connection + session token and exposes typed
 * emit helpers plus an `on()` subscription surface. All game-state derivation
 * lives in the store; this layer never interprets payloads.
 *
 * The server is authoritative. On `session` we persist the token (localStorage
 * when available) and resend it via `auth:{ token }` on (re)connect so the
 * server auto-rejoins us and replays `room:state`.
 */

import { io, type Socket } from 'socket.io-client';

import {
  ClientEvents,
  ServerEvents,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type RoomCreatePayload,
  type RoomJoinPayload,
  type RoomListPayload,
  type Settings,
} from '@subway/shared';

/** Our typed client socket (server↔client generics swapped vs. the server). */
export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const TOKEN_KEY = 'subway.session.token';

/** Read the persisted session token (safe when sessionStorage is unavailable). */
function readToken(): string | undefined {
  try {
    return globalThis.sessionStorage?.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Persist the session token (no-op when sessionStorage is unavailable). */
function writeToken(token: string): void {
  try {
    globalThis.sessionStorage?.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore — non-browser env */
  }
}

/** Options for {@link createSocketClient}. */
export interface SocketClientOptions {
  /** Server URL; defaults to `VITE_SERVER_URL` then `http://localhost:3000`. */
  url?: string;
  /** Override the reconnect token (tests). Defaults to the persisted token. */
  token?: string;
  /**
   * Token persistence hook (tests inject an in-memory store). Defaults to
   * localStorage read/write.
   */
  tokenStore?: { read: () => string | undefined; write: (t: string) => void };
  /** Extra socket.io-client options (tests force websocket transport). */
  ioOptions?: Parameters<typeof io>[1];
}

/**
 * The transport handle the store consumes: typed emit helpers + an `on`/`off`
 * subscription surface + connection lifecycle.
 */
export interface SocketClient {
  readonly socket: ClientSocket;
  /** Subscribe to a server event; returns an unsubscribe fn. */
  on<E extends keyof ServerToClientEvents>(
    event: E,
    handler: ServerToClientEvents[E],
  ): () => void;
  /** The current session token, once received (undefined before `session`). */
  getToken(): string | undefined;
  /** (Re)open the connection. Idempotent when already connected/connecting. */
  connect(): void;
  createRoom(nickname: string, settings?: Partial<Settings>): void;
  joinRoom(args: { code?: string; roomId?: string; nickname: string; password?: string; isSpectator?: boolean }): void;
  listRooms(filter?: RoomListPayload['filter']): void;
  setReady(ready: boolean): void;
  updateSettings(settings: Partial<Settings>): void;
  startGame(): void;
  resetRoom(): void;
  submitTurn(text: string): void;
  /** Switch from seated player to spectator (lobby only). */
  becomeSpectator(): void;
  /** Switch from spectator to seated player (lobby only, if room not full). */
  becomePlayer(): void;
  /** Leave the current room: clears the session token so reconnect starts fresh. */
  leaveRoom(): void;
  disconnect(): void;
}

// Production single-service: same-origin socket. Dev: localhost:3000 (Vite proxy).
const DEFAULT_URL =
  typeof import.meta !== 'undefined' && import.meta.env?.PROD === true
    ? typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3000'
    : 'http://localhost:3000';

/** Resolve the server URL from options → Vite env → localhost default. */
function resolveUrl(url: string | undefined): string {
  if (url) return url;
  const envUrl =
    typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SERVER_URL : undefined;
  return envUrl ?? DEFAULT_URL;
}

/**
 * Create a connected, typed socket client. Persists the session token on the
 * `session` event and resends it as `auth.token` on reconnects.
 */
export function createSocketClient(opts: SocketClientOptions = {}): SocketClient {
  const url = resolveUrl(opts.url);
  const store = opts.tokenStore ?? { read: readToken, write: writeToken };
  const initialToken = opts.token ?? store.read();

  const socket: ClientSocket = io(url, {
    transports: ['websocket'],
    autoConnect: false,
    ...opts.ioOptions,
    auth: initialToken ? { token: initialToken } : {},
  });

  let token: string | undefined = initialToken;

  // Persist the server-issued token and thread it into future reconnects.
  socket.on(ServerEvents.session, (p) => {
    token = p.token;
    store.write(p.token);
    // Ensure a dropped-then-reconnected socket presents the same token.
    socket.auth = { token: p.token };
  });

  const on: SocketClient['on'] = (event, handler) => {
    // socket.io-client's typed `on` is invariant here; the generics already
    // guarantee handler shape, so the cast is safe and localized.
    socket.on(event, handler as never);
    return () => {
      socket.off(event, handler as never);
    };
  };

  const createRoom: SocketClient['createRoom'] = (nickname, settings) => {
    const payload: RoomCreatePayload = { nickname };
    if (settings) payload.settings = settings;
    if (token) payload.token = token;
    socket.emit(ClientEvents.roomCreate, payload);
  };

  const joinRoom: SocketClient['joinRoom'] = ({ code, roomId, nickname, password, isSpectator }) => {
    const payload: RoomJoinPayload = { nickname };
    if (code !== undefined) payload.code = code;
    if (roomId !== undefined) payload.roomId = roomId;
    if (password !== undefined) payload.password = password;
    if (isSpectator) payload.isSpectator = true;
    if (token) payload.token = token;
    socket.emit(ClientEvents.roomJoin, payload);
  };

  return {
    socket,
    on,
    getToken: () => token,
    connect: () => {
      socket.connect();
    },
    createRoom,
    joinRoom,
    listRooms: (filter) => socket.emit(ClientEvents.roomList, filter ? { filter } : {}),
    setReady: (ready) => socket.emit(ClientEvents.playerReady, { ready }),
    updateSettings: (settings) => socket.emit(ClientEvents.hostUpdateSettings, { settings }),
    startGame: () => socket.emit(ClientEvents.hostStart),
    resetRoom: () => socket.emit(ClientEvents.hostReset),
    submitTurn: (text) => socket.emit(ClientEvents.turnSubmit, { text }),
    becomeSpectator: () => socket.emit(ClientEvents.playerSpectate),
    becomePlayer: () => socket.emit(ClientEvents.spectatorPlay),
    leaveRoom: () => {
      // Clear stored token so the next connect doesn't auto-rejoin the same room.
      store.write('');
      socket.auth = {};
      socket.disconnect();
      socket.connect();
    },
    disconnect: () => socket.disconnect(),
  };
}
