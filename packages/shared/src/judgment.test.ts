import { describe, it, expect } from 'vitest';

import { judge, normalizeNameKey } from './judgment.js';
import type { StationIndex, StationRecord } from './types.js';

/**
 * Hand-built in-memory StationIndex fixture. Kept in `shared` (no server dep)
 * so the pure judgment core is tested in isolation. Line bits and station
 * indices mirror the real data's structure for the acceptance cases; the actual
 * loader determinism/data integrity is covered by the server loader tests.
 *
 * Line bits (arbitrary but fixed here):
 *   seoul_2=0, seoul_4=1, seoul_5=2, seoul_6=3,
 *   gyeongui=4, arex=5, gyeonggang=6, sinbundang=7
 */
const L = {
  seoul_2: 1n << 0n,
  seoul_4: 1n << 1n,
  seoul_5: 1n << 2n,
  seoul_6: 1n << 3n,
  gyeongui: 1n << 4n,
  arex: 1n << 5n,
  gyeonggang: 1n << 6n,
  sinbundang: 1n << 7n,
} as const;

function rec(idx: number, name: string, lineMask: bigint): StationRecord {
  return {
    idx,
    id: `fix_${idx}`,
    name,
    displayName: name,
    region: 'capital',
    lineMask,
    syllables: 2,
    isTransfer: false,
    startableLines: 0n,
  };
}

// Real line memberships (from data/station_lines.csv):
//   강남:  seoul_2, sinbundang
//   판교:  gyeonggang, sinbundang
//   사당:  seoul_2, seoul_4
//   홍대입구: arex, gyeongui, seoul_2
//   DMC:  arex, gyeongui, seoul_6
//   공덕:  arex, gyeongui, seoul_5, seoul_6
//   합정:  seoul_2, seoul_6
//   신촌 split A: seoul_2 | split B: gyeongui
const records: StationRecord[] = [
  rec(0, '강남', L.seoul_2 | L.sinbundang),
  rec(1, '판교', L.gyeonggang | L.sinbundang),
  rec(2, '사당', L.seoul_2 | L.seoul_4),
  rec(3, '홍대입구', L.arex | L.gyeongui | L.seoul_2),
  rec(4, '디지털미디어시티', L.arex | L.gyeongui | L.seoul_6),
  rec(5, '공덕', L.arex | L.gyeongui | L.seoul_5 | L.seoul_6),
  rec(6, '합정', L.seoul_2 | L.seoul_6),
  rec(7, '신촌', L.seoul_2), // split A
  rec(8, '신촌', L.gyeongui), // split B
];

const byName = new Map<string, number[]>();
for (const r of records) {
  const key = normalizeNameKey(r.name);
  const bucket = byName.get(key);
  if (bucket === undefined) byName.set(key, [r.idx]);
  else bucket.push(r.idx);
}

const index: StationIndex = {
  lineBit: new Map(Object.entries(L).map(([id], i) => [id, i])),
  stationIdx: new Map(records.map((r) => [r.id, r.idx])),
  byId: (idx) => {
    const r = records[idx];
    if (r === undefined) throw new Error(`fixture byId out of range: ${idx}`);
    return r;
  },
  byName,
  records,
};

const IDX = {
  gangnam: 0,
  pangyo: 1,
  sadang: 2,
  hongdae: 3,
  dmc: 4,
  gongdeok: 5,
  hapjeong: 6,
  sinchonA: 7, // seoul_2
  sinchonB: 8, // gyeongui
};

describe('judge — notFound', () => {
  it('returns notFound for an unknown name', () => {
    const r = judge({
      index,
      currentIdx: IDX.gangnam,
      activeMask: L.seoul_2,
      used: new Set(),
      text: '없는역',
    });
    expect(r).toEqual({ valid: false, reason: 'notFound' });
  });
});

describe('judge — 강남 with active {seoul_2}', () => {
  it('→판교 ⇒ valid, transfer=true (via sinbundang)', () => {
    const r = judge({
      index,
      currentIdx: IDX.gangnam,
      activeMask: L.seoul_2,
      used: new Set(),
      text: '판교',
    });
    expect(r.valid).toBe(true);
    expect(r.transfer).toBe(true);
    expect(r.stationIdx).toBe(IDX.pangyo);
    expect(r.newActiveMask).toBe(L.sinbundang);
  });

  it('→사당 ⇒ valid, transfer=false (straight on seoul_2)', () => {
    const r = judge({
      index,
      currentIdx: IDX.gangnam,
      activeMask: L.seoul_2,
      used: new Set(),
      text: '사당',
    });
    expect(r.valid).toBe(true);
    expect(r.transfer).toBe(false);
    expect(r.stationIdx).toBe(IDX.sadang);
    expect(r.newActiveMask).toBe(L.seoul_2);
  });
});

describe('judge — lineMismatch', () => {
  it('current=홍대입구, →판교 ⇒ invalid lineMismatch', () => {
    // 홍대입구 lines: arex/gyeongui/seoul_2 ; 판교: gyeonggang/sinbundang → no overlap.
    const r = judge({
      index,
      currentIdx: IDX.hongdae,
      activeMask: L.seoul_2,
      used: new Set(),
      text: '판교',
    });
    expect(r).toEqual({ valid: false, reason: 'lineMismatch' });
  });
});

describe('judge — DMC with active {gyeongui, arex}', () => {
  const activeMask = L.gyeongui | L.arex;

  it('→공덕 ⇒ valid straight, A preserved (gyeongui|arex)', () => {
    const r = judge({ index, currentIdx: IDX.dmc, activeMask, used: new Set(), text: '공덕' });
    expect(r.valid).toBe(true);
    expect(r.transfer).toBe(false);
    expect(r.stationIdx).toBe(IDX.gongdeok);
    expect(r.newActiveMask).toBe(L.gyeongui | L.arex);
  });

  it('→합정 ⇒ valid transfer, A' + "' = {seoul_6}", () => {
    // 합정: seoul_2/seoul_6. active(gyeongui|arex)∩합정 = 0 → not straight.
    // DMC lines(arex/gyeongui/seoul_6) ∩ 합정 = seoul_6 → transfer.
    const r = judge({ index, currentIdx: IDX.dmc, activeMask, used: new Set(), text: '합정' });
    expect(r.valid).toBe(true);
    expect(r.transfer).toBe(true);
    expect(r.stationIdx).toBe(IDX.hapjeong);
    expect(r.newActiveMask).toBe(L.seoul_6);
  });
});

describe('judge — duplicate', () => {
  it('사당 judged again after its idx is in used ⇒ reason=duplicate', () => {
    const used = new Set<number>([IDX.sadang]);
    const r = judge({
      index,
      currentIdx: IDX.gangnam,
      activeMask: L.seoul_2,
      used,
      text: '사당',
    });
    expect(r).toEqual({ valid: false, reason: 'duplicate' });
  });
});

describe('judge — split homonyms are not cross-marked', () => {
  it('marking 신촌 split A used does NOT make split B a duplicate', () => {
    // used contains only 신촌(seoul_2)=sinchonA. Approach the other 신촌
    // (gyeongui=sinchonB) from a gyeongui-reachable state.
    const used = new Set<number>([IDX.sinchonA]);

    // From 공덕 (has gyeongui) with active {gyeongui}: 신촌 → resolves to
    // sinchonB (gyeongui), straight, and is NOT a duplicate.
    const r = judge({
      index,
      currentIdx: IDX.gongdeok,
      activeMask: L.gyeongui,
      used,
      text: '신촌',
    });
    expect(r.valid).toBe(true);
    expect(r.stationIdx).toBe(IDX.sinchonB);
    expect(r.transfer).toBe(false);
    expect(r.newActiveMask).toBe(L.gyeongui);
  });

  it('sanity: 신촌 with active {seoul_2} resolves to split A', () => {
    const r = judge({
      index,
      currentIdx: IDX.gangnam,
      activeMask: L.seoul_2,
      used: new Set(),
      text: '신촌',
    });
    expect(r.valid).toBe(true);
    expect(r.stationIdx).toBe(IDX.sinchonA);
    expect(r.newActiveMask).toBe(L.seoul_2);
  });
});
