import type { ReactNode } from 'react';
import CountUp from './reactbits/CountUp';
import SpotlightCard from './reactbits/SpotlightCard';

// Brand chrome (buttons, active tabs, spotlight) — not used for data series.
export const ACCENT = '#7c5cff';

// Data-series colors: validated dark-mode categorical slots (CVD-safe adjacent pairs).
export const SERIES = {
  blue: '#3987e5',    // slot 1 — index, actual fares
  orange: '#d95926',  // slot 2 — predicted / model overlay
  aqua: '#199e70',    // slot 3 — DGCA reference
  violet: '#9085e9',
} as const;

// Status colors are reserved for good/bad meaning only (day-over-day delta, alerts).
export const STATUS = { good: '#0ca30c', critical: '#d03b3b', warning: '#fab219' } as const;

// Sequential blue ramp for the heatmap, dark-surface end (600) -> light end (200).
export const SEQ_RAMP = ['#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4'];

export const GRID = '#2c2c2a';
export const AXIS_INK = '#898781';
export const INK_2 = '#c3c2b7';

export const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export function Panel({
  title, subtitle, children, className = '', action, id,
}: {
  title?: string; subtitle?: string; children: ReactNode; className?: string; action?: ReactNode; id?: string;
}) {
  return (
    <section id={id} className={`glass rounded-2xl p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-white tracking-tight">{title}</h2>}
            {subtitle && <p className="text-[13px] text-white/45 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label, value, decimals = 0, prefix = '', suffix = '', delta, deltaLabel = 'vs yesterday', footnote, children,
}: {
  label: string; value: number; decimals?: number; prefix?: string; suffix?: string;
  delta?: number | null; deltaLabel?: string; footnote?: ReactNode; children?: ReactNode;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <SpotlightCard
      className="!rounded-2xl !border-white/10 !bg-[rgba(19,19,32,0.66)] !p-5 backdrop-blur-xl"
      spotlightColor="rgba(124, 92, 255, 0.22)"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-white/40">{label}</p>
      <p className="mt-2 text-[38px] leading-none font-semibold text-white">
        {prefix}
        <CountUp to={Number(value.toFixed(decimals))} duration={1.1} separator="," />
        {suffix}
      </p>
      {delta != null && (
        <p className="mt-2 text-[13px] font-medium" style={{ color: up ? STATUS.good : STATUS.critical }}>
          <span aria-hidden>{up ? '▲' : '▼'}</span> {Math.abs(delta).toFixed(2)}%
          <span className="text-white/40 font-normal"> {deltaLabel}</span>
        </p>
      )}
      {footnote && <p className="mt-2 text-[12px] text-white/35">{footnote}</p>}
      {children}
    </SpotlightCard>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-white/50 py-16 justify-center">
      <span className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="glass rounded-2xl p-8 text-center">
      <p className="text-white font-semibold mb-1">Unable to load data</p>
      <p className="text-[13px] text-white/50">{message}</p>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="text-[13px] text-white/40 text-center py-12">{message}</p>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'good' }) {
  const cls = {
    neutral: 'bg-white/[0.06] text-white/60 border-white/10',
    warn: 'bg-amber-400/15 text-amber-300 border-amber-400/25',
    good: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/25',
  }[tone];
  return (
    <span className={`inline-block text-[10px] font-semibold tracking-wide px-2 py-1 rounded border ${cls}`}>
      {children}
    </span>
  );
}

export const tooltipStyle = {
  background: 'rgba(14,14,24,0.96)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  fontSize: 13,
  color: '#e8e8f0',
} as const;
