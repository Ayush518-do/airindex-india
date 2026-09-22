import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Cell,
} from 'recharts';
import { Panel, Loading, ErrorState, SERIES, GRID, AXIS_INK, tooltipStyle, inr, fmtDate, Badge } from './ui';
import { getFestivalSurge, type FestivalSurge, type SurgeRow } from '../services/api';

// Fixed slot per festival name so colours never depend on which festivals happen to be present.
const FESTIVAL_COLORS: Record<string, string> = {
  'Diwali': SERIES.orange,
  'Dussehra': SERIES.aqua,
  'Ganesh Chaturthi': SERIES.blue,
  'Chhath Puja': '#c98500',
  'Christmas / New Year': '#d55181',
  'Holi': '#9085e9',
};
const colorFor = (f: string) => FESTIVAL_COLORS[f] ?? '#e66767';

export default function FestivalsTab({ routes }: { routes: string[] }) {
  const [data, setData] = useState<FestivalSurge | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFestivalSurge().then(setData).catch(e => setError(e?.message ?? 'Failed to load'));
  }, []);

  const festivalsPresent = useMemo(
    () => Array.from(new Set((data?.surge ?? []).map(s => s.festival))), [data],
  );
  const rows = useMemo(() => routes.map(r => {
    const row: Record<string, any> = { route: r };
    for (const s of data?.surge ?? []) if (s.route === r) row[s.festival] = s.surge_pct;
    return row;
  }), [data, routes]);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (data?.festivals ?? []).filter(f => f.end >= today).slice(0, 6);

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading label="Aggregating festival fares…" />;

  const byFestival = new Map<string, SurgeRow[]>();
  for (const s of data.surge) byFestival.set(s.festival, [...(byFestival.get(s.festival) ?? []), s]);

  return (
    <div className="space-y-5">
      <Panel
        title="Festival surge by route"
        subtitle={`Mean nonstop economy fare on festival travel dates vs non-festival dates for the same route · % above normal · ${data.n_records ?? 0} real scraped fares`}
      >
        {data.surge.length === 0 ? (
          <p className="text-[13px] text-white/40 py-8 text-center">No scraped travel dates fall inside a festival window yet.</p>
        ) : (
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }} barCategoryGap="22%" barGap={2}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="route" stroke={GRID} tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} />
                <YAxis stroke={GRID} width={48} tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={v => `${v > 0 ? '+' : ''}${v}%`} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
                <Tooltip
                  contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  formatter={(v: any, name: string, p: any) => {
                    const s = data.surge.find(x => x.route === p.payload.route && x.festival === name);
                    return [`${v > 0 ? '+' : ''}${v}%  (${inr(s?.festival_avg ?? 0)} vs ${inr(s?.normal_avg ?? 0)} · n=${s?.n_festival}/${s?.n_normal} · ${s?.basis})`, name];
                  }}
                />
                <Legend verticalAlign="top" align="right" height={28} formatter={v => <span style={{ color: AXIS_INK, fontSize: 12 }}>{v}</span>} />
                {festivalsPresent.map(f => (
                  <Bar key={f} dataKey={f} fill={colorFor(f)} radius={[4, 4, 0, 0]} maxBarSize={36}>
                    {rows.map((_, i) => <Cell key={i} fill={colorFor(f)} />)}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          {Array.from(byFestival.entries()).map(([f, list]) => (
            <Panel key={f} title={f} subtitle={`${list.length} routes · windows ${Array.from(new Set(list.flatMap(s => s.windows ?? []))).join(', ') || '—'} days out`}>
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead className="text-white/40 text-left">
                    <tr>{['Route', 'Festival mean', 'Normal mean', 'Surge', 'n festival / normal', 'Baseline'].map(h => <th key={h} className="font-medium pb-2 pr-4 whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {list.sort((a, b) => b.surge_pct - a.surge_pct).map(s => (
                      <tr key={s.route} className="border-t border-white/[0.06] text-white/80">
                        <td className="py-1.5 pr-4 font-medium text-white">{s.route}</td>
                        <td className="py-1.5 pr-4">{inr(s.festival_avg)}</td>
                        <td className="py-1.5 pr-4">{inr(s.normal_avg)}</td>
                        <td className="py-1.5 pr-4 font-semibold" style={{ color: s.surge_pct >= 0 ? '#fab219' : '#0ca30c' }}>
                          {s.surge_pct > 0 ? '+' : ''}{s.surge_pct}%
                        </td>
                        <td className="py-1.5 pr-4 text-white/55">{s.n_festival} / {s.n_normal}</td>
                        <td className="py-1.5 pr-4 text-white/45">{s.basis}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))}
        </div>

        <Panel title="Festival travel windows" subtitle="Hard-coded calendar used to tag fares (approximate for lunar dates)">
          <ul className="space-y-2">
            {upcoming.map(f => (
              <li key={f.name + f.start} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2">
                <div>
                  <p className="text-[13px] font-medium text-white">{f.name}</p>
                  <p className="text-[11.5px] text-white/45">{fmtDate(f.start)} → {fmtDate(f.end)}</p>
                </div>
                {byFestival.has(f.name) ? <Badge tone="good">scraped</Badge> : <Badge>not yet in data</Badge>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11.5px] text-white/35">
            Surge is computed within the same advance-purchase window when a non-festival fare exists for it; otherwise against the route's overall non-festival mean (labelled "route overall").
          </p>
        </Panel>
      </div>
    </div>
  );
}
