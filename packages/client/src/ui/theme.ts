/**
 * Minimal visual theme for the functional M5 slice.
 *
 * Seoul-metro line colors (기획서 v1.1 §7). Keyed by line bit position is not
 * possible here (bits are region/load dependent), so we expose a small palette
 * and a couple of accent constants the components reuse. M6 owns the full
 * per-line color mapping + 연출.
 */

export const colors = {
  bg: '#0e1116',
  panel: '#1a1f27',
  panelAlt: '#232a34',
  text: '#e6e9ef',
  textDim: '#8b93a1',
  accent: '#00A84D', // line 2 green (기획서)
  accentDim: '#0b3b22',
  warn: '#f2b705',
  danger: '#e5484d',
  roundBar: '#4b5563', // 얇은 회색 (round clock)
  turnBar: '#00A84D', // 굵은 (turn clock)
  ghost: '#3a424e',
} as const;

/** A small rotating palette so multiple players/lines read distinctly. */
export const palette = [
  '#00A84D',
  '#0052A4',
  '#EF7C1C',
  '#996CAC',
  '#BB8336',
  '#0C8E72',
  '#D4003B',
  '#5D6519',
] as const;

export function playerColor(seatIdx: number): string {
  return palette[seatIdx % palette.length]!;
}
