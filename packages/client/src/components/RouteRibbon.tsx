/**
 * RouteRibbon (기획서 2a): the accepted-station flow, drawn as a metro diagram.
 *
 * This is the *diagram*, not the nameplate. The current station's identity —
 * name, romanization, line badges, transfer state — is carried by <StationPlate>
 * in InGame; duplicating it here is what made the old ribbon feel cluttered.
 *
 * Signage grammar, straight off a Seoul route map:
 *   - One continuous line at a fixed baseline, with each segment tinted by the
 *     line the two stations share. A color change *is* a transfer (기획서 §7).
 *   - Regular stations: a small filled dot in the line color.
 *   - Interchanges: a white donut with an ink ring — how every metro map in the
 *     world distinguishes a transfer station.
 *   - Current station: a larger ink donut.
 *   - Ahead: a dashed segment to a dashed placeholder. The unknown next station
 *     is the whole game, so it gets drawn, not hidden.
 *   - Stations already passed fade toward the left edge (소진 감각).
 *
 * Preserves: data-testid="route-ribbon", "route-current", "route-past", "route-ghost".
 */

import type { RouteStop } from '../state/gameStore.js';
import { colors, fonts, radii, tracking } from '../ui/theme.js';
import { lineColorOf } from '../ui/signage.js';

/** Max number of past stations to show before the current one. */
const MAX_PAST = 4;

/**
 * Height of the band the nodes sit in. Nodes are vertically centered inside it
 * and segments are offset to that same center, so the whole diagram reads as one
 * continuous line no matter how the node sizes differ.
 */
const NODE_BAND = 34;

/** Segment thickness, and the offset that centers a segment in the node band. */
const SEGMENT_H = 3;
const SEGMENT_OFFSET = (NODE_BAND - SEGMENT_H) / 2;

interface RouteRibbonProps {
  route: RouteStop[];
  /** Active line slugs — tints the dashed segment running ahead. */
  activeLines?: string[];
}

/** The line shared by two consecutive stops — i.e. the line you rode between them. */
function segmentColor(from: RouteStop, to: RouteStop): string {
  const fromLines = from.lineNames ?? [];
  const toLines = to.lineNames ?? [];
  const shared = fromLines.find((l) => toLines.includes(l));
  if (shared) return lineColorOf(shared);
  // No shared line means the route data is sparse; fall back to the arrival line.
  const fallback = toLines[0] ?? fromLines[0];
  return fallback ? lineColorOf(fallback) : colors.border;
}

function stopColor(stop: RouteStop): string {
  const first = (stop.lineNames ?? [])[0];
  return first ? lineColorOf(first) : colors.accent;
}

export function RouteRibbon({ route, activeLines }: RouteRibbonProps): JSX.Element {
  const last = route.length - 1;
  const sliceStart = Math.max(0, route.length - (MAX_PAST + 1));
  const visible = route.slice(sliceStart);
  const hiddenCount = sliceStart;

  const aheadColor =
    activeLines && activeLines.length > 0 ? lineColorOf(activeLines[0]!) : colors.textMuted;

  return (
    <div
      data-testid="route-ribbon"
      style={{
        padding: '14px 4px 10px',
        overflowX: 'auto',
        overflowY: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: 'min-content' }}>
        {/* Elided older stops — the line continues off the left edge. */}
        {hiddenCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-start', flex: '0 0 auto' }}>
            <div
              title={`이전 ${hiddenCount}개 역`}
              style={{
                marginTop: SEGMENT_OFFSET,
                width: 26,
                height: SEGMENT_H,
                flex: '0 0 auto',
                backgroundImage: `repeating-linear-gradient(90deg, ${colors.border} 0 3px, transparent 3px 7px)`,
              }}
            />
          </div>
        )}

        {visible.map((stop, vi) => {
          const absoluteIdx = sliceStart + vi;
          const isCurrent = absoluteIdx === last;
          const dist = last - absoluteIdx;
          // Passed stations recede; the current one is at full strength.
          const opacity = isCurrent ? 1 : Math.max(0.38, 1 - dist * 0.18);
          const isTransfer = (stop.lineNames?.length ?? 0) > 1;
          const next = visible[vi + 1];

          return (
            <div
              key={`${stop.station}-${absoluteIdx}`}
              style={{ display: 'flex', alignItems: 'flex-start', flex: '0 0 auto' }}
            >
              <div
                data-testid={isCurrent ? 'route-current' : 'route-past'}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  opacity,
                  flex: '0 0 auto',
                  width: isCurrent ? 92 : 74,
                  transition: 'opacity 200ms ease',
                }}
              >
                {/* Node */}
                <div
                  style={{
                    height: NODE_BAND,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <StationNode
                    color={stopColor(stop)}
                    isCurrent={isCurrent}
                    isTransfer={isTransfer}
                  />
                </div>

                {/* Name — the test asserts the current node carries its name. */}
                <span
                  style={{
                    marginTop: 2,
                    fontSize: isCurrent ? 13 : 12,
                    fontWeight: isCurrent ? 700 : 500,
                    fontFamily: fonts.body,
                    color: isCurrent ? colors.text : colors.textDim,
                    width: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                    lineHeight: 1.25,
                  }}
                >
                  {stop.name}
                </span>
              </div>

              {/* Segment to the next visible stop */}
              {next && (
                <div
                  style={{
                    marginTop: SEGMENT_OFFSET,
                    width: 22,
                    height: SEGMENT_H,
                    flex: '0 0 auto',
                    background: segmentColor(stop, next),
                  }}
                />
              )}
            </div>
          );
        })}

        {/* The stretch of line running ahead — dashed, because nobody knows it yet. */}
        {route.length > 0 && (
          <div
            style={{
              marginTop: SEGMENT_OFFSET,
              width: 26,
              height: SEGMENT_H,
              flex: '0 0 auto',
              backgroundImage: `repeating-linear-gradient(90deg, ${aheadColor} 0 5px, transparent 5px 9px)`,
            }}
          />
        )}

        {/* Ghost slot */}
        <div
          data-testid="route-ghost"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            flex: '0 0 auto',
            width: 74,
          }}
        >
          <div
            style={{
              height: NODE_BAND,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: `2px dashed ${colors.textMuted}`,
                background: colors.panel,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: fonts.body,
                fontSize: 11,
                fontWeight: 700,
                color: colors.textMuted,
                boxSizing: 'border-box',
              }}
            >
              ?
            </span>
          </div>
          <span
            style={{
              marginTop: 2,
              fontSize: 10,
              fontFamily: fonts.body,
              fontWeight: 500,
              letterSpacing: tracking.ko,
              color: colors.textMuted,
              whiteSpace: 'nowrap',
            }}
          >
            다음 역
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

/**
 * A station marker. Interchanges are donuts, through-stations are dots — the
 * standard metro-map distinction, and cheaper to read than a text label.
 */
function StationNode({
  color,
  isCurrent,
  isTransfer,
}: {
  color: string;
  isCurrent: boolean;
  isTransfer: boolean;
}): JSX.Element {
  if (isCurrent) {
    return (
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          boxSizing: 'border-box',
          border: `4px solid ${colors.text}`,
          background: colors.panel,
          flexShrink: 0,
          // A safety-yellow halo marks "you are here", matching the focus ring.
          boxShadow: `0 0 0 3px ${colors.safety}`,
        }}
      />
    );
  }
  if (isTransfer) {
    return (
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          boxSizing: 'border-box',
          border: `3px solid ${colors.textDim}`,
          background: colors.panel,
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: radii.full,
        background: color,
        flexShrink: 0,
      }}
    />
  );
}
