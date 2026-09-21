import type { ReactNode } from 'react';
import CountUp from './reactbits/CountUp';
import SpotlightCard from './reactbits/SpotlightCard';

export const ACCENT = '#7c5cff';
export const ACCENT_2 = '#22d3ee';
export const GRID = 'rgba(255,255,255,0.07)';
export const AXIS_INK = '#6b6b85';

export const SERIES = ['#7c5cff', '#22d3ee', '#f0a020', '#ff5c8a', '#3ddc91', '#5c9dff'];

export const SEVERITY: Record<string, { color: string; label: string; icon: string }> = {
  CRITICAL_ANOMALY: { color: '#ff4d6d', label: 'Critical', icon: '▲' },
  HIGH_ANOMALY: { color: '#ff9f43', label: 'High', icon: '▲' },
  LOW_ANOMALY: { color: '#ffd23f', label: 'Low', icon: '●' },
};

export const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export function Panel({
  title, subtitle, children, className = '', action,
}: {
  title?: string; subtitle?: string; children: ReactNode; className?: string; action?: ReactNode;
}) {
  return (
    <section className={`glass rounded-2xl p-5 rise ${className}`}>
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
  label, value, decimals = 0, prefix = '', suffix = '', delta, footnote,
}: {
  label: string; value: number; decimals?: number; prefix?: string; suffix?: string;
  delta?: number | null; footnote?: string;
}) {
  return (
    <SpotlightCard
      className="!rounded-2xl !border-white/10 !bg-[rgba(19,19,32,0.66)] !p-5 backdrop-blur-xl rise"
      spotlightColor="rgba(124, 92, 255, 0.22)"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-white/40">{label}</p>
      <p className="mt-2 text-[34px] leading-none font-semibold text-white">
        {prefix}
        <CountUp to={Number(value.toFixed(decimals))} duration={1.1} separator="," />
        {suffix}
      </p>
      {delta != null && (
        <p className="mt-2 text-[13px]" style={{ color: delta >= 0 ? '#3ddc91' : '#ff4d6d' }}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(2)}% vs prior period
        </p>
      )}
      {footnote && <p className="mt-2 text-[12px] text-white/35">{footnote}</p>}
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

export const tooltipStyle = {
  background: 'rgba(14,14,24,0.95)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  fontSize: 13,
  color: '#e8e8f0',
} as const;
