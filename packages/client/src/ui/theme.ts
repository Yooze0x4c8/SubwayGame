/**
 * Design system — M6 full token set.
 *
 * Aesthetic direction: dark transit UI.
 *   - Background: near-black #0B0E13 (platform-at-night)
 *   - Surface hierarchy: panel #141820, panelAlt #1C2230
 *   - Typography: Black Han Sans (wordmark/headings), IBM Plex Sans KR (body),
 *                 IBM Plex Mono (numbers, codes, timers)
 *   - Accent: Seoul line colors (see ui/lineColors.ts). Default accent = line 2 green.
 *   - Motion: ≤3 s per §7 공통 원칙; prefers-reduced-motion respected via CSS.
 */

// ── Palette ──────────────────────────────────────────────────────────────────

export const colors = {
  // backgrounds
  bg:          '#0B0E13',
  panel:       '#141820',
  panelAlt:    '#1C2230',
  panelHover:  '#222B3A',

  // text
  text:        '#E8EDF5',
  textDim:     '#7A8699',
  textMuted:   '#4A5568',

  // Seoul metro brand accents (기획서 §7)
  accent:      '#00A84D', // line 2 green
  accentDim:   '#0A2B19',
  accentHover: '#00C05A',

  // status
  warn:        '#F2B705',
  warnDim:     '#2E2000',
  danger:      '#D4003B', // sinbundang red
  dangerDim:   '#2D0010',
  success:     '#00A84D',

  // clock bars (§12)
  roundBar:    '#3A4458',    // thin grey continuous
  turnBar:     '#00A5DE',    // thick blue per-turn (line 4)
  turnBarWarn: '#D4003B',    // <3 s

  // ghost slot
  ghost:       '#2A3347',

  // borders / dividers
  border:      '#232B3C',
  borderLight: '#2E3A50',

  // score pop
  scorePos:    '#00A84D',
  scoreNeg:    '#D4003B',
} as const;

// ── Typography ────────────────────────────────────────────────────────────────

export const fonts = {
  /** Black Han Sans — wordmark, section headers, strong Korean display. */
  display:  '"Black Han Sans", "Malgun Gothic", sans-serif',
  /** IBM Plex Sans KR — body, UI labels, player names. */
  body:     '"IBM Plex Sans KR", -apple-system, "Malgun Gothic", sans-serif',
  /** IBM Plex Mono — timers, scores, codes, monospaced numbers. */
  mono:     '"IBM Plex Mono", "D2Coding", "Courier New", monospace',
} as const;

export const fontSizes = {
  xs:   11,
  sm:   13,
  base: 15,
  md:   17,
  lg:   20,
  xl:   24,
  '2xl': 32,
  '3xl': 48,
  wordmark: 'clamp(40px, 8vw, 80px)',
} as const;

export const fontWeights = {
  normal: 400,
  medium: 500,
  semi:   600,
  bold:   700,
  black:  900,
} as const;

// ── Spacing ───────────────────────────────────────────────────────────────────

export const space = {
  0:  0,
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  8:  32,
  10: 40,
  12: 48,
  16: 64,
} as const;

// ── Radii ────────────────────────────────────────────────────────────────────

export const radii = {
  sm:   6,
  md:   10,
  lg:   14,
  xl:   20,
  full: 9999,
} as const;

// ── Shadows ───────────────────────────────────────────────────────────────────

export const shadows = {
  sm:  '0 1px 3px rgba(0,0,0,0.4)',
  md:  '0 4px 12px rgba(0,0,0,0.5)',
  lg:  '0 8px 24px rgba(0,0,0,0.6)',
  glow: (color: string) => `0 0 0 3px ${color}33, 0 0 12px ${color}22`,
} as const;

// ── Motion / Animation ────────────────────────────────────────────────────────

export const motion = {
  fast:    '120ms',
  normal:  '220ms',
  slow:    '380ms',
  easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
  easeIn:  'cubic-bezier(0.4, 0, 1, 1)',
  spring:  'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

// ── Player color palette ──────────────────────────────────────────────────────

/** A small rotating palette so multiple players read distinctly. */
export const palette = [
  '#00A84D', // line 2 green
  '#00A5DE', // line 4 sky
  '#EF7C1C', // line 3 orange
  '#996CAC', // line 5 purple
  '#F2B705', // amber
  '#0C8E72', // teal
  '#D4003B', // sinbundang red
  '#747F00', // olive
] as const;

export function playerColor(seatIdx: number): string {
  return palette[seatIdx % palette.length]!;
}

// ── Layout ────────────────────────────────────────────────────────────────────

export const layout = {
  maxWidth:      720,
  maxWidthWide:  960,
  maxWidthNarrow: 480,
  navHeight:     52,
} as const;
