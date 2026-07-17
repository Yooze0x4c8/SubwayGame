/**
 * Design system — M6 full token set.
 *
 * Aesthetic direction: light transit UI (matching wireframe PDF).
 *   - Background: light gray #F0F2F5 (platform-at-day)
 *   - Surface hierarchy: card #FFFFFF, cardAlt #F7F8FA
 *   - Typography: Black Han Sans (wordmark/headings), IBM Plex Sans KR (body),
 *                 IBM Plex Mono (numbers, codes, timers)
 *   - Accent: Seoul line colors (see ui/lineColors.ts). Default accent = line 2 green.
 *   - Active highlight: gold/yellow for current player
 *   - Motion: ≤3 s per §7 공통 원칙; prefers-reduced-motion respected via CSS.
 */

// ── Palette ──────────────────────────────────────────────────────────────────

export const colors = {
  // backgrounds — 기획서 §7 exact values
  bg:          '#FAFAF8', // --paper
  panel:       '#FFFFFF', // --card
  panelAlt:    '#F1F3F2', // --wash
  panelHover:  '#EAECEE',

  // text — 기획서 §7 exact values
  text:        '#101418', // --ink
  textDim:     '#4A525C', // --ink-70
  textMuted:   '#818A94', // --ink-45

  // Seoul metro brand accents (기획서 §7)
  accent:      '#00A84D', // line 2 green (--line2)
  accentDim:   '#E8F9F0',
  accentHover: '#00944A',

  // status
  warn:        '#F2B705',
  warnDim:     '#FFF8E0',
  danger:      '#D4003B', // sinbundang red (--sinb)
  dangerDim:   '#FFF0F4',
  success:     '#00A84D',

  // clock bars (§12)
  // round bar fill = ink-45 gray per wireframe inline style
  roundBar:    '#818A94', // --ink-45
  turnBar:     '#D4003B', // --sinb red per wireframe CSS

  // ghost slot
  ghost:       '#E8ECF0',

  // borders / dividers — 기획서 §7 exact values
  border:      '#D6DADE', // --rail
  borderLight: '#E7E9EB', // --hair

  // score pop
  scorePos:    '#00A84D',
  scoreNeg:    '#D4003B',

  // active player: line3 ORANGE per wireframe (.pcard.on border = line3)
  activeGold:    '#EF7C1C', // --line3 orange
  activeGoldBg:  '#FFFBF0', // wireframe .pcard.on background
  activeGoldDim: '#FFF3E0',

  // button primary (dark)
  btnPrimary:     '#101418', // --ink
  btnPrimaryText: '#FFFFFF',
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
  sm:  '0 1px 3px rgba(0,0,0,0.08)',
  md:  '0 4px 12px rgba(0,0,0,0.10)',
  lg:  '0 8px 24px rgba(0,0,0,0.12)',
  glow: (color: string) => `0 0 0 3px ${color}22, 0 0 12px ${color}18`,
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
