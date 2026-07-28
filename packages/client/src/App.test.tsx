import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import { AnswerFlashGate } from './App.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AnswerFlashGate', () => {
  it('keeps the station view visible for one second before continuing', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();

    render(
      <AnswerFlashGate flashId={1} onDone={onDone}>
        <div>상단 역명판</div>
      </AnswerFlashGate>,
    );

    expect(screen.getByText('상단 역명판')).toBeTruthy();
    act(() => vi.advanceTimersByTime(999));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
