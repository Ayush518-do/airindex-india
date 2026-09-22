import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Legend,
} from 'recharts';
import { Panel, SERIES, GRID, AXIS_INK, tooltipStyle, fmtDate } from './ui';
import type { IndexDaily, IndexForecast } from '../services/api';

type Row = { date: string; actual?: number; forecast?: number; band?: [number, number]; synthetic?: boolean };

export default function TrendChart({ daily, forecast }: { daily: IndexDaily; forecast: IndexForecast | null }) {
  const rows: Row[] = daily.points.map(p => ({ date: p.date, actual: p.value, synthetic: !!p.is_synthetic }));
  if (forecast && forecast.points.length) {
    // Anchor the dashed forecast on the last actual point so the lines join.
    const last = rows[rows.length - 1];
    last.forecast = last.actual;
    last.band = [last.actual!, last.actual!];
    forecast.points.forEach(p => rows.push({ date: p.date, forecast: p.value, band: [p.lower, p.upper] }));
  }
  const all = rows.flatMap(r => [r.actual, r.forecast, r.band?.[0], r.band?.[1]]).filter((v): v is number => v != null);
  const lo = Math.floor((Math.min(...all) - 1) / 2) * 2;
  const hi = Math.ceil((Math.max(...all) + 1) / 2) * 2;

  const synth = daily.points.filter(p => p.is_synthetic);
  const synthFrom = synth[0]?.date;
  const synthTo = synth[synth.length - 1]?.date;
  const realDays = daily.points.length - synth.length;

  const subtitle = [
    `${realDays} real scrape day${realDays === 1 ? '' : 's'}`,
    synth.length ? `${synth.length} seeded (shaded)` : null,
    forecast ? `dashed = ${forecast.horizon_days}-day linear trend, 95% residual band${forecast.r2 != null ? ` (R² ${forecast.r2})` : ''}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <Panel title="APIx daily trend" subtitle={subtitle}>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} stroke={GRID} tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} minTickGap={28} />
            <YAxis domain={[lo, hi]} stroke={GRID} width={44} tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(d, payload) => {
                const p = payload?.[0]?.payload as Row | undefined;
                return `${fmtDate(String(d))}${p?.synthetic ? ' · seeded (synthetic)' : p?.forecast != null && p?.actual == null ? ' · forecast' : ' · real scrape'}`;
              }}
              formatter={(v: any, name: string) => {
                if (name === 'band') return [`${v[0].toFixed(1)} – ${v[1].toFixed(1)}`, 'Forecast band'];
                return [Number(v).toFixed(2), name === 'actual' ? 'APIx' : 'Forecast'];
              }}
            />
            <Legend
              verticalAlign="top" align="right" height={28}
              payload={[
                { value: 'APIx (actual)', type: 'plainline', color: SERIES.blue, payload: { strokeDasharray: '0' } } as any,
                { value: 'Forecast', type: 'plainline', color: SERIES.blue, payload: { strokeDasharray: '6 4' } } as any,
                ...(synth.length ? [{ value: 'Seeded history', type: 'rect', color: 'rgba(255,255,255,0.10)' } as any] : []),
              ]}
              formatter={(v) => <span style={{ color: AXIS_INK, fontSize: 12 }}>{v}</span>}
            />
            {synthFrom && synthTo && (
              <ReferenceArea x1={synthFrom} x2={synthTo} fill="rgba(255,255,255,0.05)" stroke="none"
                label={{ value: 'seeded history', fill: AXIS_INK, fontSize: 11, position: 'insideBottomLeft' }} />
            )}
            <ReferenceLine y={100} stroke="rgba(255,255,255,0.18)" strokeWidth={1} label={{ value: 'base = 100', fill: AXIS_INK, fontSize: 11, position: 'insideTopLeft' }} />
            <Area type="monotone" dataKey="band" stroke="none" fill={SERIES.blue} fillOpacity={0.14} isAnimationActive={false} legendType="none" />
            <Line type="monotone" dataKey="actual" stroke={SERIES.blue} strokeWidth={2}
              dot={(p: any) => (p.payload.synthetic || p.payload.actual == null || p.cy == null) ? <g key={p.index} /> : <circle key={p.index} cx={p.cx} cy={p.cy} r={4} fill={SERIES.blue} stroke="#131320" strokeWidth={2} />}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#131320' }} />
            <Line type="monotone" dataKey="forecast" stroke={SERIES.blue} strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#131320' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
