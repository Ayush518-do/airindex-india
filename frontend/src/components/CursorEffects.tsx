import ContrailCursor from './ContrailCursor';
import ClickSpark from './reactbits/ClickSpark';
import { useMotionSettings } from '../lib/motion';

/**
 * Page-wide cursor effects: a thin sky-blue contrail that follows the mouse
 * and fades behind it, and a small peach spark on click. Both are decorative
 * and aria-hidden, never intercept input, and are not mounted at all on
 * touch devices or under reduced motion.
 *
 * The native cursor stays visible — a replaced cursor hurts precision on
 * charts and forms.
 */
export default function CursorEffects() {
  const { cursorEffects } = useMotionSettings();
  if (!cursorEffects) return null;
  return (
    <>
      <ContrailCursor />
      <ClickSpark sparkColor="#d9895a" sparkSize={8} sparkRadius={16} sparkCount={8} duration={380} />
    </>
  );
}
