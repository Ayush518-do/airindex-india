import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  getDashboardSummary, getIndexHistory, getRoutes, getAnomalies,
  type DashboardSummary, type IndexHistory, type RouteRow, type AnomalyRow,
} from './services/api';

// Chart tokens (see dataviz reference palette)
const SERIES_1 = '#2a78d6';
const GRIDLINE = '#e1e0d9';
const AXIS = '#c3c2b7';
const MUTED_INK = '#898781';
const SECONDARY_INK = '#52514e';

const STATUS: Record<string, { color: string; label: string; icon: string }> = {
  CRITICAL_ANOMALY: { color: '#d03b3b', label: 'Critical', icon: '▲' },
  HIGH_ANOMALY: { color: '#ec835a', label: 'High', icon: '▲' },
  LOW_ANOMALY: { color: '#fab219', label: 'Low', icon: '●' },
};

const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function StatTile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{label}</h3>
      <p className="text-3xl font-semibold text-slate-900">{value}</p>
      {sub && <div className="text-sm mt-1.5">{sub}</div>}
    </div>
  );
}

function App() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [history, setHistory] = useState<IndexHistory | null>(null);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, h, r, a] = await Promise.all([
          getDashboardSummary(), getIndexHistory(), getRoutes(), getAnomalies(),
        ]);
        setSummary(s);
        setHistory(h);
        setRoutes(r.routes);
        setAnomalies(a.anomalies);
        setError(null);
      } catch (err: any) {
        setError(err?.response?.data?.detail ?? err?.message ?? 'Unable to reach the API.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-slate-500">Loading index data…</div>;
  }

  if (error || !summary) {
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <div className="max-w-md text-center">
          <p className="text-lg font-semibold text-slate-900 mb-2">Unable to load the airfare index</p>
          <p className="text-sm text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  const chartData = (history?.periods ?? []).map((p, i) => ({
    period: p,
    index: history!.values[i],
  }));

  const basketRoutes = routes
    .filter((r) => r.contribution != null)
    .sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0));

  const contributionData = basketRoutes.map((r) => ({
    route: `${r.origin}–${r.destination}`,
    contribution: r.contribution ?? 0,
  }));

  const change = summary.index_change;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">AIRINDEX INDIA</h1>
            <p className="text-sm text-slate-600">Airfare Price Intelligence &amp; Indexing Platform</p>
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold px-2 py-1 rounded bg-amber-100 text-amber-900 border border-amber-200">
              {summary.data_mode}
            </span>
            <span className="text-xs text-slate-500">
              Base period {summary.base_period} = 100 · Current {summary.calculation_period}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            label="Airfare Index"
            value={summary.current_index.toFixed(1)}
            sub={
              change == null ? (
                <span className="text-slate-500">No prior period</span>
              ) : (
                <span style={{ color: change >= 0 ? '#006300' : '#d03b3b' }}>
                  {change >= 0 ? '+' : ''}{change.toFixed(2)}% vs prior period
                </span>
              )
            }
          />
          <StatTile label="Routes in Basket" value={String(summary.routes_covered)} />
          <StatTile label="Airlines Covered" value={String(summary.airlines_covered)} />
          <StatTile
            label="Data Quality"
            value={`${(summary.data_quality_score * 100).toFixed(0)}%`}
            sub={<span className="text-slate-500">{summary.observations_count.toLocaleString('en-IN')} observations</span>}
          />
        </section>

        <section className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-900">National Airfare Index</h2>
          <p className="text-sm text-slate-600 mb-4">
            Weighted fixed-basket index, {history?.base_period} = 100
          </p>
          {chartData.length === 0 ? (
            <p className="text-sm text-slate-500 py-12 text-center">No index history available yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={GRIDLINE} vertical={false} />
                <XAxis
                  dataKey="period" stroke={AXIS}
                  tick={{ fill: MUTED_INK, fontSize: 12 }} tickLine={false}
                />
                <YAxis
                  stroke={AXIS}
                  domain={[
                    (min: number) => Math.floor((min - 2) / 5) * 5,
                    (max: number) => Math.ceil((max + 2) / 5) * 5,
                  ]}
                  tickFormatter={(v: number) => v.toFixed(0)}
                  tick={{ fill: MUTED_INK, fontSize: 12 }} tickLine={false} width={52}
                />
                <Tooltip
                  contentStyle={{
                    background: '#fcfcfb', border: `1px solid ${AXIS}`,
                    borderRadius: 6, fontSize: 13, color: SECONDARY_INK,
                  }}
                  formatter={(v: number) => [v.toFixed(2), 'Index']}
                />
                <Line
                  type="monotone" dataKey="index" stroke={SERIES_1} strokeWidth={2}
                  dot={{ r: 3, fill: SERIES_1 }} activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-900">Route Contribution to Index</h2>
          <p className="text-sm text-slate-600 mb-4">
            Weight × price relative, for {summary.calculation_period}
          </p>
          {contributionData.length === 0 ? (
            <p className="text-sm text-slate-500 py-12 text-center">No basket routes for this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, contributionData.length * 28)}>
              <BarChart data={contributionData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                <CartesianGrid stroke={GRIDLINE} horizontal={false} />
                <XAxis type="number" stroke={AXIS} tick={{ fill: MUTED_INK, fontSize: 12 }} tickLine={false} />
                <YAxis
                  type="category" dataKey="route" stroke={AXIS} width={92}
                  tick={{ fill: MUTED_INK, fontSize: 12 }} tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(11,11,11,0.04)' }}
                  contentStyle={{
                    background: '#fcfcfb', border: `1px solid ${AXIS}`,
                    borderRadius: 6, fontSize: 13, color: SECONDARY_INK,
                  }}
                  formatter={(v: number) => [v.toFixed(2), 'Contribution']}
                />
                <Bar dataKey="contribution" fill={SERIES_1} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-900">Flagged Anomalies</h2>
          <p className="text-sm text-slate-600 mb-4">
            Detected by IQR / Z-score within comparable booking windows. Flagged for review — not removed from the data.
          </p>
          {anomalies.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No anomalies flagged.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 font-medium">Severity</th>
                    <th className="py-2 font-medium">Route</th>
                    <th className="py-2 font-medium text-right tabular-nums">Observed</th>
                    <th className="py-2 font-medium text-right tabular-nums">Expected</th>
                    <th className="py-2 font-medium text-right tabular-nums">Deviation</th>
                    <th className="py-2 font-medium">Method</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.slice(0, 12).map((a) => {
                    const s = STATUS[a.severity] ?? { color: MUTED_INK, label: a.severity, icon: '●' };
                    return (
                      <tr key={a.id} className="border-b border-slate-100">
                        <td className="py-2">
                          <span className="inline-flex items-center gap-1.5" style={{ color: s.color }}>
                            <span aria-hidden>{s.icon}</span>
                            <span className="font-medium">{s.label}</span>
                          </span>
                        </td>
                        <td className="py-2 text-slate-700">{a.route ?? '—'}</td>
                        <td className="py-2 text-right tabular-nums text-slate-900">{inr(a.fare)}</td>
                        <td className="py-2 text-right tabular-nums text-slate-600">{inr(a.expected)}</td>
                        <td className="py-2 text-right tabular-nums text-slate-900">
                          {a.deviation >= 0 ? '+' : ''}{a.deviation.toFixed(1)}%
                        </td>
                        <td className="py-2 text-slate-500">{a.algorithm}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="text-xs text-slate-500 pb-4 leading-relaxed">
          <p>
            <strong className="text-slate-700">Prototype methodology.</strong> This index is a demonstration
            of automated airfare price measurement. It is not the official MoSPI CPI calculation and would
            require validation against official statistical standards before any production use.
          </p>
          <p className="mt-1">Last calculated: {new Date(summary.last_updated).toLocaleString('en-IN')}</p>
        </footer>
      </main>
    </div>
  );
}

export default App;
