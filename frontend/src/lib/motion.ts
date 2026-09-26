import { useEffect, useState } from 'react';

/**
 * Motion and input preferences, decided in one place.
 *
 * - `reduced`: the OS "reduce motion" setting. Heavy effects (WebGL
 *   background, blur-in text, cursor trails) switch off entirely — not just
 *   slow down — because for vestibular disorders the movement itself is the
 *   problem.
 * - `coarse`: a touch-first device. Cursor effects are meaningless without a
 *   cursor and would only fire on taps, so they switch off too.
 *
 * Both follow live changes (e.g. a user toggling the OS setting mid-session).
 */
function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

export function useCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)');
}

export function useMotionSettings() {
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  return {
    reduced,
    coarse,
    /** WebGL background, blur-in headings, scroll-in sections. */
    heavyEffects: !reduced,
    /** Blob trail, click sparks, magnetic buttons, card glare. */
    cursorEffects: !reduced && !coarse,
  };
}
