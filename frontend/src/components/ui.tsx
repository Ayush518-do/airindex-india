import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import CountUp from './reactbits/CountUp';
import GlareHover from './reactbits/GlareHover';
import { useMotionSettings } from '../lib/motion';

/*
 * Chart and status tokens for the light theme. Surface/text colours live as
 * CSS variables in index.css (use the Tailwind names: text-ink, bg-surface…);
 * these constants exist only because Recharts needs literal colour strings.
 * Every value below was checked for contrast on white: series >= 4.5:1,
 * status text >= 5.4:1, axis labels 6.2:1.
 */

// Brand chrome (buttons, active tabs) — never a data series.
export const ACCENT = '#5a48d8';
export const ACCENT_INK = '#4a3bc4';

export const SERIES = {
  blue: '#2f78c9',    // our live index / actual fares
  orange: '#c2521d',  // model estimate
  aqua: '#0f7d5a',    // official government data
  violet: '#6a58e0',
} as const;

export const STATUS = { good: '#12703a', critical: '#b42318', warning: '#7a4f00' } as const;

// Heatmap: light = cheap, dark = expensive. Every step keeps its label at
// >= 4.77:1 by switching label colour (see heatLabel).
export const SEQ_RAMP = ['#e6f0fb', '#cfe2f7', '#b3d0f1', '#8fb8e8', '#6a9fdd', '#3874bd', '#2a64ab', '#1f5190', '#173f78'];

export const INK = '#14213d';
export const INK_3 = '#566179';
export const GRID = '#e3e9f2';
export const AXIS_INK = INK_3;

/** Dark text on light ramp steps, white on dark ones. */
export function heatLabel(bg: string): string {
  const h = bg.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.25 ? INK : '#ffffff';
}

export const tooltipStyle = {
  background: '#ffffff',
  border: '1px solid #e3e9f2',
  borderRadius: 12,
  boxShadow: '0 12px 32px -8px rgba(20,33,61,0.22)',
  fontSize: 13,
  color: INK,
} as const;

export const axisTick = { fill: AXIS_INK, fontSize: 12 } as const;
export const axisLabel = (value: string, angle = 0) =>
  ({ value, angle, position: angle ? 'insideLeft' : 'insideBottom', offset: angle ? 12 : -4,
     fill: AXIS_INK, fontSize: 12, style: { textAnchor: 'middle' } }) as const;

// ------------------------------------------------------------ formatting ---

/** Indian digit grouping: ₹7,172 · ₹1,25,000. */
export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Compact form for crowded chart axes: ₹7k, ₹12k, ₹1.2L. */
export const inrShort = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${Math.round(n / 1000)}k` : `₹${n}`;

export const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export const fmtLongDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

export const fmtMonth = (period: string) =>
  new Date(period + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

export const pct = (n: number, digits = 1) => `${Math.abs(n).toFixed(digits)}%`;

// ------------------------------------------------------------ primitives ---

/**
 * The "What does this mean?" (i) button. Opens on hover and keyboard focus,
 * toggles on tap (touch has no hover), closes on Escape or outside click, and
 * is announced to screen readers via aria-describedby.
 */
export function InfoTip({ children, label = 'What does this mean?' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex align-middle"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="grid h-[18px] w-[18px] place-items-center rounded-full border border-line-strong bg-surface
                   text-[11px] font-bold italic text-ink-3 transition-colors hover:border-accent hover:text-accent-ink"
      >
        i
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-[calc(100%+8px)] z-50 w-[min(300px,80vw)] -translate-x-1/2 rounded-xl
                     border border-line bg-surface p-3 text-left text-[13px] font-normal not-italic leading-relaxed
                     text-ink-2 shadow-pop"
        >
          {children}
        </span>
      )}
    </span>
  );
}

export function Panel({
  title, info, subtitle, children, className = '', action, id,
}: {
  title?: ReactNode; info?: ReactNode; subtitle?: ReactNode; children: ReactNode;
  className?: string; action?: ReactNode; id?: string;
}) {
  const headingId = useId();
  return (
    <section id={id} aria-labelledby={title ? headingId : undefined} className={`card p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 id={headingId} className="flex items-center gap-2 text-[16px] font-semibold tracking-tight text-ink">
                {title}
                {info && <InfoTip>{info}</InfoTip>}
              </h2>
            )}
            {subtitle && <p className="mt-1 text-[13px] text-ink-3">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** A number that counts up — or just appears, under reduced motion. */
export function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const { reduced } = useMotionSettings();
  const v = Number(value.toFixed(decimals));
  if (reduced) return <>{v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>;
  return <CountUp to={v} duration={1.1} separator="," />;
}

/**
 * A headline number card. The glare follows the mouse on desktop; it is
 * dropped on touch devices and under reduced motion.
 */
export function StatCard({
  label, info, value, decimals = 0, prefix = '', suffix = '', children, className = '',
}: {
  label: string; info?: ReactNode; value: number; decimals?: number; prefix?: string; suffix?: string;
  children?: ReactNode; className?: string;
}) {
  const { cursorEffects } = useMotionSettings();
  const body = (
    <div className="w-full p-5 text-left">
      <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {label}
        {info && <InfoTip>{info}</InfoTip>}
      </p>
      <p className="mt-2 text-[40px] font-semibold leading-none tracking-tight text-ink tabular-nums">
        {prefix}<AnimatedNumber value={value} decimals={decimals} />{suffix}
      </p>
      {children}
    </div>
  );
  if (!cursorEffects) return <div className={`card h-full ${className}`}>{body}</div>;
  return (
    <GlareHover
      width="100%" height="100%" background="#ffffff" borderRadius="1rem" borderColor="#e3e9f2"
      glareColor="#9fb9e0" glareOpacity={0.35} glareAngle={-35} glareSize={220} transitionDuration={700}
      className={`!block !cursor-default shadow-card ${className}`}
    >
      {body}
    </GlareHover>
  );
}

/** Direction of change in words and colour — never colour alone. */
export function Delta({ value, suffix = 'vs the previous check' }: { value: number | null | undefined; suffix?: string }) {
  if (value == null) return null;
  if (Math.abs(value) < 0.05) {
    return <p className="mt-2 text-[14px] text-ink-2">No change {suffix}</p>;
  }
  const up = value > 0;
  return (
    <p className="mt-2 text-[14px] font-medium" style={{ color: up ? STATUS.critical : STATUS.good }}>
      <span aria-hidden>{up ? '▲' : '▼'}</span> {pct(value, 2)} {up ? 'more expensive' : 'cheaper'}
      <span className="font-normal text-ink-3"> {suffix}</span>
    </p>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

export function PanelSkeleton({ height = 260, title = true }: { height?: number; title?: boolean }) {
  return (
    <div className="card p-5" role="status" aria-label="Loading">
      {title && <Skeleton className="mb-2 h-4 w-48" />}
      {title && <Skeleton className="mb-5 h-3 w-72 max-w-full" />}
      <div style={{ height }} className="skeleton w-full" />
    </div>
  );
}

/** A friendly "nothing here yet" that always says why. */
export function EmptyState({ title, message, icon = '⏳', children }: {
  title: string; message?: ReactNode; icon?: string; children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full bg-sky-soft text-[20px]">{icon}</span>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {message && <p className="max-w-md text-[14px] leading-relaxed text-ink-2">{message}</p>}
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex flex-col items-center gap-3 p-8 text-center">
      <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full bg-bad-soft text-[20px]">!</span>
      <p className="text-[15px] font-semibold text-ink">We couldn't load this</p>
      <p className="max-w-md text-[14px] text-ink-2">{message}</p>
      {onRetry && <button onClick={onRetry} className="btn-ghost">Try again</button>}
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: {
  children: ReactNode; tone?: 'neutral' | 'warn' | 'good' | 'bad' | 'accent' | 'sky';
}) {
  const cls = {
    neutral: 'bg-surface-2 text-ink-2 border-line',
    warn: 'bg-warn-soft text-warn border-warn/20',
    good: 'bg-good-soft text-good border-good/20',
    bad: 'bg-bad-soft text-bad border-bad/20',
    accent: 'bg-accent-soft text-accent-ink border-accent/20',
    sky: 'bg-sky-soft text-sky-ink border-sky/20',
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}
