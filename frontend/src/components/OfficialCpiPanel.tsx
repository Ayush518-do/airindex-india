import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart, Line, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import {
  Panel, PanelSkeleton, EmptyState, ErrorState, InfoTip, SERIES, STATUS, GRID, INK, INK_3,
  tooltipStyle, fmtMonth, axisTick, axisLabel,
} from './ui';
import { GLOSSARY } from '../lib/glossary';
import { friendlyError, getOfficialCompare, type OfficialCompare } from '../services/api';

type Row = { period: string; official?: number | null; ours?: number | null };

/** Every month from first to last, so gaps (e.g. flights grounded in 2020) show as gaps. */
function monthRange(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export default function OfficialCpiPanel() {
  const [data, setData] = useState<OfficialCompare | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => { setError(null); getOfficialCompare().then(setData).catch(e => setError(friendlyError(e))); };
  useEffect(load, []);

  const { rows, gaps } = useMemo(() => {
    if (!data?.official) return { rows: [] as Row[], gaps: [] as string[] };
    const off = new Map(data.official.points.map(p => [p.period, p.index]));
    const ours = new Map((data.apix?.points ?? []).map(p => [p.period, p.linked_value]));
    const last = [data.official.latest_period, ...(data.apix?.points.map(p => p.period) ?? [])].sort().pop()!;
    const months = monthRange(data.official.first_period, last);
    const missing = months.filter(p => p <= data.official!.latest_period && !off.has(p));
    return {
      rows: months.map(p => ({ period: p, official: off.get(p) ?? null, ours: ours.get(p) ?? null })),
      gaps: missing,
    };
  }, [data]);

  const title = 'Official airfare index vs our live index';
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <PanelSkeleton height={300} />;
  if (!data.available || !data.official) {
    return (
      <Panel title={title} info={GLOSSARY.official.short}>
        <EmptyState title="Official figures not downloaded yet" message={data.message ?? undefined} />
      </Panel>
    );
  }

  const off = data.official;
  // Round axis from zero: an index level read from a truncated axis
  // exaggerates every move.
  const peak = Math.max(...off.points.map(p => p.index), ...(data.apix?.points ?? []).map(p => p.linked_value));
  const yMax = Math.ceil(peak / 50) * 50;
  const yTicks = Array.from({ length: yMax / 50 + 1 }, (_, i) => i * 50);
  const jump2020 = off.points.find(p => p.period === '2020-06');
  const overlap = data.overlap;
  const seasonal = data.seasonal;
  const thisMonth = seasonal?.months.find(m => m.month === seasonal.current_month);
  const ourStart = data.apix?.first_period;

  return (
    <Panel
      title={title}
      info={GLOSSARY.official.short}
      subtitle={<>The government's monthly airfare index (Ministry of Statistics, MoSPI) from {fmtMonth(off.first_period)} to {fmtMonth(off.latest_period)}, with our daily index shown on the same scale.</>}
    >
      {overlap && !overlap.available && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warn/20 bg-warn-soft px-4 py-3 text-[14px] text-ink">
          <span aria-hidden className="mt-0.5">ℹ️</span>
          <p>
            <b>We can't compare them directly yet.</b> Official data ends {fmtMonth(off.latest_period)};
            our live data started {ourStart ? fmtMonth(ourStart) : 'recently'}, so they don't share any months.
            {' '}The comparison appears once they overlap.{' '}
            <InfoTip label="Why not?">{GLOSSARY.pendingOverlap.long}</InfoTip>
          </p>
        </div>
      )}
      {overlap?.available && overlap.correlation != null && (
        <div className="mb-4 rounded-xl border border-good/20 bg-good-soft px-4 py-3 text-[14px] text-ink">
          Over {overlap.overlap_months} shared months, our index moved{' '}
          <b>{overlap.correlation >= 0.7 ? 'closely in step' : overlap.correlation >= 0.4 ? 'broadly in step' : 'differently from'}</b>{' '}
          {overlap.correlation >= 0.4 ? 'with' : ''} the official one (a match score of {overlap.correlation.toFixed(2)}, where 1 = perfectly in step),
          and was on average {overlap.mape_pct?.toFixed(1)}% away from it.
        </div>
      )}

      <div style={{ width: '100%', height: 300 }} role="img"
        aria-label={`Official airfare index from ${fmtMonth(off.first_period)} to ${fmtMonth(off.latest_period)}, rising from ${off.points[0].index} to ${off.points[off.points.length - 1].index}.`}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 22, left: 24 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="period" tickFormatter={p => String(p).slice(0, 4)} stroke={GRID} tick={axisTick}
              tickLine={false} minTickGap={40} label={axisLabel('Year')} />
            <YAxis stroke={GRID} width={48} tick={axisTick} tickLine={false} axisLine={false}
              domain={[0, yMax]} ticks={yTicks} label={{ ...axisLabel('Index (2012 = 100)', -90), offset: 0, dx: -14 }} />
            <Tooltip contentStyle={tooltipStyle}
              labelFormatter={p => fmtMonth(String(p))}
              formatter={(v: any, name: string) => [Number(v).toFixed(1), name === 'official' ? 'Official index' : 'Our live index (same scale)']} />
            <Legend verticalAlign="top" align="right" height={30}
              formatter={v => <span style={{ color: INK, fontSize: 13 }}>{v === 'official' ? 'Official (MoSPI)' : 'Ours (live, same scale)'}</span>} />
            <Line type="monotone" dataKey="official" stroke={SERIES.sky} strokeWidth={2} dot={false} connectNulls={false} />
            <Line type="monotone" dataKey="ours" stroke={SERIES.navy} strokeWidth={0}
              dot={{ r: 5, fill: SERIES.navy, stroke: '#fff', strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[13px] text-ink-3">
        Our index is placed on the official scale by starting it from the latest official value ({data.link?.official_index} in {data.link ? fmtMonth(data.link.period) : '—'}).
        {gaps.length > 0 && <> The break in {gaps.map(fmtMonth).join(', ')} is real: flights were grounded during the 2020 lockdown, so no official airfare figures were published.</>}
      </p>
      {jump2020 && (
        <p className="mt-2 flex items-start gap-2 text-[13px] leading-relaxed text-ink-3">
          <span aria-hidden>📌</span>
          <span>
            <b className="font-semibold text-ink-2">Why the big jump in 2020?</b> It's in the official data too, not an error:
            when flights restarted in May 2020 the government set minimum and maximum fares, and the official index
            roughly tripled — MoSPI recorded a {jump2020.inflation_pct != null ? `${Math.round(jump2020.inflation_pct)}%` : 'very large'} rise
            in June 2020 compared with a year earlier. Prices have stayed at the higher level since.
          </span>
        </p>
      )}

      {seasonal && seasonal.months.length > 0 && (
        <div className="mt-6">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            What usually happens to airfares each month
            <InfoTip>{GLOSSARY.seasonal.short}</InfoTip>
          </h3>
          {thisMonth && (
            <p className="mt-1 text-[14px] text-ink-2">
              In <b className="text-ink">{thisMonth.month}</b>, airfares usually{' '}
              {thisMonth.mean_change_pct >= 0
                ? <b style={{ color: STATUS.critical }}>rise about {thisMonth.mean_change_pct.toFixed(1)}%</b>
                : <b style={{ color: STATUS.good }}>fall about {Math.abs(thisMonth.mean_change_pct).toFixed(1)}%</b>}
              {' '}from the month before (average of {thisMonth.n_years} years of official data).
            </p>
          )}
          <div style={{ width: '100%', height: 200 }} className="mt-2" role="img"
            aria-label={`Average monthly change in airfares: ${seasonal.months.map(m => `${m.month} ${m.mean_change_pct >= 0 ? '+' : ''}${m.mean_change_pct}%`).join(', ')}.`}>
            <ResponsiveContainer>
              <ComposedChart data={seasonal.months} margin={{ top: 8, right: 16, bottom: 22, left: 16 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="month" tickFormatter={m => String(m).slice(0, 3)} stroke={GRID} tick={axisTick}
                  tickLine={false} interval={0} label={axisLabel('Month')} />
                <YAxis stroke={GRID} width={52} tick={axisTick} tickLine={false} axisLine={false}
                  tickFormatter={v => `${v > 0 ? '+' : ''}${v}%`} label={axisLabel('Usual change', -90)} />
                <ReferenceLine y={0} stroke={INK_3} strokeOpacity={0.4} />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={(v: any) => [`${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}% vs the month before`, 'Usual change']} />
                <Bar dataKey="mean_change_pct" radius={[4, 4, 4, 4]} maxBarSize={28}>
                  {seasonal.months.map(m => (
                    <Cell key={m.month}
                      fill={m.mean_change_pct >= 0 ? STATUS.critical : STATUS.good}
                      fillOpacity={m.month === seasonal.current_month ? 1 : 0.45} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[13px] text-ink-3">Red = prices usually rise, green = usually fall. This month is shown in full colour.</p>
        </div>
      )}
    </Panel>
  );
}
