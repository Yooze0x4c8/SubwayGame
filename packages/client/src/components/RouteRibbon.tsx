/**
 * RouteRibbon (기획서 2a): the accepted-station flow.
 *
 * Visual spec (§7 mock):
 *   - Past stations dim left, fading with distance (opacity ramp).
 *   - Current (latest) station: large circle with line-color ring + glow,
 *     transfer stations rendered as donut (white ring + line-color border).
 *   - Segment bars between stops in the active line color.
 *   - Ghost slot on right: dashed circle with "?" + hint text "신분당 환승?".
 *   - Next segment: dashed red (sinbundang color) per mock.
 *
 * Preserves: data-testid="route-ribbon", "route-current", "route-past", "route-ghost".
 */

import type { RouteStop } from '../state/gameStore.js';
import { colors, fonts, radii } from '../ui/theme.js';

export function RouteRibbon({ route }: { route: RouteStop[] }): JSX.Element {
  const last = route.length - 1;

  return (
    <div
      data-testid="route-ribbon"
      style={{
        display: 'flex',
        alignItems: 'center',
        overflowX: 'auto',
        padding: '20px 12px 16px',
        minHeight: 100,
        gap: 0,
        scrollbarWidth: 'thin',
      }}
    >
      {route.map((stop, i) => {
        const isCurrent = i === last;
        const isPast = i < last;
        // Fade older stops more aggressively
        const distFromCurrent = last - i;
        const opacity = isCurrent
          ? 1
          : Math.max(0.22, 1 - distFromCurrent * 0.22);

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
                transition: 'opacity 200ms ease',
                flex: '0 0 auto',
                minWidth: isCurrent ? 88 : 56,
              }}
            >
              {/* Circle */}
              <div style={isCurrent ? currentDotStyle : pastDotStyle(distFromCurrent)}>
                {isCurrent && (
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: fonts.mono,
                    color: colors.text,
                    lineHeight: 1,
                  }}>
                    현재
                  </span>
                )}
              </div>
              {/* Label */}
              <span style={{
                marginTop: 6,
                fontSize: isCurrent ? 13 : 10,
                fontWeight: isCurrent ? 700 : 400,
                fontFamily: fonts.body,
                color: isCurrent ? colors.text : colors.textDim,
                whiteSpace: 'nowrap',
                maxWidth: isCurrent ? 88 : 60,
                textAlign: 'center',
                lineHeight: 1.2,
              }}>
                {stop.name}
              </span>
            </div>

            {/* Segment bar between this stop and next */}
            {isPast && i < last - 1 && (
              <div style={segmentStyle(false)} />
            )}
            {/* Segment from second-to-last to current */}
            {isPast && i === last - 1 && (
              <div style={segmentStyle(false)} />
            )}
          </div>
        );
      })}

      {/* Dashed segment to ghost */}
      {route.length > 0 && (
        <div style={segmentStyle(true)} />
      )}

      {/* Ghost slot */}
      <div
        data-testid="route-ghost"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          flex: '0 0 auto',
          minWidth: 64,
        }}
      >
        <div style={ghostDotStyle}>
          <span style={{
            fontSize: 18,
            color: colors.textMuted,
            fontFamily: fonts.mono,
            fontWeight: 600,
          }}>?</span>
        </div>
        <span style={{
          marginTop: 6,
          fontSize: 10,
          color: colors.textMuted,
          fontFamily: fonts.body,
          whiteSpace: 'nowrap',
        }}>
          다음 역
        </span>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const currentDotStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: '50%',
  border: `3px solid ${colors.accent}`,
  background: colors.panel,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: `0 0 0 4px ${colors.accent}33, 0 0 14px ${colors.accent}22`,
  transition: 'all 200ms ease',
};

function pastDotStyle(dist: number): React.CSSProperties {
  const size = dist <= 1 ? 16 : 12;
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    border: `2px solid ${colors.accent}`,
    background: colors.panel,
    transition: 'all 200ms ease',
  };
}

const ghostDotStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: '50%',
  border: `2px dashed ${colors.textMuted}`,
  background: 'transparent',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function segmentStyle(isNext: boolean): React.CSSProperties {
  if (isNext) {
    return {
      width: 32,
      height: 3,
      flex: '0 0 auto',
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
    width: 24,
    height: 3,
    flex: '0 0 auto',
    background: colors.accent,
    opacity: 0.5,
    borderRadius: radii.full,
  };
}
