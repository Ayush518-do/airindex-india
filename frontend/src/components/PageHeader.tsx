import type { ReactNode } from 'react';
import BlurText from './reactbits/BlurText';
import { useMotionSettings } from '../lib/motion';

/**
 * Page title + one-line explanation.
 *
 * BlurText renders a <p> of per-word spans, which would lose heading
 * semantics. So the real <h1> is always present for screen readers and
 * document outline; the animated copy is decorative (aria-hidden) and only
 * rendered when motion is welcome.
 */
export default function PageHeader({ title, lead, children }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  const { heavyEffects } = useMotionSettings();
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {heavyEffects ? (
          <>
            <h1 className="sr-only">{title}</h1>
            <div aria-hidden className="font-display text-[36px] leading-[1.1] text-ink sm:text-[44px]">
              <BlurText text={title} delay={60} animateBy="words" direction="top" stepDuration={0.28} />
            </div>
          </>
        ) : (
          <h1 className="font-display text-[36px] leading-[1.1] text-ink sm:text-[44px]">{title}</h1>
        )}
        {lead && <p className="mt-2 max-w-2xl text-[16px] leading-relaxed text-ink-2">{lead}</p>}
      </div>
      {children}
    </header>
  );
}
