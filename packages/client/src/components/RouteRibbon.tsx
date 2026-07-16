/**
 * RouteRibbon (기획서 2a): the accepted-station flow.
 *
 * Passed stations drift left and dim; the current (latest accepted) station is
 * large; a ghost slot on the right hints at the next answer. Names come from the
 * server-provided display names in the route (no client-side id→name lookup).
 */

import type { RouteStop } from '../state/gameStore.js';
import { colors } from '../ui/theme.js';

export function RouteRibbon({ route }: { route: RouteStop[] }): JSX.Element {
  const last = route.length - 1;
  return (
    <div
      data-testid="route-ribbon"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        overflowX: 'auto',
        padding: '16px 8px',
        minHeight: 72,
      }}
    >
      {route.map((stop, i) => {
        const isCurrent = i === last;
        return (
          <div
            key={`${stop.station}-${i}`}
            data-testid={isCurrent ? 'route-current' : 'route-past'}
            style={{
              flex: '0 0 auto',
              fontSize: isCurrent ? 28 : 16,
              fontWeight: isCurrent ? 800 : 500,
              color: isCurrent ? colors.text : colors.textDim,
              opacity: isCurrent ? 1 : Math.max(0.35, 1 - (last - i) * 0.18),
              transition: 'all 160ms ease',
              whiteSpace: 'nowrap',
            }}
          >
            {stop.name}
            {!isCurrent && <span style={{ color: colors.ghost, margin: '0 4px' }}>→</span>}
          </div>
        );
      })}
      <div
        data-testid="route-ghost"
        style={{
          flex: '0 0 auto',
          fontSize: 22,
          color: colors.ghost,
          border: `2px dashed ${colors.ghost}`,
          borderRadius: 10,
          padding: '4px 16px',
          marginLeft: 8,
        }}
      >
        ?
      </div>
    </div>
  );
}
