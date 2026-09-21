import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { getBookingWindow, getBookingHeatmap } from '../services/api';
import {
  Panel, StatCard, Loading, ErrorState, EmptyState, ACCENT, ACCENT_2, GRID, AXIS_INK, tooltipStyle, inr,
} from '../components/ui';

type Bucket = { bucket: string; average_fare: number; observation_count: number };
type Heat = { buckets: string[]; routes: { route_id: number; route: string; values: Record<string, number> }[] };

export default function BookingWindow() {
  const [curve, setCurve] = useState<Bucket[]>([]);
  const [heat, setHeat] = useState<Heat | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getBookingWindow(), getBookingHeatmap()])
      .then(([c, h]) => { setCurve(c.buckets); setHeat(h); })
      .catch(e => setError(e?.message ?? 'Failed to load booking-window data'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;

  const earliest = curve[0], latest = curve[curve.length - 1];
  const premium = earliest && latest ? ((latest.average_fare - earliest.average_fare) / earliest.average_fare) * 100 : 0;

  // Heatmap colour scale: single sequential hue, light→dark by fare.
  const allValues = heat?.routes.flatMap(r => Object.values(r.values)) ?? [];
  const minV = Math.min(...allValues), maxV = Math.max(...allValues);
  const cellColor = (v: number) => {
    const t = maxV === minV ? 0.5 : (v - minV) / (maxV - minV);
    return `rgba(124, 92, 255, ${0.12 + t * 0.78})`;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[26px] font-semibold tracking-tight text-white">Booking Window</h1>
        <p className="text-[13.5px] text-white/45 mt-1">
          How fares move as departure approaches — days-to-departure bucketed per spec section 15
        </p>
      </header>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label={`Avg fare · ${earliest?.bucket ?? '—'} days`} value={earliest?.average_fare ?? 0} prefix="₹" />
        <StatCard label={`Avg fare · ${latest?.bucket ?? '—'} days`} value={latest?.average_fare ?? 0} prefix="₹" />
        <StatCard label="Last-minute Premium" value={premium} decimals={1} suffix="%" footnote="Latest bucket vs earliest" />
        <StatCard label="Observations" value={curve.reduce((s, b) => s + b.observation_count, 0)} />
      </div>

      <Panel title="Network-wide Booking Curve" subtitle="Average fare by days before departure, all basket routes">
        {curve.length === 0 ? <EmptyState message="No booking-window data." /> : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={curve} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id="bwFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT_2} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={ACCENT_2} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="bucket" stroke={GRID} tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false}
                label={{ value: 'Days to departure', position: 'insideBottom', offset: -2, fill: AXIS_INK, fontSize: 11 }} />
              <YAxis stroke={GRID} width={56} tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false}
                tickFormatter={(v: number) => `₹${(v / 1000).toFixed(1)}k`} />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(v: number, _n, p: any) => [`${inr(v)} · ${p.payload.observation_count} obs`, 'Avg fare']} />
              <Area type="monotone" dataKey="average_fare" stroke={ACCENT_2} strokeWidth={2.5}
                fill="url(#bwFill)" dot={{ r: 4, fill: ACCENT_2 }} activeDot={{ r: 6 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title="Route × Booking-Window Heatmap" subtitle="Average fare per route per bucket · darker = higher fare">
        {!heat || heat.routes.length === 0 ? <EmptyState message="No heatmap data." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="text-left text-white/40 font-medium pb-1 pr-2">Route</th>
                  {heat.buckets.map(b => (
                    <th key={b} className="text-center text-white/40 font-medium pb-1 min-w-[80px]">D{b}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heat.routes.map(r => (
                  <tr key={r.route_id}>
                    <td className="text-white/80 font-medium pr-2 whitespace-nowrap">{r.route}</td>
                    {heat.buckets.map(b => {
                      const v = r.values[b];
                      return (
                        <td key={b} className="text-center tabular-nums rounded-md py-2 text-white"
                          style={{ background: v != null ? cellColor(v) : 'rgba(255,255,255,0.03)' }}
                          title={v != null ? `${r.route} · ${b} days: ${inr(v)}` : 'No data'}>
                          {v != null ? v.toLocaleString('en-IN') : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
