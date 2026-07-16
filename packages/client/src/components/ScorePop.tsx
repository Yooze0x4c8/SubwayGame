/**
 * ScorePop (기획서 2a): a transient "+점수" pop on turn:accepted.
 *
 * Animation: rises upward and fades out over ~1.2 s (≤ 3 s per §7).
 * Uses a CSS keyframe injected once into the document head so no animation
 * library is needed. Respects prefers-reduced-motion.
 *
 * Preserves: data-testid="score-pop".
 */

import { useEffect, useRef, useState } from 'react';

import type { ScorePop as ScorePopModel } from '../state/gameStore.js';
import { colors, fonts } from '../ui/theme.js';

// Inject keyframes once.
const KEYFRAME_ID = 'subway-score-pop-kf';
function ensureKeyframes(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAME_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAME_ID;
  style.textContent = `
    @keyframes scorePop {
      0%   { opacity: 0; transform: translateY(0px) scale(0.7); }
      15%  { opacity: 1; transform: translateY(-6px) scale(1.15); }
      60%  { opacity: 1; transform: translateY(-18px) scale(1); }
      100% { opacity: 0; transform: translateY(-38px) scale(0.9); }
    }
    @media (prefers-reduced-motion: reduce) {
      @keyframes scorePop {
        0%   { opacity: 0; }
        20%  { opacity: 1; }
        80%  { opacity: 1; }
        100% { opacity: 0; }
      }
    }
  `;
  document.head.appendChild(style);
}

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
    ensureKeyframes();
  }, []);

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
        top: 16,
        right: 20,
        fontSize: 26,
        fontWeight: 900,
        fontFamily: fonts.mono,
        color: colors.scorePos,
        pointerEvents: 'none',
        zIndex: 20,
        animation: 'scorePop 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        textShadow: `0 0 12px ${colors.scorePos}88`,
        letterSpacing: '-0.02em',
      }}
    >
      +{pop.delta}
    </div>
  );
}
