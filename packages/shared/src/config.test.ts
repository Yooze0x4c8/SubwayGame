import { describe, it, expect } from 'vitest';
import { loadBalance, defaultBalance, BalanceValidationError } from './config.js';

describe('loadBalance', () => {
  it('returns defaults when no overrides are given', () => {
    expect(loadBalance()).toEqual(defaultBalance);
  });

  it('mirrors config/balance.json defaults', () => {
    const b = loadBalance();
    expect(b.R0).toBe(120);
    expect(b.T0).toBe(15);
    expect(b.r).toBe(0.96);
    expect(b.Tmin).toBe(5);
    expect(b.scoring.transferBonus).toBe(15);
    expect(b.fail.deductCoef).toBe(0.4);
    expect(b.roomDefaults.roundsOptions).toEqual([3, 5, 7]);
    expect(b.disconnectGraceMs).toBe(30000);
  });

  it('deep-merges partial overrides', () => {
    const b = loadBalance({ T0: 20, scoring: { transferBonus: 99 } });
    expect(b.T0).toBe(20);
    expect(b.scoring.transferBonus).toBe(99);
    // untouched sibling keeps default
    expect(b.scoring.base).toBe(defaultBalance.scoring.base);
  });

  it('rejects an out-of-range decay factor', () => {
    expect(() => loadBalance({ r: 1.5 })).toThrow(BalanceValidationError);
  });

  it('rejects deductMin greater than deductMax', () => {
    expect(() => loadBalance({ fail: { deductMin: 100, deductMax: 10 } })).toThrow(
      BalanceValidationError,
    );
  });
});
