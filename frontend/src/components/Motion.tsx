import type { ReactNode } from 'react';
import AnimatedContent from './reactbits/AnimatedContent';
import Magnet from './reactbits/Magnet';
import { useMotionSettings } from '../lib/motion';

/**
 * A section that eases in as it scrolls into view. Short distance and
 * duration so it reads as polish, not a wait. The content is always in the
 * DOM from the first render, so data loading is never gated on the animation;
 * under reduced motion it is a plain div.
 */
export function Section({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const { heavyEffects } = useMotionSettings();
  if (!heavyEffects) return <div>{children}</div>;
  return (
    <AnimatedContent distance={24} duration={0.55} ease="power2.out" initialOpacity={0} threshold={0.08} delay={delay}>
      {children}
    </AnimatedContent>
  );
}

/**
 * Primary buttons drift gently toward the cursor. Weak pull and a small
 * radius — a hint of responsiveness, never a chase. Off on touch devices and
 * under reduced motion.
 */
export function MagnetButton({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { cursorEffects } = useMotionSettings();
  if (!cursorEffects) return <span className={`inline-flex ${className}`}>{children}</span>;
  return (
    <Magnet padding={40} magnetStrength={6} wrapperClassName={`inline-flex ${className}`}>
      {children}
    </Magnet>
  );
}
