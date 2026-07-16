/**
 * Pure, isomorphic bitmask judgment for a submitted station answer (plan §5).
 *
 * No I/O, no clock, fully deterministic: given the loaded {@link StationIndex},
 * the current station, the active line mask and the visited set, it resolves a
 * raw input string to a concrete station index (or a rejection reason).
 *
 * Duplicate detection keys on `stationIdx`, NOT on name/name_key — so split
 * homonyms (신촌/양평/좌천), which share a `name_key` but are distinct station
 * records with distinct line masks, are never cross-marked (plan §5, review B3).
 */

import type { StationIndex, JudgmentResult } from './types.js';

/**
 * Replicates `build.py`'s `match_key(strip_paren(NFC(text)))` so raw user input
 * maps to the same `name_key` the build pipeline wrote into `stations.csv`:
 *   1. NFC-normalize.
 *   2. Strip a parenthetical qualifier `(...)` (with surrounding whitespace).
 *   3. Remove whitespace, middle-dot `·`, `.` and `-`.
 *   4. Strip a single trailing `역` when the remaining length is > 2.
 */
export function normalizeNameKey(text: string): string {
  // NFC normalize.
  const nfc = text.normalize('NFC');
  // strip_paren: remove a parenthetical qualifier and surrounding whitespace.
  const stripped = nfc.replace(/\s*\(.*?\)\s*/g, '').trim();
  // norm_key: remove whitespace / middle-dot / period / hyphen.
  const normed = stripped.replace(/[\s·.\-]/g, '');
  // match_key: drop a trailing '역' when the remainder is long enough.
  if (normed.endsWith('역') && normed.length > 2) {
    return normed.slice(0, -1);
  }
  return normed;
}

/** Input to {@link judge}: the loaded index plus the current turn context. */
export interface JudgeInput {
  /** The loaded station index (slug↔bit interning owner). */
  index: StationIndex;
  /** Current station as an integer `stationIdx`. */
  currentIdx: number;
  /** Bitmask of currently-active lines the answer must connect to. */
  activeMask: bigint;
  /** Visited stations this round, by `stationIdx`. */
  used: Set<number>;
  /** Raw submitted answer text. */
  text: string;
}

interface ValidCandidate {
  idx: number;
  straight: boolean;
  /** Next active mask if this candidate is selected. */
  nextMask: bigint;
}

/**
 * Judge a submitted answer against the current game state (plan §5).
 *
 * S = current station, A = `activeMask`. For each name-key candidate `c`:
 *   - `straight` when A intersects `lines(c)`.
 *   - a transfer when S's lines intersect `lines(c)`.
 * A candidate is valid when it is straight OR a transfer. Among valid, unused
 * candidates, prefer `straight` then the lowest idx. The next active mask is the
 * intersection that made the candidate valid (A∩lines(c) for straight, else
 * lines(S)∩lines(c)).
 */
export function judge(input: JudgeInput): JudgmentResult {
  const { index, currentIdx, activeMask, used, text } = input;

  const key = normalizeNameKey(text);
  const candidates = index.byName.get(key);
  if (candidates === undefined || candidates.length === 0) {
    return { valid: false, reason: 'notFound' };
  }

  const currentLines = index.byId(currentIdx).lineMask;

  const valid: ValidCandidate[] = [];
  for (const c of candidates) {
    const linesT = index.byId(c).lineMask;
    const straightMask = activeMask & linesT;
    const straight = straightMask !== 0n;
    const transferMask = currentLines & linesT;
    if (straight) {
      valid.push({ idx: c, straight: true, nextMask: straightMask });
    } else if (transferMask !== 0n) {
      valid.push({ idx: c, straight: false, nextMask: transferMask });
    }
  }

  if (valid.length === 0) {
    return { valid: false, reason: 'lineMismatch' };
  }

  const unused = valid.filter((v) => !used.has(v.idx));
  if (unused.length === 0) {
    return { valid: false, reason: 'duplicate' };
  }

  // Deterministic selection: prefer straight over transfer, then lowest idx.
  let best = unused[0]!;
  for (const v of unused) {
    if (v.straight !== best.straight) {
      if (v.straight) best = v;
      continue;
    }
    if (v.idx < best.idx) best = v;
  }

  return {
    valid: true,
    transfer: !best.straight,
    newActiveMask: best.nextMask,
    stationIdx: best.idx,
  };
}
