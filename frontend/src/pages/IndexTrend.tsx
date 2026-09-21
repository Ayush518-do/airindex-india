import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  getIndexHistory, getDashboardSummary, getRegions,
  type IndexHistory, type DashboardSummary,
} from '../services/api';
import {
  Panel, StatCard, Loading, ErrorState, EmptyState,
  ACCENT, GRID, AXIS_INK, tooltipStyle,
} from '../components/ui';

export default function IndexTrend() {
  const [history, setHistory] = useState<IndexHistory | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [regions, setRegions] = useState<{ region: string; index_value: number; route_count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [h, s, g] = await Promise.all([getIndexHistory(), getDashboardSummary(), getRegions()]);
        setHistory(h); setSummary(s); setRegions(g.regions);
      } catch (e: any) {
        setError(e?.response?.data?.detail ?? e?.message ?? 'Unable to load index.');
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <Loading />;
  if (error || !history || !summary) return <ErrorState message={error ?? 'No data'} />;

  const rows = history.periods.map((p, i) => {
    const v = history.values[i];
    const prev = i > 0 ? history.values[i - 1] : null;
    return {
      period: p, index: v,
      mom: prev != null ? ((v - prev) / prev) * 100 : null,
      cumulative: ((v - 100) / 100) * 100,
    };
  });

  const peak = rows.reduce((a, b) => (b.index > a.index ? b : a), rows[0]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[26px] font-semibold tracking-tight text-white">Airfare Index</h1>
        <p className="text-[13.5px] text-white/45 mt-1">
          Weighted fixed-basket price index · base {history.base_period} = 100
        </p>
      </header>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Current Index" value={summary.current_index} decimals={1} delta={summary.index_change} />
        <StatCard label="Cumulative Change" value={rows[rows.length - 1]?.cumulative ?? 0} decimals={1} suffix="%"
          footnote={`Since ${history.base_period}`} />
        <StatCard label="Peak Index" value={peak?.index ?? 0} decimals={1} footnote={`Recorded ${peak?.period}`} />
        <StatCard label="Periods Tracked" value={history.periods.length} />
      </div>

      <Panel title="Index Trend" subtitle="Monthly index values against the base period">
        {rows.length === 0 ? <EmptyState message="No index history." /> : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="period" stroke={GRID} tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} />
              <YAxis stroke={GRID} width={50}
                domain={[(m: number) => Math.floor((m - 2) / 5) * 5, (m: number) => Math.ceil((m + 2) / 5) * 5]}
                tickFormatter={(v: number) => v.toFixed(0)}
                tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toFixed(2), 'Index']} />
              <Line type="monotone" dataKey="index" stroke={ACCENT} strokeWidth={2.5}
                dot={{ r: 3.5, fill: ACCENT }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Period Detail" subtitle="Month-on-month and cumulative movement">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/10">
                  <th className="py-2 font-medium">Period</th>
                  <th className="py-2 font-medium text-right">Index</th>
                  <th className="py-2 font-medium text-right">MoM</th>
                  <th className="py-2 font-medium text-right">Cumulative</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.period} className="border-b border-white/[0.06]">
                    <td className="py-2.5 text-white/80">{r.period}</td>
                    <td className="py-2.5 text-right tabular-nums text-white">{r.index.toFixed(2)}</td>
                    <td className="py-2.5 text-right tabular-nums"
                      style={{ color: r.mom == null ? AXIS_INK : r.mom >= 0 ? '#3ddc91' : '#ff4d6d' }}>
                      {r.mom == null ? '—' : `${r.mom >= 0 ? '+' : ''}${r.mom.toFixed(2)}%`}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-white/70">
                      {r.cumulative >= 0 ? '+' : ''}{r.cumulative.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Regional Breakdown" subtitle="Weighted index by route origin region">
          <div className="space-y-3">
            {regions.map(r => {
              const pct = Math.min(Math.max((r.index_value - 95) / 35, 0), 1) * 100;
              return (
                <div key={r.region}>
                  <div className="flex justify-between text-[13px] mb-1.5">
                    <span className="text-white/80">{r.region}
                      <span className="text-white/35 ml-2">{r.route_count} routes</span>
                    </span>
                    <span className="tabular-nums text-white font-medium">{r.index_value.toFixed(2)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${ACCENT}, #22d3ee)` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}
