import { describe, it, expect } from 'vitest';
import { turnLimit, turnLimitMs } from './timer.js';
import { defaultBalance } from './config.js';

const cfg = defaultBalance; // T0=20, r=0.96, Tmin=5

describe('turnLimit', () => {
  // §8 binding acceptance criteria
  it('n=0  → 20s', () => expect(turnLimit(0, cfg)).toBe(20));
  it('n=10 → 13s', () => expect(turnLimit(10, cfg)).toBe(13));
  it('n=20 → 9s',  () => expect(turnLimit(20, cfg)).toBe(9));
  it('n=30 → 6s', () => expect(turnLimit(30, cfg)).toBe(6));

  // Additional curve points from 기획서 §3
  it('n=5  → 16s', () => expect(turnLimit(5, cfg)).toBe(16));
  it('n=15 → 11s', () => expect(turnLimit(15, cfg)).toBe(11));
  it('n=40 → 5s (Tmin floor, large n)', () => expect(turnLimit(40, cfg)).toBe(5));

  it('Tmin floor: very large n never goes below Tmin', () => {
    expect(turnLimit(100, cfg)).toBe(cfg.Tmin);
    expect(turnLimit(200, cfg)).toBe(cfg.Tmin);
  });
});

describe('turnLimitMs', () => {
  it('returns turnLimit * 1000', () => {
    expect(turnLimitMs(0, cfg)).toBe(20000);
    expect(turnLimitMs(10, cfg)).toBe(13000);
    expect(turnLimitMs(20, cfg)).toBe(9000);
    expect(turnLimitMs(30, cfg)).toBe(6000);
  });
});
