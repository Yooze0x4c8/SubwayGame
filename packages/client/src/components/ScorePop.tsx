/**
 * ScorePop (기획서 2a): a transient "+점수" readout on turn:accepted.
 *
 * Set as a signage readout — mono, tabular, line-2 green on the sign face — and
 * it rises and clears in ~1.4 s (≤ 3 s per §7). The `sgScorePop` keyframe and its
 * reduced-motion variant live in index.css.
 *
 * Preserves: data-testid="score-pop".
 */

import { useEffect, useRef, useState } from 'react';

import type { ScorePop as ScorePopModel } from '../state/gameStore.js';
import { colors, fonts, radii } from '../ui/theme.js';

export function ScorePop({
  pop,
  onDone,
}: {
  pop: ScorePopModel | undefined;
  onDone: () => void;
}): JSX.Element | null {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pop) return;
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      onDone();
    }, 1400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // Re-run per unique pop id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pop?.id]);

  if (!pop || !visible) return null;

  return (
    <div
      data-testid="score-pop"
      style={{
        position: 'absolute',
        top: 14,
        right: 18,
        zIndex: 20,
        pointerEvents: 'none',
        padding: '4px 9px',
        borderRadius: radii.sm,
        background: colors.accent,
        color: '#fff',
        fontFamily: fonts.mono,
        fontSize: 20,
        fontWeight: 700,
        lineHeight: 1.15,
        fontVariantNumeric: 'tabular-nums',
        animation: 'sgScorePop 1.4s cubic-bezier(0.22, 1, 0.36, 1) forwards',
      }}
    >
      +{pop.delta}
    </div>
  );
}
