/**
 * ScorePop (기획서 2a): a transient "+점수" pop on turn:accepted.
 *
 * Reads the store's `scorePop` (keyed by a monotonic id so repeated identical
 * deltas still re-trigger) and fades it after a short delay.
 */

import { useEffect, useState } from 'react';

import type { ScorePop as ScorePopModel } from '../state/gameStore.js';
import { colors } from '../ui/theme.js';

export function ScorePop({
  pop,
  onDone,
}: {
  pop: ScorePopModel | undefined;
  onDone: () => void;
}): JSX.Element | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!pop) return;
    setVisible(true);
    const id = setTimeout(() => {
      setVisible(false);
      onDone();
    }, 1200);
    return () => clearTimeout(id);
    // Re-run per unique pop id.
  }, [pop?.id, onDone, pop]);

  if (!pop || !visible) return null;

  return (
    <div
      data-testid="score-pop"
      style={{
        position: 'absolute',
        top: 8,
        right: 12,
        fontSize: 22,
        fontWeight: 900,
        color: colors.accent,
        pointerEvents: 'none',
      }}
    >
      +{pop.delta}
    </div>
  );
}
