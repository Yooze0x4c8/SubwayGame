import { describe, it, expect } from 'vitest';

import { loadStationIndex, parseCsv, popcount, normalizeNameKey } from './loader.js';

// Resolves the real repo `data/` via import.meta walk-up.
const index = loadStationIndex();

// Line slugs used below (verified against data/station_lines.csv):
//   강남 capital_0162: seoul_2, sinbundang
//   판교 capital_0758: gyeonggang, sinbundang
//   사당 capital_0417: seoul_2, seoul_4
//   신촌 split: capital_0549 (seoul_2) | capital_0550 (gyeongui)
//   양평 split: capital_0585 (seoul_5) | capital_0586 (gyeongui)
//   좌천 split: busan_0128 (busan_1)  | busan_0129 (donghae)

describe('parseCsv (RFC4180)', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('parses quoted fields containing commas', () => {
    expect(parseCsv('id,name\n1,"foo,bar"\n')).toEqual([
      ['id', 'name'],
      ['1', 'foo,bar'],
    ]);
  });

  it('parses embedded escaped quotes', () => {
    expect(parseCsv('a\n"he said ""hi"""\n')).toEqual([['a'], ['he said "hi"']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('popcount', () => {
  it('counts set bits', () => {
    expect(popcount(0n)).toBe(0);
    expect(popcount(0b1011n)).toBe(3);
    expect(popcount(1n << 40n)).toBe(1);
  });
});

describe('normalizeNameKey', () => {
  it('strips trailing 역 when remainder length > 2', () => {
    expect(normalizeNameKey('강남역')).toBe('강남');
    expect(normalizeNameKey('강남역')).toBe(normalizeNameKey('강남'));
  });

  it('keeps 역 when remainder would be too short', () => {
    // '서울역' → norm '서울역' → strip trailing → '서울' (len 2 remainder ok, >2 check on pre-strip len 3)
    expect(normalizeNameKey('서울역')).toBe('서울');
  });

  it('strips parenthetical qualifiers and separators', () => {
    expect(normalizeNameKey('신촌(지하)')).toBe('신촌');
    expect(normalizeNameKey('디지털 미디어 시티')).toBe('디지털미디어시티');
  });
});

describe('loadStationIndex — determinism', () => {
  it('yields identical lineBit/stationIdx across two loads', () => {
    const a = loadStationIndex();
    const b = loadStationIndex();
    expect([...a.lineBit.entries()]).toEqual([...b.lineBit.entries()]);
    expect([...a.stationIdx.entries()]).toEqual([...b.stationIdx.entries()]);
  });

  it('assigns line bits in sorted line_id order', () => {
    const ids = [...index.lineBit.keys()];
    const sorted = [...ids].sort();
    // bit values follow sorted order
    for (let i = 0; i < sorted.length; i++) {
      expect(index.lineBit.get(sorted[i]!)).toBe(i);
    }
  });

  it('maps every line bit to its CSV difficulty tier', () => {
    expect(index.lineTierByBit.size).toBe(index.lineBit.size);
    expect(index.lineTierByBit.get(index.lineBit.get('seoul_2')!)).toBe('intro');
    expect(index.lineTierByBit.get(index.lineBit.get('gyeongui')!)).toBe('normal');
    expect(index.lineTierByBit.get(index.lineBit.get('sillim')!)).toBe('hardcore');
  });
});

describe('loadStationIndex — lineMask / is_transfer integrity', () => {
  it('popcount(lineMask) matches is_transfer column (spot-check transfer + non-transfer)', () => {
    const gangnam = index.byId(index.stationIdx.get('capital_0162')!);
    expect(gangnam.isTransfer).toBe(true);
    expect(popcount(gangnam.lineMask)).toBe(2);

    const gaya = index.byId(index.stationIdx.get('busan_0001')!);
    expect(gaya.isTransfer).toBe(false);
    expect(popcount(gaya.lineMask)).toBe(1);
  });

  it('every record: (popcount(lineMask) > 1) === isTransfer', () => {
    for (const rec of index.records) {
      expect(rec.isTransfer).toBe(popcount(rec.lineMask) > 1);
    }
  });
});

describe('loadStationIndex — homonym splits (byName)', () => {
  const splitCases: Array<[string, string]> = [
    ['신촌', 'capital'],
    ['양평', 'capital'],
    ['좌천', 'busan'],
  ];

  for (const [name] of splitCases) {
    it(`${name}: byName returns >=2 distinct idxs with DIFFERENT lineMasks`, () => {
      const idxs = index.byName.get(normalizeNameKey(name));
      expect(idxs).toBeDefined();
      expect(idxs!.length).toBeGreaterThanOrEqual(2);
      const masks = idxs!.map((i) => index.byId(i).lineMask);
      // all distinct idxs
      expect(new Set(idxs!).size).toBe(idxs!.length);
      // at least two of the masks differ
      expect(new Set(masks.map(String)).size).toBeGreaterThanOrEqual(2);
    });
  }
});

describe('loadStationIndex — aliases and audited service mappings', () => {
  const lineIdsFor = (stationName: string): Set<string> => {
    const idxs = index.byName
      .get(normalizeNameKey(stationName))
      ?.filter((idx) => index.byId(idx).region === 'capital');
    expect(idxs).toBeDefined();
    expect(idxs).toHaveLength(1);
    const mask = index.byId(idxs![0]!).lineMask;
    return new Set(
      [...index.lineBit.entries()]
        .filter(([, bit]) => (mask & (1n << BigInt(bit))) !== 0n)
        .map(([lineId]) => lineId),
    );
  };

  it('resolves the former 신길온천 name to 능길', () => {
    const current = index.byName.get(normalizeNameKey('능길'));
    const former = index.byName.get(normalizeNameKey('신길온천'));
    expect(former).toEqual(current);
    expect(index.byId(former![0]!).name).toBe('능길');
  });

  it('treats 이수 and 총신대입구 as one physical transfer station', () => {
    expect(index.byName.get(normalizeNameKey('총신대입구'))).toEqual(
      index.byName.get(normalizeNameKey('이수')),
    );
    expect(lineIdsFor('이수')).toEqual(new Set(['seoul_4', 'seoul_7']));
  });

  it('includes every operating service at 청량리 and 회기', () => {
    expect(lineIdsFor('청량리')).toEqual(
      new Set(['gyeongchun', 'gyeongui', 'seoul_1', 'suinbundang']),
    );
    expect(lineIdsFor('회기')).toEqual(
      new Set(['gyeongchun', 'gyeongui', 'seoul_1']),
    );
  });

  it('includes all nine currently operating GTX-A stations', () => {
    expect(index.lineBit.has('gtx_a')).toBe(true);
    for (const name of [
      '운정중앙',
      '킨텍스',
      '대곡',
      '연신내',
      '서울역',
      '수서',
      '성남',
      '구성',
      '동탄',
    ]) {
      expect(lineIdsFor(name)).toContain('gtx_a');
    }
  });
});

describe('loadStationIndex — CSV aggregate integrity', () => {
  it('matches every lines.csv station_count to its station mappings', () => {
    const counts = new Map<string, number>();
    for (const record of index.records) {
      for (const [lineId, bit] of index.lineBit) {
        if ((record.lineMask & (1n << BigInt(bit))) !== 0n) {
          counts.set(lineId, (counts.get(lineId) ?? 0) + 1);
        }
      }
    }

    expect(counts.get('seoul_4')).toBe(51);
    expect(counts.get('seoul_7')).toBe(53);
    expect(counts.get('gyeongchun')).toBe(25);
    expect(counts.get('suinbundang')).toBe(63);
    expect(counts.get('gtx_a')).toBe(9);
  });
});

describe('loadStationIndex — startable pool', () => {
  it('daejeon region has exactly ONE startable line (daejeon_1)', () => {
    // Build the startable line pool from every record's startableLines, filtered
    // to the daejeon region.
    const startableBits = new Set<number>();
    for (const rec of index.records) {
      if (rec.region !== 'daejeon') continue;
      let m = rec.startableLines;
      let bit = 0;
      while (m > 0n) {
        if ((m & 1n) === 1n) startableBits.add(bit);
        m >>= 1n;
        bit += 1;
      }
    }
    expect(startableBits.size).toBe(1);
    const [only] = [...startableBits];
    expect(index.lineBit.get('daejeon_1')).toBe(only);
  });
});
