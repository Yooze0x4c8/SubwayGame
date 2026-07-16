/**
 * React bridge over the framework-agnostic game store + socket client.
 *
 * Creates the store + socket once, binds them, and exposes both via context.
 * `useGameStore(selector)` reads reactive slices; `useGameClient()` returns the
 * typed emit helpers for the UI to call.
 */

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';

import { createSocketClient, type SocketClient } from '../net/socket.js';
import { bindSocketToStore, createGameStore, type GameStore } from './gameStore.js';

interface StoreContextValue {
  store: StoreApi<GameStore>;
  client: SocketClient;
}

const StoreContext = createContext<StoreContextValue | null>(null);

/** Provider: creates + binds store and socket for the subtree. */
export function StoreProvider({
  children,
  store: injectedStore,
  client: injectedClient,
}: {
  children: ReactNode;
  /** Inject a store (tests); defaults to a fresh {@link createGameStore}. */
  store?: StoreApi<GameStore>;
  /** Inject a socket client (tests, to avoid a real connection). */
  client?: SocketClient;
}): JSX.Element {
  const ref = useRef<StoreContextValue | null>(null);
  if (ref.current === null) {
    const store = injectedStore ?? createGameStore();
    const client = injectedClient ?? createSocketClient();
    ref.current = { store, client };
  }
  const value = ref.current;

  useEffect(() => {
    // Bind BEFORE connecting so the `connect` event is never missed, then open.
    // React 18 StrictMode double-invokes this effect (mount→cleanup→mount); the
    // cleanup disconnects and the second mount reconnects, so we end connected.
    const unbind = bindSocketToStore(value.client, value.store);
    value.client.connect();
    return () => {
      unbind();
      value.client.disconnect();
    };
  }, [value]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function useCtx(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useGameStore must be used within <StoreProvider>');
  return ctx;
}

/** Read a reactive slice of the store. */
export function useGameStore<T>(selector: (s: GameStore) => T): T {
  const { store } = useCtx();
  return useStore(store, selector);
}

/** Access the typed socket emit helpers. */
export function useGameClient(): SocketClient {
  return useCtx().client;
}
