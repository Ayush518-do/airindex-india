import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts';
import { Panel, SERIES, GRID, AXIS_INK, tooltipStyle, inr, Loading } from './ui';
import type { RouteTrend } from '../services/api';

export function FilterPanel({ routes, route, onRoute, dateFrom, dateTo, onDates, nonstop, onNonstop }: {
  routes: string[]; route: string; onRoute: (r: string) => void;
  dateFrom: string; dateTo: string; onDates: (from: string, to: string) => void;
  nonstop: boolean; onNonstop: (v: boolean) => void;
}) {
  const field = 'bg-white/[0.05] border border-white/10 rounded-lg px-3 py-1.5 text-[13px] text-white focus:outline-none focus:border-[#7c5cff]/60';
  return (
    <div className="glass rounded-2xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
      <label className="flex items-center gap-2 text-[12.5px] text-white/55">
        Route
        <select value={route} onChange={e => onRoute(e.target.value)} className={field}>
          {routes.map(r => <option key={r} value={r} className="bg-[#131320]">{r}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-[12.5px] text-white/55">
        Travel from
        <input type="date" value={dateFrom} onChange={e => onDates(e.target.value, dateTo)} className={field} />
      </label>
      <label className="flex items-center gap-2 text-[12.5px] text-white/55">
        to
        <input type="date" value={dateTo} onChange={e => onDates(dateFrom, e.target.value)} className={field} />
      </label>
      <label className="flex items-center gap-2 text-[12.5px] text-white/55 cursor-pointer">
        <input type="checkbox" checked={nonstop} onChange={e => onNonstop(e.target.checked)} className="accent-[#7c5cff]" />
        Nonstop only
      </label>
      <span className="ml-auto text-[11.5px] text-white/35">Filters scope every panel below</span>
    </div>
  );
}

export function ElasticityChart({ trend }: { trend: RouteTrend | null }) {
  if (!trend) return <Panel title="Fare vs advance purchase"><Loading label="Loading route…" /></Panel>;
  const rows = trend.windows.map(w => ({ ...w, label: `${w.window} d` }));
  const hasPred = trend.windows.some(w => w.predicted_avg != null);
  return (
    <Panel
      title={`Fare vs advance purchase · ${trend.route}`}
      subtitle={`Mean nonstop economy fare per booking window${trend.date ? ` · scraped ${trend.date}` : ''} · bars = actual${hasPred ? ', dashed = model prediction' : ' (model overlay arrives in step 7)'}`}
    >
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 8 }} barCategoryGap="28%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" stroke={GRID} tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} />
            <YAxis stroke={GRID} width={58} tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(1)}k`} />
            <Tooltip
              contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              formatter={(v: any, name: string) => [v == null ? '—' : inr(Number(v)), name === 'actual_avg' ? 'Actual (mean)' : 'Predicted']}
              labelFormatter={(l) => `${l}ays before departure`}
            />
            {hasPred && (
              <Legend
                verticalAlign="top" align="right" height={28}
                formatter={(v) => <span style={{ color: AXIS_INK, fontSize: 12 }}>{v === 'actual_avg' ? 'Actual (scraped)' : 'Predicted (model)'}</span>}
              />
            )}
            <Bar dataKey="actual_avg" fill={SERIES.blue} radius={[4, 4, 0, 0]} maxBarSize={56}>
              {rows.map((_, i) => <Cell key={i} fill={SERIES.blue} />)}
            </Bar>
            {hasPred && (
              <Line type="monotone" dataKey="predicted_avg" stroke={SERIES.orange} strokeWidth={2} strokeDasharray="6 4" connectNulls dot={{ r: 4, fill: SERIES.orange, strokeWidth: 2, stroke: '#131320' }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {trend.carriers.map(c => (
          <div key={c.carrier} className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2">
            <p className="text-[11px] text-white/40 truncate" title={c.carrier_name ?? c.carrier}>{c.carrier_name ?? c.carrier} · {c.n} fares</p>
            <p className="text-[15px] font-semibold text-white">{inr(c.avg_fare)}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}
