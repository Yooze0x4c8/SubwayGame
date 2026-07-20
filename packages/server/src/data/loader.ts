/**
 * CSV → in-memory `StationIndex` loader (plan §5.1).
 *
 * Boots once, deterministic (fixed input CSVs → fixed bit/index assignments),
 * and is the *only* place station data I/O happens. It is the single adapter
 * between the string-slug CSV data and the integer/bitmask judgment core
 * (review B2). Slug↔bit interning is owned here; consumers use integers only.
 *
 * Determinism contract: `lineBit` is assigned by sorted `line_id`, `stationIdx`
 * by sorted `station_id`. Loading twice yields identical assignments.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type { LineTier, StationIndex, StationRecord } from '@subway/shared';

const LINE_TIERS = new Set<LineTier>(['intro', 'normal', 'hardcore']);

/**
 * Parse a single CSV document per RFC 4180: comma-separated, `"`-quoted fields
 * with `""` as an embedded quote, quoted fields may contain commas and newlines.
 * Returns an array of rows, each an array of string cells. Trailing empty line
 * is ignored. Handles both `\n` and `\r\n` line endings.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      endField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      // Swallow CR; the following LF (if any) ends the row.
      if (i + 1 < n && text[i + 1] === '\n') {
        endRow();
        i += 2;
        continue;
      }
      endRow();
      i += 1;
      continue;
    }
    if (ch === '\n') {
      endRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // Flush the final field/row unless the document ended on a clean newline.
  if (field.length > 0 || row.length > 0) {
    endRow();
  }
  return rows;
}

/**
 * Parse a CSV document into an array of records keyed by the header row.
 * Blank rows (a single empty cell) are skipped.
 */
function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0]!;
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    if (cells.length === 1 && cells[0] === '') continue;
    const rec: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      rec[header[c]!] = cells[c] ?? '';
    }
    out.push(rec);
  }
  return out;
}

/** Count set bits in a bigint (non-negative). */
export function popcount(mask: bigint): number {
  let m = mask;
  let count = 0;
  while (m > 0n) {
    m &= m - 1n;
    count += 1;
  }
  return count;
}

/**
 * Replicates `build.py`'s `match_key(strip_paren(NFC(text)))`, mapping raw user
 * input to the `name_key` the build pipeline wrote into `stations.csv`.
 *
 * (Re-exported for callers that only import the loader; the same logic also
 * lives in `@subway/shared` `judgment.ts` for the pure judgment core.)
 */
export function normalizeNameKey(text: string): string {
  const nfc = text.normalize('NFC');
  const stripped = nfc.replace(/\s*\(.*?\)\s*/g, '').trim();
  const normed = stripped.replace(/[\s·.\-]/g, '');
  if (normed.endsWith('역') && normed.length > 2) {
    return normed.slice(0, -1);
  }
  return normed;
}

/**
 * Resolve the repository `data/` directory by walking up from this module until
 * a directory containing `data/stations.csv` is found. Works whether running
 * from TS source (vitest) or compiled `dist/`.
 */
function resolveDefaultDataDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  // Walk up a bounded number of levels looking for the data marker.
  for (let depth = 0; depth < 12; depth++) {
    const candidate = join(dir, 'data', 'stations.csv');
    try {
      readFileSync(candidate);
      return join(dir, 'data');
    } catch {
      // not here; go up one level
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'loader: could not locate data/ directory (no data/stations.csv found walking up from module)',
  );
}

function toInt(path: string, v: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) {
    throw new Error(`loader: expected integer at ${path}, got ${JSON.stringify(v)}`);
  }
  return n;
}

/**
 * Load the three CSVs from `dataDir` (defaults to the repo `data/`) and build a
 * nation-wide {@link StationIndex}. Region scoping is deferred to callers: each
 * {@link StationRecord} carries its `region`, so a caller can filter records /
 * name-key candidates by region without rebuilding the index. (A per-region
 * sub-index is unnecessary for MVP judgment, which is already O(1) per answer.)
 */
export function loadStationIndex(dataDir?: string): StationIndex {
  const dir = dataDir ?? resolveDefaultDataDir();

  const stationRows = parseCsvRecords(readFileSync(join(dir, 'stations.csv'), 'utf8'));
  const lineRows = parseCsvRecords(readFileSync(join(dir, 'lines.csv'), 'utf8'));
  const stationLineRows = parseCsvRecords(readFileSync(join(dir, 'station_lines.csv'), 'utf8'));

  // 1. Assign line bits by sorted line_id (deterministic, stable).
  const lineIds = lineRows.map((r) => r['line_id']!);
  const sortedLineIds = [...lineIds].sort();
  const lineBit = new Map<string, number>();
  sortedLineIds.forEach((id, bit) => lineBit.set(id, bit));

  const lineTierByBit = new Map<number, LineTier>();
  for (const row of lineRows) {
    const lineId = row['line_id']!;
    const tier = row['tier'];
    if (!LINE_TIERS.has(tier as LineTier)) {
      throw new Error(`loader: invalid tier for ${lineId}: ${JSON.stringify(tier)}`);
    }
    lineTierByBit.set(lineBit.get(lineId)!, tier as LineTier);
  }

  // startable line_ids (as a lookup) — from lines.csv `startable` column.
  const startableLineIds = new Set<string>();
  for (const r of lineRows) {
    if (r['startable'] === '1') startableLineIds.add(r['line_id']!);
  }

  // 2. Assign station indices by sorted station_id (deterministic).
  const stationById = new Map<string, Record<string, string>>();
  for (const r of stationRows) stationById.set(r['station_id']!, r);
  const sortedStationIds = [...stationById.keys()].sort();
  const stationIdx = new Map<string, number>();
  sortedStationIds.forEach((id, idx) => stationIdx.set(id, idx));

  // 3. Group station_lines by station_id → OR of line bits.
  const lineMaskById = new Map<string, bigint>();
  const startableMaskById = new Map<string, bigint>();
  for (const sl of stationLineRows) {
    const sid = sl['station_id']!;
    const lid = sl['line_id']!;
    const bit = lineBit.get(lid);
    if (bit === undefined) {
      throw new Error(`loader: station_lines references unknown line_id ${JSON.stringify(lid)}`);
    }
    const bitMask = 1n << BigInt(bit);
    lineMaskById.set(sid, (lineMaskById.get(sid) ?? 0n) | bitMask);
    if (startableLineIds.has(lid)) {
      startableMaskById.set(sid, (startableMaskById.get(sid) ?? 0n) | bitMask);
    }
  }

  // 4. Build records in stationIdx order.
  const records: StationRecord[] = new Array(sortedStationIds.length);
  const byName = new Map<string, number[]>();

  for (const sid of sortedStationIds) {
    const idx = stationIdx.get(sid)!;
    const raw = stationById.get(sid)!;
    const lineMask = lineMaskById.get(sid) ?? 0n;

    const pc = popcount(lineMask);
    const isTransfer = pc > 1;
    // Data integrity: computed transfer flag must match the CSV column.
    const csvTransfer = raw['is_transfer'] === '1';
    if (isTransfer !== csvTransfer) {
      throw new Error(
        `loader: is_transfer mismatch for ${sid}: popcount(lineMask)=${pc} → ${isTransfer}, ` +
          `but stations.csv is_transfer=${JSON.stringify(raw['is_transfer'])}`,
      );
    }

    const record: StationRecord = {
      idx,
      id: sid,
      name: raw['name']!,
      displayName: raw['display_name']!,
      region: raw['region']!,
      lineMask,
      // syllables comes straight from the CSV column — never recomputed (B4).
      syllables: toInt(`${sid}.syllables`, raw['syllables']!),
      isTransfer,
      startableLines: startableMaskById.get(sid) ?? 0n,
    };
    records[idx] = record;

    const nameKey = raw['name_key']!;
    const bucket = byName.get(nameKey);
    if (bucket === undefined) byName.set(nameKey, [idx]);
    else bucket.push(idx);
  }

  const byId = (idx: number): StationRecord => {
    const rec = records[idx];
    if (rec === undefined) {
      throw new Error(`loader: byId out-of-range index ${idx}`);
    }
    return rec;
  };

  return { lineBit, lineTierByBit, stationIdx, byId, byName, records };
}

/**
 * Convenience alias mirroring the plan's `loadStationIndex(dataDir?)`. Kept as a
 * distinct export in case the two ever diverge (e.g. caching).
 */
export function loadStationIndexFrom(dataDir: string): StationIndex {
  return loadStationIndex(dataDir);
}
