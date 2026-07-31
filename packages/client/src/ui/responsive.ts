/**
 * Responsive plumbing.
 *
 * The signage language is carried almost entirely by inline styles, which can't
 * express a media query. So breakpoints are read in JS and components branch on
 * them — that also lets the phone layout *drop* information rather than merely
 * reflow it (see the `isMobile` branches in RoomList, WaitingRoom, DualClock).
 *
 * Two separate concerns live here:
 *
 *   useIsMobile()      — "is this a phone-width screen", for layout decisions.
 *   useAppViewport()   — keeps `--app-height` in sync with the *visual* viewport
 *                        so a bottom-docked input stays above the soft keyboard.
 *
 * Why the second one exists: when the mobile keyboard opens, iOS Safari shrinks
 * the visual viewport but leaves the layout viewport (and therefore 100dvh)
 * untouched, so anything pinned to the bottom of a 100dvh box ends up behind the
 * keyboard. visualViewport.height is the only number that reports the space you
 * can actually see. `--app-viewport-top` compensates for iOS scrolling the layout
 * viewport out from under a position:fixed shell.
 */

import { useEffect, useState } from 'react';

/** Phone layout below this width. Matches the in-game sign's 720px max width. */
export const MOBILE_MAX_WIDTH = 720;
const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;

function matchMediaSafe(query: string): MediaQueryList | undefined {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return undefined;
  }
  return window.matchMedia(query);
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchMediaSafe(query)?.matches ?? false);

  useEffect(() => {
    const mql = matchMediaSafe(query);
    if (!mql) return;
    const onChange = (): void => setMatches(mql.matches);
    onChange();
    // jsdom's MediaQueryList has no listener API; nothing to subscribe to there.
    if (typeof mql.addEventListener !== 'function') return;
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** True on phone-width screens. False in jsdom, so tests keep the desktop tree. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}

/**
 * Publishes the visual viewport as CSS custom properties on <html>:
 *
 *   --app-height        the height you can actually see, keyboard subtracted
 *   --app-viewport-top  how far the layout viewport has been scrolled away
 *
 * Mounted once, from <App>. index.css seeds both with static fallbacks so the
 * first paint (and any browser without visualViewport) is still correct.
 */
export function useAppViewport(): void {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const root = document.documentElement;
    const vv = window.visualViewport ?? undefined;

    const apply = (): void => {
      const height = vv?.height ?? window.innerHeight;
      if (!height) return;
      root.style.setProperty('--app-height', `${Math.round(height)}px`);
      root.style.setProperty('--app-viewport-top', `${Math.round(vv?.offsetTop ?? 0)}px`);
    };

    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);

    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
    };
  }, []);
}

/**
 * Pull a just-focused field into view on phones. Belt-and-braces for the docked
 * layouts: if a browser resizes the layout viewport instead of the visual one,
 * the field can still end up under the keyboard until something scrolls it back.
 */
export function scrollFieldIntoView(el: HTMLElement | null): void {
  if (!el || typeof window === 'undefined') return;
  window.setTimeout(() => {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 250);
}
