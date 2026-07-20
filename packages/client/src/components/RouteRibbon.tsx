/**
 * RouteRibbon (기획서 2a): the accepted-station flow.
 *
 * Visual spec (wireframe):
 *   - Active line chips row at top
 *   - Past stations: small green circles with station names below; transfer dots below name
 *   - Current station: large circle (name below, NOT inside), transfer dots below name
 *   - Segment bars: solid green between stations
 *   - Ghost slot: dashed circle with "?" placeholder
 *   - Next segment: dashed red (sinbundang color)
 *   - Only the last MAX_PAST past stations are shown; current is center-right
 *
 * Preserves: data-testid="route-ribbon", "route-current", "route-past", "route-ghost".
 */

import type { RouteStop } from '../state/gameStore.js';
import { LINE_COLORS, LINE_COLOR_FALLBACK, LINE_NAMES, LINE_SHORT_NAMES } from '../ui/lineColors.js';
import { colors, fonts, radii } from '../ui/theme.js';

/** Max number of past stations to show before the current one. */
const MAX_PAST = 3;

interface RouteRibbonProps {
  route: RouteStop[];
  /** Active line slugs from RoundStartedPayload.startLineNames */
  activeLines?: string[];
}

export function RouteRibbon({ route, activeLines }: RouteRibbonProps): JSX.Element {
  const last = route.length - 1;

  // Slice to last MAX_PAST past stops + current stop
  const sliceStart = Math.max(0, route.length - (MAX_PAST + 1));
  const visible = route.slice(sliceStart);
  const hiddenCount = sliceStart; // how many older stops are hidden

  return (
    <div data-testid="route-ribbon" style={{ padding: '12px 12px 8px' }}>
      {/* Active line chips */}
      {activeLines && activeLines.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}>
          {activeLines.map((slug) => {
            const color = LINE_COLORS[slug] ?? LINE_COLOR_FALLBACK;
            const name = LINE_NAMES[slug] ?? slug;
            return (
              <span key={slug} style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: radii.full,
                background: color,
                color: '#fff',
                fontSize: 11,
                fontFamily: fonts.mono,
                fontWeight: 700,
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
              }}>
                {name}
              </span>
            );
          })}
        </div>
      )}

      {/* Station flow */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        overflowX: 'auto',
        paddingBottom: 8,
        gap: 0,
        scrollbarWidth: 'thin',
      }}>
        {/* "…" indicator when older stops are hidden */}
        {hiddenCount > 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: '0 0 auto',
            marginRight: 4,
            alignSelf: 'center',
          }}>
            <span style={{
              fontSize: 11,
              color: colors.textMuted,
              fontFamily: fonts.mono,
              letterSpacing: '0.04em',
            }}>…</span>
          </div>
        )}

        {visible.map((stop, vi) => {
          const absoluteIdx = sliceStart + vi;
          const isCurrent = absoluteIdx === last;
          const distFromCurrent = last - absoluteIdx;
          const opacity = isCurrent ? 1 : Math.max(0.4, 1 - distFromCurrent * 0.2);

          return (
            <div
              key={`${stop.station}-${absoluteIdx}`}
              style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}
            >
              {/* Station node */}
              <div
                data-testid={isCurrent ? 'route-current' : 'route-past'}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  opacity,
                  flex: '0 0 auto',
                  minWidth: isCurrent ? 110 : 80,
                }}
              >
                {/* Circle — name goes BELOW, never inside */}
                <div style={isCurrent ? currentDotStyle : pastDotStyle(distFromCurrent)} />

                {/* Transfer line chips */}
                {stop.lineNames && stop.lineNames.length > 0 && (
                  <div style={{
                    display: 'flex',
                    gap: 3,
                    marginTop: 6,
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                    maxWidth: isCurrent ? 108 : 76,
                  }}>
                    {stop.lineNames.map((slug) => (
                      <span
                        key={slug}
                        title={LINE_NAMES[slug] ?? slug}
                        style={{
                          fontSize: isCurrent ? 10 : 9,
                          fontFamily: fonts.mono,
                          fontWeight: 700,
                          color: '#fff',
                          background: LINE_COLORS[slug] ?? LINE_COLOR_FALLBACK,
                          padding: isCurrent ? '2px 5px' : '1px 4px',
                          borderRadius: 3,
                          whiteSpace: 'nowrap',
                          lineHeight: 1.4,
                          letterSpacing: '0.01em',
                        }}
                      >
                        {isCurrent
                          ? (LINE_NAMES[slug] ?? slug)
                          : (LINE_SHORT_NAMES[slug] ?? LINE_NAMES[slug] ?? slug)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Station name */}
                <span style={{
                  marginTop: stop.lineNames && stop.lineNames.length > 0 ? 5 : 6,
                  fontSize: isCurrent ? 17 : 13,
                  fontWeight: isCurrent ? 700 : 500,
                  fontFamily: fonts.body,
                  color: isCurrent ? colors.text : colors.textDim,
                  whiteSpace: 'nowrap',
                  maxWidth: isCurrent ? 120 : 80,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  textAlign: 'center',
                  lineHeight: 1.2,
                }}>
                  {stop.name}
                </span>

                {/* Sub-label for current */}
                {isCurrent && (
                  <span style={{
                    fontSize: 11,
                    fontFamily: fonts.mono,
                    color: colors.activeGold,
                    fontWeight: 600,
                    marginTop: 2,
                    letterSpacing: '0.02em',
                  }}>
                    현재역
                  </span>
                )}
              </div>

              {/* Segment bar (not after the last visible stop — ghost segment handles it) */}
              {vi < visible.length - 1 && <div style={segmentStyle(false)} />}
            </div>
          );
        })}

        {/* Dashed segment to ghost */}
        {route.length > 0 && <div style={segmentStyle(true)} />}

        {/* Ghost slot */}
        <div
          data-testid="route-ghost"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            flex: '0 0 auto',
            minWidth: 80,
          }}
        >
          <div style={ghostDotStyle}>
            <span style={{
              fontSize: 16,
              color: colors.textMuted,
              fontFamily: fonts.mono,
              fontWeight: 600,
            }}>?</span>
          </div>
          <span style={{
            marginTop: 6,
            fontSize: 13,
            color: colors.textMuted,
            fontFamily: fonts.body,
            whiteSpace: 'nowrap',
          }}>
            다음 역?
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const currentDotStyle: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: '50%',
  border: `3px solid ${colors.text}`,
  background: colors.panel,
  flexShrink: 0,
  boxShadow: `0 0 0 4px rgba(239,124,28,0.25)`,
  transition: 'all 200ms ease',
};

function pastDotStyle(dist: number): React.CSSProperties {
  const size = dist <= 1 ? 20 : 14;
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    border: `2px solid ${colors.accent}`,
    background: colors.panel,
    flexShrink: 0,
    transition: 'all 200ms ease',
  };
}

const ghostDotStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: '50%',
  border: `2px dashed ${colors.textMuted}`,
  background: colors.panel,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function segmentStyle(isNext: boolean): React.CSSProperties {
  if (isNext) {
    return {
      width: 28,
      height: 3,
      flex: '0 0 auto',
      marginTop: 28,
      backgroundImage: `repeating-linear-gradient(
        90deg,
        ${colors.danger} 0px,
        ${colors.danger} 6px,
        transparent 6px,
        transparent 10px
      )`,
      opacity: 0.9,
    };
  }
  return {
    width: 20,
    height: 3,
    flex: '0 0 auto',
    marginTop: 28,
    background: colors.accent,
    opacity: 0.6,
    borderRadius: radii.full,
  };
}
