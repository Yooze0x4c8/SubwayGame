/**
 * RouteRibbon (기획서 2a): the accepted-station flow.
 *
 * Visual spec (wireframe):
 *   - Active line chips row at top
 *   - Past stations: small green circles with station names below
 *   - Current station: large circle (name below, NOT inside), "현재역" label
 *   - Segment bars: solid green between stations
 *   - Ghost slot: dashed circle with "?" placeholder
 *   - Next segment: dashed red (sinbundang color)
 *
 * Preserves: data-testid="route-ribbon", "route-current", "route-past", "route-ghost".
 */

import type { RouteStop } from '../state/gameStore.js';
import { LINE_COLORS, LINE_COLOR_FALLBACK, LINE_NAMES } from '../ui/lineColors.js';
import { colors, fonts, radii } from '../ui/theme.js';

interface RouteRibbonProps {
  route: RouteStop[];
  /** Active line slugs from RoundStartedPayload.startLineNames */
  activeLines?: string[];
}

export function RouteRibbon({ route, activeLines }: RouteRibbonProps): JSX.Element {
  const last = route.length - 1;

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
        {route.map((stop, i) => {
          const isCurrent = i === last;
          const distFromCurrent = last - i;
          const opacity = isCurrent ? 1 : Math.max(0.35, 1 - distFromCurrent * 0.18);

          return (
            <div
              key={`${stop.station}-${i}`}
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
                  minWidth: isCurrent ? 80 : 52,
                }}
              >
                {/* Circle — name goes BELOW, never inside */}
                <div style={isCurrent ? currentDotStyle : pastDotStyle(distFromCurrent)} />

                {/* Station name */}
                <span style={{
                  marginTop: 6,
                  fontSize: isCurrent ? 13 : 11,
                  fontWeight: isCurrent ? 700 : 500,
                  fontFamily: fonts.body,
                  color: isCurrent ? colors.text : colors.textDim,
                  whiteSpace: 'nowrap',
                  maxWidth: isCurrent ? 100 : 64,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  textAlign: 'center',
                  lineHeight: 1.25,
                }}>
                  {stop.name}
                </span>

                {/* Sub-label for current */}
                {isCurrent && (
                  <span style={{
                    fontSize: 10,
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

              {/* Segment bar */}
              {i < last && <div style={segmentStyle(false)} />}
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
            minWidth: 52,
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
            fontSize: 11,
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
  width: 52,
  height: 52,
  borderRadius: '50%',
  border: `3px solid ${colors.text}`,
  background: colors.panel,
  flexShrink: 0,
  boxShadow: `0 0 0 4px rgba(239,124,28,0.25)`,
  transition: 'all 200ms ease',
};

function pastDotStyle(dist: number): React.CSSProperties {
  const size = dist <= 1 ? 18 : 13;
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
      marginTop: 24, // align to circle center
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
    marginTop: 24,
    background: colors.accent,
    opacity: 0.6,
    borderRadius: radii.full,
  };
}
