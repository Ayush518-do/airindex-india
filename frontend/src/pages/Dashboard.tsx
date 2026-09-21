import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import {
  getDashboardSummary, getIndexHistory, getRoutes, getAnomalies, getRegions,
  type DashboardSummary, type IndexHistory, type RouteRow, type AnomalyRow,
} from '../services/api';
import {
  Panel, StatCard, Loading, ErrorState, EmptyState, SEVERITY, inr,
  ACCENT, ACCENT_2, GRID, AXIS_INK, tooltipStyle, SERIES,
} from '../components/ui';

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [history, setHistory] = useState<IndexHistory | null>(null);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyRow[]>([]);
  const [regions, setRegions] = useState<{ region: string; index_value: number; route_count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, h, r, a, g] = await Promise.all([
          getDashboardSummary(), getIndexHistory(), getRoutes(), getAnomalies(), getRegions(),
        ]);
        setSummary(s); setHistory(h); setRoutes(r.routes);
        setAnomalies(a.anomalies); setRegions(g.regions);
      } catch (e: any) {
        setError(e?.response?.data?.detail ?? e?.message ?? 'Unable to reach the API.');
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <Loading label="Calculating airfare index…" />;
  if (error || !summary) return <ErrorState message={error ?? 'No data'} />;

  const trend = (history?.periods ?? []).map((p, i) => ({ period: p, index: history!.values[i] }));
  const basket = routes.filter(r => r.contribution != null)
    .sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[26px] font-semibold tracking-tight text-white">National Airfare Overview</h1>
        <p className="text-[13.5px] text-white/45 mt-1">
          Base {summary.base_period} = 100 · Current period {summary.calculation_period} ·
          Last calculated {new Date(summary.last_updated).toLocaleString('en-IN')}
        </p>
      </header>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Airfare Index" value={summary.current_index} decimals={1} delta={summary.index_change} />
        <StatCard label="Routes in Basket" value={summary.routes_covered} />
        <StatCard label="Airlines Covered" value={summary.airlines_covered} />
        <StatCard
          label="Data Quality" value={summary.data_quality_score * 100} decimals={0} suffix="%"
          footnote={`${summary.observations_count.toLocaleString('en-IN')} observations in period`}
        />
      </div>

      <Panel title="National Airfare Index" subtitle={`Weighted fixed-basket index, ${history?.base_period} = 100`}>
        {trend.length === 0 ? <EmptyState message="No index history yet." /> : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={trend} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id="idxFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="period" stroke={GRID} tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} />
              <YAxis
                stroke={GRID} width={50}
                domain={[(m: number) => Math.floor((m - 2) / 5) * 5, (m: number) => Math.ceil((m + 2) / 5) * 5]}
                tickFormatter={(v: number) => v.toFixed(0)}
                tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false}
              />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toFixed(2), 'Index']} />
              <Area type="monotone" dataKey="index" stroke={ACCENT} strokeWidth={2.5}
                fill="url(#idxFill)" dot={{ r: 3, fill: ACCENT }} activeDot={{ r: 6 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Route Contribution" subtitle={`Weight × price relative, ${summary.calculation_period}`}
          action={<Link to="/routes" className="text-[12.5px] text-[#9d86ff] hover:text-white">View all →</Link>}>
          {basket.length === 0 ? <EmptyState message="No basket routes." /> : (
            <ResponsiveContainer width="100%" height={Math.max(230, basket.length * 26)}>
              <BarChart data={basket.map(r => ({ route: `${r.origin}–${r.destination}`, contribution: r.contribution ?? 0 }))}
                layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 4 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" stroke={GRID} tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} />
                <YAxis type="category" dataKey="route" stroke={GRID} width={88}
                  tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={tooltipStyle}
                  formatter={(v: number) => [v.toFixed(2), 'Contribution']} />
                <Bar dataKey="contribution" fill={ACCENT} radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Regional Index" subtitle="By route origin region">
          {regions.length === 0 ? <EmptyState message="No regional data." /> : (
            <ResponsiveContainer width="100%" height={Math.max(230, regions.length * 48)}>
              <BarChart data={regions} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 4 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" domain={[95, 'dataMax + 3']} stroke={GRID}
                  tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} />
                <YAxis type="category" dataKey="region" stroke={GRID} width={88}
                  tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={tooltipStyle}
                  formatter={(v: number, _n, p: any) => [`${v.toFixed(2)} (${p.payload.route_count} routes)`, 'Index']} />
                <Bar dataKey="index_value" radius={[0, 5, 5, 0]}>
                  {regions.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <Panel title="Top Flagged Anomalies" subtitle="Largest deviations network-wide — flagged for review, never removed"
        action={<Link to="/anomalies" className="text-[12.5px] text-[#9d86ff] hover:text-white">View all →</Link>}>
        {anomalies.length === 0 ? <EmptyState message="No anomalies flagged." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/10">
                  <th className="py-2 font-medium">Severity</th>
                  <th className="py-2 font-medium">Route</th>
                  <th className="py-2 font-medium text-right">Observed</th>
                  <th className="py-2 font-medium text-right">Expected</th>
                  <th className="py-2 font-medium text-right">Deviation</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.slice(0, 6).map(a => {
                  const s = SEVERITY[a.severity] ?? { color: AXIS_INK, label: a.severity, icon: '●' };
                  return (
                    <tr key={a.id} className="border-b border-white/[0.06]">
                      <td className="py-2.5">
                        <span className="inline-flex items-center gap-1.5" style={{ color: s.color }}>
                          <span aria-hidden>{s.icon}</span><span className="font-medium">{s.label}</span>
                        </span>
                      </td>
                      <td className="py-2.5 text-white/80">{a.route ?? '—'}</td>
                      <td className="py-2.5 text-right tabular-nums text-white">{inr(a.fare)}</td>
                      <td className="py-2.5 text-right tabular-nums text-white/55">{inr(a.expected)}</td>
                      <td className="py-2.5 text-right tabular-nums" style={{ color: s.color }}>
                        {a.deviation >= 0 ? '+' : ''}{a.deviation.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
