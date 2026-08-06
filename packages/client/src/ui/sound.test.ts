/**
 * Syllable-run shape. Web Audio does not exist in the test environment, so the
 * scheduling calls are no-ops; what is worth pinning is that the run never goes
 * dissonant or runaway for any name length in the data (2 to 10 syllables).
 */

import { describe, it, expect } from 'vitest';

import {
  IMPACT_NOTES,
  hammerCount,
  noteCount,
  playAccepted,
  playError,
  playSyllables,
} from './sound.js';

describe('noteCount', () => {
  it('counts the parenthetical, unlike the syllable count used for scoring', () => {
    // 이수 scores as 2 syllables; the plate reads 7, and that is what plays.
    expect(noteCount('이수(총신대입구)')).toBe(7);
    expect(noteCount('시청')).toBe(2);
    expect(noteCount('동대문역사문화공원(DDP)')).toBe(12);
  });

  it('ignores punctuation and spacing', () => {
    expect(noteCount('수원역 (분당)')).toBe(5);
    expect(noteCount('4·19민주묘지')).toBe(7);
  });
});

describe('sound', () => {
  it('survives every name length in the data without a Web Audio context', () => {
    // Display names span 2..14 notes; 0 and absurd values must not throw.
    for (const n of [0, 1, 2, 3, 7, 14, 99]) {
      expect(() => playSyllables(n)).not.toThrow();
      expect(() => playAccepted(n)).not.toThrow();
      expect(() => playAccepted(n, true)).not.toThrow();
    }
    expect(() => playError()).not.toThrow();
  });

  it('reserves the impact for the rare long names', () => {
    // 7+ is the top 9.1% of stations once parentheses count. At 6 it would fire
    // on 12.4% of answers and stop meaning anything.
    expect(IMPACT_NOTES).toBe(7);
  });
});

describe('hammerCount', () => {
  it('stays silent below the threshold', () => {
    for (const n of [1, 2, 5, 6]) expect(hammerCount(n)).toBe(0);
  });

  it('adds one blow per note past the threshold, so long names escalate', () => {
    expect(hammerCount(7)).toBe(1);
    expect(hammerCount(8)).toBe(2);
    expect(hammerCount(9)).toBe(3);
    expect(hammerCount(14)).toBe(8); // the single longest name in the data
  });
});
