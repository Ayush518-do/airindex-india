import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import PageHeader from './PageHeader';
import { Section } from './Motion';
import {
  Panel, PanelSkeleton, EmptyState, ErrorState, Badge, INK, INK_3, GRID, SERIES, STATUS,
  tooltipStyle, inr, fmtDate, axisTick, axisLabel,
} from './ui';
import { GLOSSARY } from '../lib/glossary';
import { useNarrow } from '../lib/motion';
import { routeLabel, routeShort } from '../lib/cities';
import { friendlyError, getFestivalSurge, type FestivalSurge, type SurgeRow } from '../services/api';

// A fixed colour per festival, so a festival keeps its colour whichever others
// are present. All clear 3:1 against white (checked).
const FESTIVAL_COLORS: Record<string, string> = {
  'Diwali': SERIES.orange,
  'Dussehra': SERIES.aqua,
  'Ganesh Chaturthi': SERIES.blue,
  'Holi': SERIES.violet,
  'Christmas / New Year': '#b3336c',
  'Chhath Puja': '#9a5b00',
};
const colorFor = (f: string) => FESTIVAL_COLORS[f] ?? '#5e6b85';

function change(pct: number) {
  if (Math.abs(pct) < 1) return <span className="text-ink-2">about the same</span>;
  return pct > 0
    ? <b style={{ color: STATUS.critical }}>{pct.toFixed(0)}% more expensive</b>
    : <b style={{ color: STATUS.good }}>{Math.abs(pct).toFixed(0)}% cheaper</b>;
}

function comparedOn(basis?: string | null) {
  return basis === 'same window'
    ? 'Ordinary days booked the same time ahead'
    : 'Ordinary days on this route';
}

export default function FestivalsTab({ routes }: { routes: string[] }) {
  const [data, setData] = useState<FestivalSurge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const narrow = useNarrow();

  const load = () => { setError(null); getFestivalSurge().then(setData).catch(e => setError(friendlyError(e))); };
  useEffect(load, []);

  const present = useMemo(() => Array.from(new Set((data?.surge ?? []).map(s => s.festival))), [data]);
  const rows = useMemo(() => routes.map(r => {
    const row: Record<string, string | number> = { route: r, tick: narrow ? r.replace('-', '→') : routeShort(r) };
    for (const s of data?.surge ?? []) if (s.route === r) row[s.festival] = s.surge_pct;
    return row;
  }), [data, routes, narrow]);
  const byFestival = useMemo(() => {
    const m = new Map<string, SurgeRow[]>();
    for (const s of data?.surge ?? []) m.set(s.festival, [...(m.get(s.festival) ?? []), s]);
    return m;
  }, [data]);

  const header = (
    <PageHeader title="How festivals change prices"
      lead="Flights around big festivals often cost more. Here's how much, route by route, compared with ordinary days." />
  );

  if (error) return <div className="space-y-5">{header}<ErrorState message={error} onRetry={load} /></div>;
  if (!data) return <div className="space-y-5">{header}<PanelSkeleton height={320} /></div>;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = data.festivals.filter(f => f.end >= today).slice(0, 6);

  return (
    <div className="space-y-5">
      {header}

      <Section>
        <Panel
          title="Festival price jump by route"
          info={GLOSSARY.festival.short}
          subtitle={`Based on ${data.n_records?.toLocaleString('en-IN') ?? 0} real fares we've checked. Bars above zero mean flights cost more during the festival.`}
        >
          {data.surge.length === 0 ? (
            <EmptyState icon="🪔" title="No festival prices yet"
              message={data.message ?? 'None of the flights we\'ve checked so far fall on a festival. As we check flights further ahead, festival dates will appear here.'} />
          ) : (
            <div style={{ width: '100%', height: 340 }} role="img"
              aria-label={`Festival price change by route. ${data.surge.map(s => `${s.festival}, ${routeLabel(s.route)}: ${s.surge_pct > 0 ? '+' : ''}${s.surge_pct}%`).join('; ')}.`}>
              <ResponsiveContainer>
                <BarChart data={rows} margin={{ top: 8, right: narrow ? 4 : 16, bottom: 36, left: narrow ? 0 : 16 }} barCategoryGap="22%" barGap={2}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="tick" stroke={GRID} tick={{ ...axisTick, fontSize: 11 }} tickLine={false} interval={0}
                    angle={narrow ? -40 : -18} textAnchor="end" height={narrow ? 56 : 48} label={axisLabel('Route', 0)} />
                  <YAxis stroke={GRID} width={56} tick={axisTick} tickLine={false} axisLine={false}
                    tickFormatter={v => `${v > 0 ? '+' : ''}${v}%`} label={axisLabel('Price change', -90)} />
                  <ReferenceLine y={0} stroke={INK_3} strokeOpacity={0.5} />
                  <Tooltip
                    contentStyle={tooltipStyle} cursor={{ fill: 'rgba(47,120,201,0.06)' }}
                    labelFormatter={(_l, payload) => routeLabel(String(payload?.[0]?.payload?.route ?? ''))}
                    formatter={(v: any, name: string, p: any) => {
                      const s = data.surge.find(x => x.route === p.payload.route && x.festival === name);
                      const n = Number(v);
                      const word = n > 0 ? `${n.toFixed(0)}% more expensive` : `${Math.abs(n).toFixed(0)}% cheaper`;
                      return [`${word} — ${inr(s?.festival_avg ?? 0)} vs ${inr(s?.normal_avg ?? 0)} on ordinary days`, name];
                    }}
                  />
                  <Legend verticalAlign="top" align="right" height={30}
                    formatter={v => <span style={{ color: INK, fontSize: 13 }}>{v}</span>} />
                  {present.map(f => <Bar key={f} dataKey={f} fill={colorFor(f)} radius={[4, 4, 0, 0]} maxBarSize={34} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </Section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {Array.from(byFestival.entries()).map(([festival, list]) => (
            <Section key={festival}>
              <Panel title={festival}
                subtitle={`${list.length} route${list.length === 1 ? '' : 's'} · fare during the festival vs ordinary days`}>
                <div className="-mx-1 overflow-x-auto px-1">
                  <table className="w-full min-w-[560px] text-[14px]">
                    <caption className="sr-only">{festival}: festival fares compared with ordinary days, by route</caption>
                    <thead className="text-left text-[13px] text-ink-3">
                      <tr>
                        <th scope="col" className="pb-2 pr-4 font-semibold">Route</th>
                        <th scope="col" className="pb-2 pr-4 font-semibold">During festival</th>
                        <th scope="col" className="pb-2 pr-4 font-semibold">Ordinary days</th>
                        <th scope="col" className="pb-2 pr-4 font-semibold">Difference</th>
                        <th scope="col" className="pb-2 font-semibold">Compared with</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {[...list].sort((a, b) => b.surge_pct - a.surge_pct).map(s => (
                        <tr key={s.route} className="border-t border-line text-ink-2">
                          <th scope="row" className="py-2 pr-4 text-left font-semibold text-ink">{s.label ?? routeLabel(s.route)}</th>
                          <td className="py-2 pr-4">{inr(s.festival_avg)}</td>
                          <td className="py-2 pr-4">{inr(s.normal_avg)}</td>
                          <td className="py-2 pr-4">{change(s.surge_pct)}</td>
                          <td className="py-2 text-[13px] text-ink-3">{comparedOn(s.basis)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </Section>
          ))}
        </div>

        <Section>
          <Panel title="Upcoming festivals"
            subtitle="Travel dates we treat as festival days (lunar festivals are approximate).">
            {upcoming.length === 0 ? (
              <EmptyState icon="📅" title="No upcoming festivals in our calendar" />
            ) : (
              <ul className="space-y-2">
                {upcoming.map(f => (
                  <li key={f.name + f.start}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                    <div>
                      <p className="text-[14px] font-semibold text-ink">{f.name}</p>
                      <p className="text-[13px] text-ink-3">{fmtDate(f.start)} – {fmtDate(f.end)}</p>
                    </div>
                    {byFestival.has(f.name) ? <Badge tone="good">Prices checked</Badge> : <Badge>Not checked yet</Badge>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
              We compare fares for travel on festival dates with nearby ordinary dates, booked the same number of days ahead where possible — so the difference reflects the festival, not how early people booked.
            </p>
          </Panel>
        </Section>
      </div>
    </div>
  );
}
