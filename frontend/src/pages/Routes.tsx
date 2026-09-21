import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  getRoutes, getRouteDetail, getBookingWindow,
  type RouteRow, type RouteDetail,
} from '../services/api';
import {
  Panel, StatCard, Loading, ErrorState, EmptyState,
  ACCENT, GRID, AXIS_INK, tooltipStyle, SERIES, inr,
} from '../components/ui';

export function RoutesList() {
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<'contribution' | 'index' | 'distance'>('contribution');

  useEffect(() => {
    getRoutes()
      .then(r => setRoutes(r.routes))
      .catch(e => setError(e?.message ?? 'Failed to load routes'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;

  const sorted = [...routes].sort((a, b) => {
    const av = a[sort === 'distance' ? 'distance_km' : sort] ?? -Infinity;
    const bv = b[sort === 'distance' ? 'distance_km' : sort] ?? -Infinity;
    return bv - av;
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-white">Route Analytics</h1>
          <p className="text-[13.5px] text-white/45 mt-1">{routes.length} active domestic routes</p>
        </div>
        <div className="flex gap-1.5 text-[12.5px]">
          {(['contribution', 'index', 'distance'] as const).map(k => (
            <button key={k} onClick={() => setSort(k)}
              className={`px-3 py-1.5 rounded-lg border transition-colors capitalize ${
                sort === k ? 'bg-[#7c5cff]/20 border-[#7c5cff]/40 text-white' : 'border-white/10 text-white/50 hover:text-white'
              }`}>
              Sort by {k}
            </button>
          ))}
        </div>
      </header>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-white/40 border-b border-white/10">
                <th className="py-2 font-medium">Route</th>
                <th className="py-2 font-medium">Region</th>
                <th className="py-2 font-medium text-right">Distance</th>
                <th className="py-2 font-medium text-right">Index</th>
                <th className="py-2 font-medium text-right">Weight</th>
                <th className="py-2 font-medium text-right">Contribution</th>
                <th className="py-2 font-medium text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id} className="border-b border-white/[0.06] hover:bg-white/[0.03]">
                  <td className="py-2.5 text-white font-medium">{r.origin}–{r.destination}</td>
                  <td className="py-2.5 text-white/55">{r.region ?? '—'}</td>
                  <td className="py-2.5 text-right tabular-nums text-white/70">
                    {r.distance_km ? `${r.distance_km.toFixed(0)} km` : '—'}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-white">{r.index?.toFixed(1) ?? '—'}</td>
                  <td className="py-2.5 text-right tabular-nums text-white/70">
                    {r.weight != null ? `${(r.weight * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-white/70">{r.contribution?.toFixed(2) ?? '—'}</td>
                  <td className="py-2.5 text-right">
                    <Link to={`/routes/${r.id}`} className="text-[#9d86ff] hover:text-white">Details →</Link>
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

export function RouteDetailPage() {
  const { routeId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<RouteDetail | null>(null);
  const [booking, setBooking] = useState<{ bucket: string; average_fare: number; observation_count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = Number(routeId);
    if (!id) return;
    setLoading(true);
    Promise.all([getRouteDetail(id), getBookingWindow(id)])
      .then(([d, b]) => { setDetail(d); setBooking(b.buckets); })
      .catch(e => setError(e?.response?.data?.detail ?? e?.message ?? 'Failed to load route'))
      .finally(() => setLoading(false));
  }, [routeId]);

  if (loading) return <Loading />;
  if (error || !detail) return <ErrorState message={error ?? 'Route not found'} />;

  const volatilityLabel = detail.volatility < 0.08 ? 'LOW' : detail.volatility < 0.16 ? 'MEDIUM' : 'HIGH';
  const volatilityColor = detail.volatility < 0.08 ? '#3ddc91' : detail.volatility < 0.16 ? '#ffd23f' : '#ff4d6d';

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/routes')} className="text-[13px] text-white/50 hover:text-white">
        ← All routes
      </button>

      <header>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-[26px] font-semibold tracking-tight text-white">
            {detail.origin} → {detail.destination}
          </h1>
          {detail.in_basket && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#7c5cff]/20 text-[#c3b3ff] border border-[#7c5cff]/30">
              IN BASKET
            </span>
          )}
        </div>
        <p className="text-[13.5px] text-white/45 mt-1">
          {detail.origin_city} → {detail.destination_city} · {detail.region} region · {detail.distance_km} km
        </p>
      </header>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Current Avg Fare" value={detail.current_average_fare ?? 0} prefix="₹" />
        <StatCard label="Route Index" value={detail.index_value ?? 0} decimals={1} />
        <StatCard label="Observations" value={detail.observation_count} />
        <StatCard label="Anomalies Flagged" value={detail.anomaly_count} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Booking Window" subtitle="Average fare by days-to-departure">
          {booking.length === 0 ? <EmptyState message="Not enough data." /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={booking} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="bucket" stroke={GRID} tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} />
                <YAxis stroke={GRID} width={54} tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false}
                  tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [inr(v), 'Avg fare']} />
                <Bar dataKey="average_fare" fill={ACCENT} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Airline Breakdown" subtitle="Average fare by carrier on this route">
          {detail.airline_breakdown.length === 0 ? <EmptyState message="No airline data." /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={detail.airline_breakdown} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 4 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" stroke={GRID} tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false}
                  tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="airline" stroke={GRID} width={86}
                  tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={tooltipStyle}
                  formatter={(v: number) => [inr(v), 'Avg fare']} />
                <Bar dataKey="average_fare" radius={[0, 5, 5, 0]}>
                  {detail.airline_breakdown.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <Panel title="Volatility" subtitle="Standard deviation of fare ÷ mean fare — data table, not a recommendation">
        <div className="flex items-center gap-4">
          <span className="text-[13px] font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: `${volatilityColor}22`, color: volatilityColor, border: `1px solid ${volatilityColor}44` }}>
            {volatilityLabel}
          </span>
          <span className="text-white/60 text-[13px]">Coefficient of variation: {detail.volatility.toFixed(4)}</span>
        </div>
      </Panel>
    </div>
  );
}
