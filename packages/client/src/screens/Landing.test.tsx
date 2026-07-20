/**
 * Landing regression test (jsdom): renders the STORE-CONNECTED screen through a
 * real StoreProvider + zustand store. This exercises the `useGameStore` hook
 * path — the seam that the InGameView prop-only smoke test does not cover.
 *
 * Guards the zustand-v5 pitfall: a selector returning a fresh object each render
 * has no default shallow compare, so getSnapshot is never stable and React loops
 * to "Maximum update depth exceeded" (blank page). If Landing regresses to an
 * object-returning selector, this render throws and the test fails.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';

import { StoreProvider } from '../state/StoreProvider.js';
import { createGameStore } from '../state/gameStore.js';
import type { SocketClient } from '../net/socket.js';
import { Landing } from './Landing.js';

afterEach(() => cleanup());

/** A no-op socket client so the test never opens a real connection. */
function fakeClient(): SocketClient {
  const noop = (): void => {};
  // bindSocketToStore subscribes via client.socket.on(...) directly.
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

function renderLanding() {
  return render(
    <StoreProvider store={createGameStore()} client={fakeClient()}>
      <Landing />
    </StoreProvider>,
  );
}

describe('Landing (store-connected)', () => {
  it('renders without an infinite render loop', () => {
    renderLanding();
    expect(screen.getByTestId('nickname-input')).toBeTruthy();
  });

  it('enables 방 찾기/만들기 only once a nickname is entered', () => {
    renderLanding();
    // The browse button is disabled until a nickname is typed
    const btn = screen.getByRole('button', { name: /방 찾기/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('nickname-input'), { target: { value: '태경' } });
    expect(btn.disabled).toBe(false);
  });

  it('opens the game guide with rules and scoring, then closes it', () => {
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: /게임 설명/ }));

    const dialog = screen.getByRole('dialog', { name: '게임 설명' });
    expect(within(dialog).getByText('게임 진행')).toBeTruthy();
    expect(within(dialog).getByText('정답 점수')).toBeTruthy();
    expect(within(dialog).getByText('시간 초과 정산')).toBeTruthy();
    expect(within(dialog).getByText('+15')).toBeTruthy();
    expect(within(dialog).getByText('+20')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: '확인' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
