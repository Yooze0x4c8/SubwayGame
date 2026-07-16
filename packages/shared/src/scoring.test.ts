import { describe, it, expect } from 'vitest';
import { answerScore, answerScoreBreakdown, deduction, settleFail } from './scoring.js';
import { defaultBalance } from './config.js';

const cfg = defaultBalance;

// ---------------------------------------------------------------------------
// answerScore — 기획서 §4.4 worked examples
// ---------------------------------------------------------------------------
describe('answerScore', () => {
  it('강남 (2 syl, straight, ratio 0.8) → 18', () => {
    // base=10, nameBonus=0, transferBonus=0, newLineBonus=0, speedBonus=round(0.8*10)=8
    expect(answerScore({ syllables: 2, transfer: false, newLine: false, remainingRatio: 0.8 }, cfg)).toBe(18);
  });

  it('동대문역사문화공원 (9 syl, straight, ratio 0.4) → 26', () => {
    // base=10, nameBonus=(9-3)*2=12, transferBonus=0, newLineBonus=0, speedBonus=round(0.4*10)=4
    expect(answerScore({ syllables: 9, transfer: false, newLine: false, remainingRatio: 0.4 }, cfg)).toBe(26);
  });

  it('디지털미디어시티 (8 syl, transfer, newLine, ratio 0.6) → 61', () => {
    // base=10, nameBonus=(8-3)*2=10, transferBonus=15, newLineBonus=20, speedBonus=round(0.6*10)=6
    expect(answerScore({ syllables: 8, transfer: true, newLine: true, remainingRatio: 0.6 }, cfg)).toBe(61);
  });

  it('nameBonus is 0 when syllables <= 3', () => {
    const score = answerScoreBreakdown({ syllables: 3, transfer: false, newLine: false, remainingRatio: 0 }, cfg);
    expect(score.nameBonus).toBe(0);
    const score2 = answerScoreBreakdown({ syllables: 1, transfer: false, newLine: false, remainingRatio: 0 }, cfg);
    expect(score2.nameBonus).toBe(0);
  });

  it('breakdown components sum to total', () => {
    const b = answerScoreBreakdown({ syllables: 8, transfer: true, newLine: true, remainingRatio: 0.6 }, cfg);
    expect(b.base + b.nameBonus + b.transferBonus + b.newLineBonus + b.speedBonus).toBe(b.total);
    expect(b.total).toBe(61);
  });

  it('speedBonus is 0 at ratio=0 and speedBonusMax at ratio=1', () => {
    const b0 = answerScoreBreakdown({ syllables: 2, transfer: false, newLine: false, remainingRatio: 0 }, cfg);
    expect(b0.speedBonus).toBe(0);
    const b1 = answerScoreBreakdown({ syllables: 2, transfer: false, newLine: false, remainingRatio: 1 }, cfg);
    expect(b1.speedBonus).toBe(cfg.scoring.speedBonusMax);
  });

  it('transferBonus only applied when transfer=true', () => {
    const withTransfer = answerScoreBreakdown({ syllables: 2, transfer: true, newLine: false, remainingRatio: 0 }, cfg);
    const noTransfer  = answerScoreBreakdown({ syllables: 2, transfer: false, newLine: false, remainingRatio: 0 }, cfg);
    expect(withTransfer.transferBonus).toBe(cfg.scoring.transferBonus);
    expect(noTransfer.transferBonus).toBe(0);
  });

  it('newLineBonus only applied when newLine=true', () => {
    const withNew = answerScoreBreakdown({ syllables: 2, transfer: false, newLine: true, remainingRatio: 0 }, cfg);
    const noNew   = answerScoreBreakdown({ syllables: 2, transfer: false, newLine: false, remainingRatio: 0 }, cfg);
    expect(withNew.newLineBonus).toBe(cfg.scoring.newLineBonus);
    expect(noNew.newLineBonus).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// deduction — §8 exact numbers
// ---------------------------------------------------------------------------
describe('deduction', () => {
  // §8 acceptance criteria
  it('120s → 48 (120*0.4=48)', () => expect(deduction(120, cfg)).toBe(48));
  it('72s  → 29 (72*0.4=28.8 → round=29)', () => expect(deduction(72, cfg)).toBe(29));
  it('43s  → 17 (43*0.4=17.2 → round=17)', () => expect(deduction(43, cfg)).toBe(17));
  it('25s  → 10 (25*0.4=10.0, clamp floor=10)', () => expect(deduction(25, cfg)).toBe(10));

  it('very small remaining → clamped to deductMin (10)', () => {
    expect(deduction(0, cfg)).toBe(cfg.fail.deductMin);
    expect(deduction(1, cfg)).toBe(cfg.fail.deductMin);
  });

  it('very large remaining → clamped to deductMax (50)', () => {
    expect(deduction(1000, cfg)).toBe(cfg.fail.deductMax);
    expect(deduction(200, cfg)).toBe(cfg.fail.deductMax);
  });
});

// ---------------------------------------------------------------------------
// settleFail — role deltas, no round multiplier
// ---------------------------------------------------------------------------
describe('settleFail', () => {
  it('failer gets -D, last answerer gets +20, others get +5 (120s remaining)', () => {
    const s = settleFail(120, cfg);
    expect(s.D).toBe(48);
    expect(s.failerDelta).toBe(-48);
    expect(s.lastAnswererDelta).toBe(cfg.fail.finisherBonus); // 20
    expect(s.othersDelta).toBe(cfg.fail.othersBonus);         // 5
  });

  it('failer gets -10 (clamped floor) at small remaining', () => {
    const s = settleFail(0, cfg);
    expect(s.D).toBe(10);
    expect(s.failerDelta).toBe(-10);
  });

  it('failer gets -50 (clamped ceil) at large remaining', () => {
    const s = settleFail(1000, cfg);
    expect(s.D).toBe(50);
    expect(s.failerDelta).toBe(-50);
  });

  it('no multiplier regardless of round index — settlement is same at any round', () => {
    // Plan §11: lastRound multiplier removed; all round indices produce same result
    const sRound1 = settleFail(72, cfg);
    const sRound9 = settleFail(72, cfg); // same input, same output — no round param
    expect(sRound1).toEqual(sRound9);
    expect(sRound1.lastAnswererDelta).toBe(20);
    expect(sRound1.othersDelta).toBe(5);
  });
});
