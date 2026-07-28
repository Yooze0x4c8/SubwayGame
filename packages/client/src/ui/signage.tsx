/**
 * Signage primitives — the shared visual vocabulary for the whole app.
 *
 * Everything here is borrowed from Seoul Metro wayfinding rather than invented:
 *
 *   LineBadge    노선 번호 원형 배지 — the numbered disc used on every sign and map.
 *   LineRail     the line-colored rail that runs across the top of a sign.
 *   SignPanel    an enamel sign face: white, hairline edge, optional line rail.
 *   StationPlate 역명판 — the signature element. Korean name large, previous
 *                station to the left, next to the right.
 *   SafetyBar    the platform-edge bar, used for the two countdown clocks.
 *   Caption      a small Korean signage caption.
 *   Wordmark     the SUBWAY lockup.
 *
 * Interactive states that inline styles can't express (:hover, :focus-visible)
 * live as `.sg-*` classes in index.css.
 */

import type { CSSProperties, ReactNode } from 'react';

import {
  LINE_COLORS,
  LINE_COLOR_FALLBACK,
  LINE_NAMES,
  LINE_SHORT_NAMES,
} from './lineColors.js';
import { colors, fonts, radii, tracking, RAIL_HEIGHT } from './theme.js';

// ── Line identity ─────────────────────────────────────────────────────────────

/**
 * The digit a numbered line shows inside its disc (`seoul_2` → `2`).
 * Returns null for named lines (경의중앙선, 신분당선, …), which get a text badge.
 */
export function lineNumber(lineId: string): string | null {
  // Incheon lines share numbers with Seoul lines in the capital-region game,
  // so a number-only disc is ambiguous.
  if (/^incheon_[12]$/.test(lineId)) return null;
  const match = /_(\d+)$/.exec(lineId);
  return match ? match[1]! : null;
}

export function lineColorOf(lineId: string): string {
  return LINE_COLORS[lineId] ?? LINE_COLOR_FALLBACK;
}

export function lineName(lineId: string): string {
  return LINE_NAMES[lineId] ?? lineId;
}

interface LineBadgeProps {
  lineId: string;
  /** Disc diameter in px. Text badges scale their type from this. */
  size?: number;
  /** Show the line's full name beside the badge. */
  withLabel?: boolean;
  /**
   * A line that serves this station but isn't currently active. Rendered as an
   * outline rather than dimmed — knocking a filled badge back to 40% opacity
   * leaves white text on a pale wash, which is unreadable.
   */
  inactive?: boolean;
  title?: string;
}

/**
 * 노선 배지. Numbered lines render as a colored disc with the number inside —
 * exactly the mark used on Seoul platform signage. Named lines render as a
 * small colored plate, since a disc with 5 syllables in it isn't a thing.
 */
export function LineBadge({
  lineId,
  size = 20,
  withLabel = false,
  inactive = false,
  title,
}: LineBadgeProps): JSX.Element {
  const color = lineColorOf(lineId);
  const num = lineNumber(lineId);
  const full = lineName(lineId);
  const short = /^incheon_[12]$/.test(lineId)
    ? full
    : (LINE_SHORT_NAMES[lineId] ?? full);

  const badge = num ? (
    <span
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        boxSizing: 'border-box',
        borderRadius: '50%',
        background: inactive ? 'transparent' : color,
        border: inactive ? `1.5px solid ${color}` : 'none',
        color: inactive ? color : '#fff',
        fontFamily: fonts.mono,
        fontSize: Math.round(size * 0.56),
        fontWeight: 700,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        letterSpacing: 0,
      }}
    >
      {num}
    </span>
  ) : (
    <span
      style={{
        flexShrink: 0,
        boxSizing: 'border-box',
        padding: `${Math.round(size * 0.12)}px ${Math.round(size * 0.3)}px`,
        borderRadius: radii.sm,
        background: inactive ? 'transparent' : color,
        border: inactive ? `1.5px solid ${color}` : 'none',
        color: inactive ? color : '#fff',
        fontFamily: fonts.body,
        fontSize: Math.round(size * 0.55),
        fontWeight: 700,
        lineHeight: 1.25,
        whiteSpace: 'nowrap',
      }}
    >
      {short}
    </span>
  );

  if (!withLabel) {
    return (
      <span title={title ?? full} style={{ display: 'inline-flex', alignItems: 'center' }}>
        {badge}
      </span>
    );
  }

  return (
    <span
      title={title ?? full}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
    >
      {badge}
      <span
        style={{
          fontFamily: fonts.body,
          fontSize: Math.round(size * 0.62),
          fontWeight: 600,
          color: colors.textDim,
          whiteSpace: 'nowrap',
        }}
      >
        {full}
      </span>
    </span>
  );
}

/** A row of line badges. */
export function LineBadges({
  lineIds,
  size = 20,
  max,
}: {
  lineIds: string[];
  size?: number;
  max?: number;
}): JSX.Element {
  const shown = max === undefined ? lineIds : lineIds.slice(0, max);
  const rest = lineIds.length - shown.length;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {shown.map((id) => (
        <LineBadge key={id} lineId={id} size={size} />
      ))}
      {rest > 0 && (
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: Math.round(size * 0.52),
            color: colors.textMuted,
          }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

// ── Sign faces ────────────────────────────────────────────────────────────────

/** The line-colored rail that tops a sign. Multiple lines split it proportionally. */
export function LineRail({
  lineIds,
  height = RAIL_HEIGHT,
}: {
  lineIds: string[];
  height?: number;
}): JSX.Element {
  const ids = lineIds.length > 0 ? lineIds : ['__none__'];
  return (
    <div style={{ display: 'flex', height, flexShrink: 0 }} aria-hidden="true">
      {ids.map((id, i) => (
        <span
          key={`${id}-${i}`}
          style={{
            flex: 1,
            background: id === '__none__' ? colors.border : lineColorOf(id),
          }}
        />
      ))}
    </div>
  );
}

interface SignPanelProps {
  children: ReactNode;
  /** Line ids for the top rail. Omit for an unrailed sign. */
  rail?: string[];
  /** Extra styles merged onto the panel body. */
  style?: CSSProperties;
  /** Styles for the outer frame (the mounted sign itself). */
  frameStyle?: CSSProperties;
  'data-testid'?: string;
}

/**
 * An enamel sign face. Flat white, hairline edge, mounted flush — no float.
 */
export function SignPanel({
  children,
  rail,
  style,
  frameStyle,
  'data-testid': testId,
}: SignPanelProps): JSX.Element {
  return (
    <div
      data-testid={testId}
      style={{
        background: colors.panel,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.lg,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        ...frameStyle,
      }}
    >
      {rail && <LineRail lineIds={rail} />}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, ...style }}>
        {children}
      </div>
    </div>
  );
}

// ── Captions ──────────────────────────────────────────────────────────────────

/**
 * A signage caption for Korean text: body face, small, barely tracked.
 *
 * Deliberately not the mono face — IBM Plex Mono has no Hangul, and wide signage
 * tracking on Korean reads as broken spacing. Latin codes and numerals use the
 * mono face directly at their call sites (see `signCode` in theme.ts).
 */
export function Caption({
  children,
  color = colors.textMuted,
  size = 10,
  style,
}: {
  children: ReactNode;
  color?: string;
  size?: number;
  style?: CSSProperties;
}): JSX.Element {
  return (
    <div
      style={{
        fontFamily: fonts.body,
        fontSize: size,
        fontWeight: 500,
        letterSpacing: tracking.ko,
        color,
        lineHeight: 1.4,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── 역명판 ────────────────────────────────────────────────────────────────────

interface StationPlateProps {
  /** Current station name (Korean). */
  name: string;
  /** Previous station on the route, shown to the left with a ← arrow. */
  prevName?: string;
  /**
   * The station ahead. `undefined` renders the unknown-next state — a dashed
   * placeholder, which is exactly the game's premise.
   */
  nextName?: string;
  /** Lines serving this station; drives the rail and the badge row. */
  lineIds?: string[];
  /** Lines currently active (a subset of lineIds) — these badges stay full strength. */
  activeLineIds?: string[];
  /** True when the current station is an interchange. */
  isTransfer?: boolean;
  /** Compact variant for tight layouts. */
  compact?: boolean;
  /** Optional override for transient states such as a timeout answer hint. */
  nameColor?: string;
  /** Draw a strike through the station name for a rejected answer. */
  strikeThrough?: boolean;
  'data-testid'?: string;
}

/**
 * 역명판 — the station nameplate. This is the app's signature element.
 *
 * The arrival station is centered and set large in heavy Korean type, while the
 * adjacent stations flank it with directional arrows. The line rail across the
 * top tells you which line you're standing on before you read a single word.
 */
export function StationPlate({
  name,
  prevName,
  nextName,
  lineIds = [],
  activeLineIds,
  isTransfer = false,
  compact = false,
  nameColor,
  strikeThrough = false,
  'data-testid': testId,
}: StationPlateProps): JSX.Element {
  const railIds = (activeLineIds && activeLineIds.length > 0 ? activeLineIds : lineIds);
  const nameSize = compact
    ? 'clamp(26px, 7vw, 38px)'
    : 'clamp(34px, 9vw, 56px)';

  return (
    <SignPanel rail={railIds} data-testid={testId}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
          alignItems: 'center',
          gap: compact ? 10 : 16,
          padding: compact ? '14px 14px 12px' : '20px 20px 18px',
        }}
      >
        {/* Previous station — ← direction of travel */}
        <div style={{ minWidth: 0, textAlign: 'left' }}>
          {prevName ? (
            <div style={neighbourStyle}>
              <span style={arrowStyle} aria-hidden="true">←</span>
              <span style={neighbourNameStyle}>{prevName}</span>
            </div>
          ) : (
            <div style={{ ...neighbourStyle, color: colors.textMuted }}>
              <Caption>출발역</Caption>
            </div>
          )}
        </div>

        {/* Current station */}
        <div style={{ textAlign: 'center', minWidth: 0 }}>
          <div
            data-testid={testId ? `${testId}-name` : undefined}
            data-tone={nameColor ? 'highlight' : 'default'}
            data-decoration={strikeThrough ? 'line-through' : 'none'}
            style={{
              fontFamily: fonts.display,
              fontSize: nameSize,
              fontWeight: 400,
              lineHeight: 1.02,
              letterSpacing: tracking.tight,
              color: nameColor ?? colors.text,
              textDecorationLine: strikeThrough ? 'line-through' : undefined,
              textDecorationColor: strikeThrough ? (nameColor ?? colors.danger) : undefined,
              textDecorationThickness: strikeThrough ? '3px' : undefined,
              wordBreak: 'keep-all',
            }}
          >
            {name}
          </div>
          {(lineIds.length > 0 || isTransfer) && (
            <div
              style={{
                marginTop: compact ? 8 : 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              {lineIds.map((id) => {
                const notActive =
                  activeLineIds !== undefined &&
                  activeLineIds.length > 0 &&
                  !activeLineIds.includes(id);
                return (
                  <LineBadge
                    key={id}
                    lineId={id}
                    size={compact ? 18 : 22}
                    inactive={notActive}
                  />
                );
              })}
              {isTransfer && (
                <span
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: tracking.ko,
                    color: colors.activeGold,
                    border: `1px solid ${colors.activeGold}`,
                    borderRadius: radii.sm,
                    padding: '2px 5px',
                    lineHeight: 1.2,
                  }}
                >
                  환승
                </span>
              )}
            </div>
          )}
        </div>

        {/* Next station — → direction of travel */}
        <div style={{ minWidth: 0, textAlign: 'right' }}>
          {nextName ? (
            <div style={{ ...neighbourStyle, justifyContent: 'flex-end' }}>
              <span style={neighbourNameStyle}>{nextName}</span>
              <span style={arrowStyle} aria-hidden="true">→</span>
            </div>
          ) : (
            <div style={{ ...neighbourStyle, justifyContent: 'flex-end' }}>
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 15,
                  fontWeight: 700,
                  color: colors.textMuted,
                  border: `1px dashed ${colors.textMuted}`,
                  borderRadius: radii.sm,
                  padding: '3px 9px',
                  lineHeight: 1.3,
                }}
              >
                ?
              </span>
              <span style={arrowStyle} aria-hidden="true">→</span>
            </div>
          )}
        </div>
      </div>
    </SignPanel>
  );
}

const neighbourStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
};

const neighbourNameStyle: CSSProperties = {
  fontFamily: fonts.body,
  fontSize: 13,
  fontWeight: 600,
  color: colors.textDim,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const arrowStyle: CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: 13,
  color: colors.textMuted,
  flexShrink: 0,
  lineHeight: 1,
};

// ── Platform-edge bar ─────────────────────────────────────────────────────────

interface SafetyBarProps {
  /** 0–100. */
  pct: number;
  /** Fill color. */
  color: string;
  /** Bar height. The plan's §12 hierarchy is carried by thickness. */
  height?: number;
  /** Render the empty portion with platform-edge hatching. */
  hatched?: boolean;
  /**
   * Grow the fill from zero on mount, with an optional stagger delay.
   * Used by the results board; the live clocks drain instead, so they omit it.
   */
  growIn?: { delay?: string };
}

/**
 * The platform-edge safety bar, reused as a countdown track and as the results
 * board's score bar. Square ends and a hatched remainder — the empty portion
 * reads as bare track, not as absent space.
 */
export function SafetyBar({
  pct,
  color,
  height = 8,
  hatched = true,
  growIn,
}: SafetyBarProps): JSX.Element {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      style={{
        flex: 1,
        height,
        minWidth: 0,
        background: colors.bgDeep,
        border: `1px solid ${colors.border}`,
        borderRadius: 1,
        overflow: 'hidden',
        position: 'relative',
        backgroundImage: hatched
          ? `repeating-linear-gradient(-45deg, ${colors.border} 0 1px, transparent 1px 5px)`
          : undefined,
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: '100%',
          background: color,
          transition: 'width 120ms linear, background 360ms ease',
          animation: growIn
            ? `sgBarGrow 620ms cubic-bezier(0.22,1,0.36,1) ${growIn.delay ?? '0ms'} both`
            : undefined,
        }}
      />
    </div>
  );
}

// ── Wordmark ──────────────────────────────────────────────────────────────────

/**
 * The SUBWAY lockup: a line-2 green disc carrying the route glyph, then the
 * wordmark. Replaces the 🚇 emoji that used to stand in for a logo.
 */
export function Wordmark({
  size = 20,
  showMark = true,
}: {
  size?: number;
  showMark?: boolean;
}): JSX.Element {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.4) }}>
      {showMark && <RouteMark size={Math.round(size * 1.1)} />}
      <span
        style={{
          fontFamily: fonts.display,
          fontSize: size,
          fontWeight: 400,
          letterSpacing: tracking.tight,
          color: colors.text,
          lineHeight: 1,
        }}
      >
        SUB<span style={{ color: colors.accent }}>WAY</span>
      </span>
    </span>
  );
}

/**
 * The app mark: a route turning a corner between two stations, drawn the way a
 * metro map draws an interchange. Used instead of a pictogram emoji.
 */
export function RouteMark({ size = 22 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="SUBWAY"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <path
        d="M4 6h8a4 4 0 0 1 4 4v8"
        fill="none"
        stroke={colors.accent}
        strokeWidth="3"
        strokeLinecap="square"
      />
      <circle cx="4" cy="6" r="2.6" fill={colors.panel} stroke={colors.text} strokeWidth="2" />
      <circle cx="16" cy="18" r="2.6" fill={colors.panel} stroke={colors.activeGold} strokeWidth="2" />
    </svg>
  );
}
