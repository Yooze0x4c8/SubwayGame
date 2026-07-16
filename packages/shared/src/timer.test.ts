import { describe, it, expect } from 'vitest';
import { turnLimit, turnLimitMs } from './timer.js';
import { defaultBalance } from './config.js';

const cfg = defaultBalance; // T0=15, r=0.96, Tmin=5

describe('turnLimit', () => {
  // §8 binding acceptance criteria
  it('n=0  → 15s', () => expect(turnLimit(0, cfg)).toBe(15));
  it('n=10 → 10s', () => expect(turnLimit(10, cfg)).toBe(10));
  it('n=20 → 7s',  () => expect(turnLimit(20, cfg)).toBe(7));
  it('n=30 → 5s (Tmin floor)', () => expect(turnLimit(30, cfg)).toBe(5));

  // Additional curve points from 기획서 §3
  it('n=5  → 12s', () => expect(turnLimit(5, cfg)).toBe(12));
  it('n=15 → 8s',  () => expect(turnLimit(15, cfg)).toBe(8));
  it('n=40 → 5s (Tmin floor, large n)', () => expect(turnLimit(40, cfg)).toBe(5));

  it('Tmin floor: very large n never goes below Tmin', () => {
    expect(turnLimit(100, cfg)).toBe(cfg.Tmin);
    expect(turnLimit(200, cfg)).toBe(cfg.Tmin);
  });
});

describe('turnLimitMs', () => {
  it('returns turnLimit * 1000', () => {
    expect(turnLimitMs(0, cfg)).toBe(15000);
    expect(turnLimitMs(10, cfg)).toBe(10000);
    expect(turnLimitMs(20, cfg)).toBe(7000);
    expect(turnLimitMs(30, cfg)).toBe(5000);
  });
});
