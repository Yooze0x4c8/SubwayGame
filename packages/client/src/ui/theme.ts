/**
 * Design system — 역명판 (station nameplate) signage language.
 *
 * The concept: every surface in this app is a piece of station signage.
 * Seoul Metro wayfinding has a very specific grammar, and we borrow it wholesale
 * instead of inventing decoration:
 *
 *   - Enamel sign faces are flat white, mounted on concrete — so panels are
 *     white with hairline borders and (almost) no drop shadow. Signs don't float.
 *   - Line identity is carried by a colored RAIL across the top of a sign, and by
 *     circular numbered discs. That is the only chroma in the UI.
 *   - Korean station names are set large and heavy; the romanization sits beneath
 *     in small, wide-tracked letters. Never the other way around.
 *   - Utility text (codes, counts, timers) is monospaced and letterspaced, like
 *     printed signage captions.
 *   - Safety-line yellow (#F5C11E) is the platform-edge warning color. It means
 *     "caution", never "highlight".
 *
 * Radii are small and shadows are tight on purpose: pillowy 20px cards with soft
 * glows read as generic web UI, not as transit signage.
 *
 * Line colors live in ui/lineColors.ts. Signage primitives live in ui/signage.tsx.
 */

// ── Palette ──────────────────────────────────────────────────────────────────

export const colors = {
  /** Platform concrete — the ground everything is mounted on. */
  bg:          '#E4E6E1',
  /** Deeper concrete, for insets and recessed wells. */
  bgDeep:      '#D7DAD4',
  /** Enamel sign face. */
  panel:       '#FFFFFF',
  /** Secondary sign face / recessed field. */
  panelAlt:    '#F3F5F1',
  panelHover:  '#E9ECE6',

  // text — signage ink
  text:        '#14181B',
  textDim:     '#4C555C',
  /** Muted caption ink. Kept at ≥4.5:1 on white so small labels stay legible. */
  textMuted:   '#6E777E',

  /** Line 2 green — the app's default line identity. */
  accent:      '#00A84D',
  accentDim:   '#E7F6EE',
  accentHover: '#008F41',

  /** Platform-edge safety yellow. Means caution, not emphasis. */
  safety:      '#F5C11E',
  safetyDim:   '#FDF4DA',

  // status
  warn:        '#F5C11E',
  warnDim:     '#FDF4DA',
  danger:      '#D4003B', // 신분당선 red
  dangerDim:   '#FCEDF1',
  success:     '#00A84D',
  info:        '#0052A4', // 1호선 blue — used for informational notes

  // clock bars (§12)
  roundBar:    '#858E95',
  turnBar:     '#D4003B',

  /** Empty/ghost slot fill. */
  ghost:       '#E4E6E1',

  // borders — hairline sign edges
  border:      '#CBD0CA',
  borderLight: '#E1E4DF',
  /** Signage ink border, for the "current"/focused sign. */
  borderInk:   '#14181B',

  // score pop
  scorePos:    '#00A84D',
  scoreNeg:    '#D4003B',

  /** Active player marker — 3호선 orange, per 기획서 §7. */
  activeGold:    '#EF7C1C',
  activeGoldBg:  '#FEF6EC',
  activeGoldDim: '#FBE7D2',

  // primary action — signage ink
  btnPrimary:     '#14181B',
  btnPrimaryText: '#FFFFFF',
} as const;

// ── Typography ────────────────────────────────────────────────────────────────

export const fonts = {
  /** Black Han Sans — station names, wordmark, headings. Heavy Korean display. */
  display:  '"Black Han Sans", "Malgun Gothic", sans-serif',
  /** IBM Plex Sans KR — body, UI labels, player names. */
  body:     '"IBM Plex Sans KR", -apple-system, "Malgun Gothic", sans-serif',
  /** IBM Plex Mono — timers, scores, codes, romanization, signage captions. */
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

/**
 * Letterspacing. `caption`/`code` are for Latin and digits only — see the note
 * on `signLabel` below before applying them to Korean.
 */
export const tracking = {
  caption: '0.14em',
  code:    '0.22em',
  /** Korean labels: a hair of tracking, never the wide signage kind. */
  ko:      '0.01em',
  tight:   '-0.02em',
} as const;

/**
 * Signage label styles — pick by script, not by role.
 *
 * IBM Plex Mono ships no Hangul, so Korean set in it silently falls back to a
 * system face, and wide signage tracking on Hangul reads as broken spacing
 * ("지 하 철  이 어 가 기"). Real signage splits the same way: Korean in a sans,
 * Latin and numerals in the tracked utility face.
 *
 *   signLabel — Korean captions and field labels. Body face, tight tracking.
 *   signCode  — codes, counts, timers, romanization. Mono, tracked out.
 */
export const signLabel = {
  fontFamily: '"IBM Plex Sans KR", -apple-system, "Malgun Gothic", sans-serif',
  fontWeight: 600,
  letterSpacing: tracking.ko,
} as const;

export const signCode = {
  fontFamily: '"IBM Plex Mono", "D2Coding", "Courier New", monospace',
  fontWeight: 500,
  letterSpacing: tracking.caption,
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

/** Signage is fabricated, not rounded-off. Keep these small. */
export const radii = {
  sm:   2,
  md:   4,
  lg:   6,
  xl:   10,
  full: 9999,
} as const;

// ── Shadows ───────────────────────────────────────────────────────────────────

/** Signs are mounted flush. Only overlays are allowed to float. */
export const shadows = {
  none: 'none',
  /** A mounted sign: hairline contact shadow only. */
  sm:  '0 1px 2px rgba(20,24,27,0.05)',
  md:  '0 2px 4px rgba(20,24,27,0.07)',
  /** Overlays / modals — these genuinely float above the platform. */
  lg:  '0 24px 64px rgba(20,24,27,0.26)',
  glow: (color: string) => `0 0 0 2px ${color}33`,
} as const;

/** The line-colored rail that tops a sign. */
export const RAIL_HEIGHT = 4;

// ── Motion / Animation ────────────────────────────────────────────────────────

export const motion = {
  fast:    '120ms',
  normal:  '200ms',
  slow:    '360ms',
  /** Trains decelerate; they don't bounce. */
  easeOut: 'cubic-bezier(0.22, 1, 0.36, 1)',
  easeIn:  'cubic-bezier(0.4, 0, 1, 1)',
  spring:  'cubic-bezier(0.34, 1.4, 0.64, 1)',
} as const;

// ── Player color palette ──────────────────────────────────────────────────────

/** Seoul line colors, ordered so adjacent seats read distinctly. */
export const palette = [
  '#00A84D', // 2호선 green
  '#0052A4', // 1호선 blue
  '#EF7C1C', // 3호선 orange
  '#996CAC', // 5호선 purple
  '#00A5DE', // 4호선 sky
  '#747F00', // 7호선 olive
  '#E6186C', // 8호선 pink
  '#CD7C2F', // 6호선 ochre
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
