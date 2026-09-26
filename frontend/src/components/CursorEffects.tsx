import BlobCursor from './reactbits/BlobCursor';
import ClickSpark from './reactbits/ClickSpark';
import { useMotionSettings } from '../lib/motion';

/**
 * Page-wide cursor effects: a soft trail that follows the mouse, and a small
 * spark on click. Both are decorative and aria-hidden, never intercept input,
 * and are not mounted at all on touch devices or under reduced motion.
 *
 * Deliberately restrained: the native cursor stays visible (a replaced cursor
 * hurts precision on charts and forms), and BlobCursor's SVG "goo" filter is
 * off — it blurs a full-viewport layer on every mouse move, which is a lot of
 * GPU for a flourish.
 */
export default function CursorEffects() {
  const { cursorEffects } = useMotionSettings();
  if (!cursorEffects) return null;
  return (
    <>
      <BlobCursor
        useFilter={false}
        trailCount={3}
        sizes={[14, 26, 20]}
        innerSizes={[6, 10, 8]}
        fillColor="rgba(106, 88, 224, 0.28)"
        innerColor="rgba(255, 255, 255, 0.85)"
        opacities={[0.9, 0.5, 0.35]}
        shadowColor="rgba(0,0,0,0)"
        shadowBlur={0}
        shadowOffsetX={0}
        shadowOffsetY={0}
        fastDuration={0.12}
        slowDuration={0.5}
        zIndex={55}
      />
      <ClickSpark sparkColor="#5a48d8" sparkSize={8} sparkRadius={16} sparkCount={8} duration={380} />
    </>
  );
}
