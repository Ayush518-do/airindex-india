import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { getAirlines, type AirlineRow } from '../services/api';
import {
  Panel, StatCard, Loading, ErrorState, EmptyState, GRID, AXIS_INK, tooltipStyle, SERIES,
} from '../components/ui';

export default function Airlines() {
  const [airlines, setAirlines] = useState<AirlineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAirlines()
      .then(r => setAirlines(r.airlines))
      .catch(e => setError(e?.message ?? 'Failed to load airlines'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;

  const withContrib = airlines
    .filter(a => a.contribution != null)
    .sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0));
  const total = withContrib.reduce((s, a) => s + (a.contribution ?? 0), 0);
  const top = withContrib[0];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[26px] font-semibold tracking-tight text-white">Airline Analytics</h1>
        <p className="text-[13.5px] text-white/45 mt-1">
          Contribution to observed index movement — not a causal attribution
        </p>
      </header>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Airlines Tracked" value={airlines.length} />
        <StatCard label="In Current Basket" value={withContrib.length} />
        <StatCard label="Largest Contributor" value={top?.contribution ?? 0} decimals={2}
          footnote={top?.name ?? '—'} />
        <StatCard label="Total Contribution" value={total} decimals={1} footnote="Sums to the national index" />
      </div>

      <Panel title="Contribution to National Index" subtitle="Share of each route's weighted price relative, attributed by observation volume">
        {withContrib.length === 0 ? <EmptyState message="No contribution data yet." /> : (
          <ResponsiveContainer width="100%" height={Math.max(240, withContrib.length * 44)}>
            <BarChart data={withContrib} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
              <CartesianGrid stroke={GRID} horizontal={false} />
              <XAxis type="number" stroke={GRID} tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} />
              <YAxis type="category" dataKey="name" stroke={GRID} width={96}
                tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={tooltipStyle}
                formatter={(v: number) => [`${v.toFixed(2)} pts (${((v / total) * 100).toFixed(1)}%)`, 'Contribution']} />
              <Bar dataKey="contribution" radius={[0, 5, 5, 0]}>
                {withContrib.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title="Carrier Reference">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-white/40 border-b border-white/10">
                <th className="py-2 font-medium">Code</th>
                <th className="py-2 font-medium">Airline</th>
                <th className="py-2 font-medium text-right">Contribution</th>
                <th className="py-2 font-medium text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {airlines.map((a, i) => (
                <tr key={a.id} className="border-b border-white/[0.06]">
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES[i % SERIES.length] }} />
                      <span className="font-mono text-white/80">{a.iata_code}</span>
                    </span>
                  </td>
                  <td className="py-2.5 text-white">{a.name}</td>
                  <td className="py-2.5 text-right tabular-nums text-white/80">{a.contribution?.toFixed(2) ?? '—'}</td>
                  <td className="py-2.5 text-right tabular-nums text-white/55">
                    {a.contribution != null && total ? `${((a.contribution / total) * 100).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
