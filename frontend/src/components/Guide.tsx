import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMotionSettings } from '../lib/motion';

const KEY = 'airindex_guide_done';

export function guideDone(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return true; }
}
function markDone() { try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ } }
export function resetGuide() { try { localStorage.removeItem(KEY); } catch { /* private mode */ } }

const STEPS = [
  {
    target: '[data-tour="index"]',
    title: "Today's airfare index",
    body: 'One number for how expensive flying is today. 100 = prices on our first day; 110 would mean fares are 10% higher.',
  },
  {
    target: '[data-tour="prices"]',
    title: 'Prices by route',
    body: 'Each row is a route, each column is how far ahead you book. Darker = more expensive. Tap a route to see the best time to book it.',
  },
  {
    target: '[data-tour="festivals-tab"]',
    title: 'Festival prices',
    body: 'See how much fares jump around Diwali and other festivals, route by route.',
  },
  {
    target: '[data-tour="alerts-tab"]',
    title: 'Get a price alert',
    body: "Pick a route and add your email. We'll tell you when it gets cheaper than usual — no account needed.",
  },
] as const;

type Rect = { top: number; left: number; width: number; height: number };

/**
 * A short, skippable first-visit tour. Non-modal: the page stays usable and
 * scrollable behind it. Esc or "Skip" ends it for good; it can be replayed
 * from How it works.
 */
export default function Guide({ onClose }: { onClose: () => void }) {
  const { reduced } = useMotionSettings();
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vw, setVw] = useState(window.innerWidth);
  const nextRef = useRef<HTMLButtonElement>(null);
  const s = STEPS[step];

  const finish = useCallback(() => { markDone(); onClose(); }, [onClose]);

  const measure = useCallback(() => {
    const el = document.querySelector(s.target);
    setVw(window.innerWidth);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [s.target]);

  useLayoutEffect(() => {
    const el = document.querySelector(s.target);
    el?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    measure();
    // Re-measure through the smooth scroll and on any later scroll/resize.
    const t = window.setTimeout(measure, 450);
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, [s.target, measure, reduced]);

  useEffect(() => { nextRef.current?.focus(); }, [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight' && step < STEPS.length - 1) setStep(step + 1);
      if (e.key === 'ArrowLeft' && step > 0) setStep(step - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [finish, step]);

  const last = step === STEPS.length - 1;
  const pad = 8;
  const mobile = vw < 640;
  const cardW = Math.min(340, vw - 32);
  // Below the target when there's room, otherwise above; pinned to the bottom on phones.
  let cardStyle: React.CSSProperties;
  if (mobile || !rect) {
    cardStyle = { left: 16, right: 16, bottom: 16 };
  } else {
    const below = rect.top + rect.height + pad + 12;
    const fitsBelow = below + 220 < window.innerHeight;
    cardStyle = {
      width: cardW,
      left: Math.max(16, Math.min(rect.left, vw - cardW - 16)),
      top: fitsBelow ? below : undefined,
      bottom: fitsBelow ? undefined : window.innerHeight - rect.top + pad + 12,
    };
  }

  return (
    <div className="fixed inset-0 z-[70] pointer-events-none">
      {rect && (
        <div
          aria-hidden
          className="absolute rounded-2xl ring-2 ring-accent transition-all duration-300 motion-reduce:transition-none"
          style={{
            top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(20, 33, 61, 0.38)',
          }}
        />
      )}
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="guide-title"
        aria-describedby="guide-body"
        className="pointer-events-auto absolute rounded-2xl border border-line bg-surface p-5 shadow-pop"
        style={cardStyle}
      >
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-accent-ink">
          Quick tour · {step + 1} of {STEPS.length}
        </p>
        <h2 id="guide-title" className="mt-1 text-[17px] font-semibold text-ink">{s.title}</h2>
        <p id="guide-body" className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{s.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={finish} className="mr-auto text-[14px] text-ink-3 underline-offset-2 hover:text-ink hover:underline">
            Skip tour
          </button>
          {step > 0 && <button onClick={() => setStep(step - 1)} className="btn-ghost !py-1.5">Back</button>}
          <button ref={nextRef} onClick={() => (last ? finish() : setStep(step + 1))} className="btn-primary !py-1.5">
            {last ? 'Got it' : 'Next'}
          </button>
        </div>
        <div aria-hidden className="mt-3 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
