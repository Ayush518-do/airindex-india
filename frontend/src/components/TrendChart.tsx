import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Legend,
} from 'recharts';
import { Panel, EmptyState, InfoTip, SERIES, GRID, INK, INK_3, tooltipStyle, fmtDate, fmtLongDate, axisTick, axisLabel } from './ui';
import { GLOSSARY } from '../lib/glossary';
import type { IndexDaily, IndexForecast } from '../services/api';

type Row = { date: string; actual?: number; forecast?: number; band?: [number, number]; example?: boolean };

export default function TrendChart({ daily, forecast }: { daily: IndexDaily; forecast: IndexForecast | null }) {
  const title = 'How prices have moved';

  if (!daily.available || daily.points.length === 0) {
    return (
      <Panel title={title} info={GLOSSARY.apix.short}>
        <EmptyState title="No prices yet" message={daily.message ?? 'The first prices appear after the next daily check.'} />
      </Panel>
    );
  }

  const rows: Row[] = daily.points.map(p => ({ date: p.date, actual: p.value, example: !!p.is_synthetic }));
  const hasForecast = !!forecast?.available && forecast.points.length > 0;
  if (hasForecast) {
    // Anchor the dashed line on the last real point so the two lines join.
    const last = rows[rows.length - 1];
    last.forecast = last.actual;
    last.band = [last.actual!, last.actual!];
    forecast!.points.forEach(p => rows.push({ date: p.date, forecast: p.value, band: [p.lower, p.upper] }));
  }

  const values = rows.flatMap(r => [r.actual, r.forecast, r.band?.[0], r.band?.[1]]).filter((v): v is number => v != null);
  const lo = Math.floor((Math.min(100, ...values) - 1) / 2) * 2;
  const hi = Math.ceil((Math.max(100, ...values) + 1) / 2) * 2;

  const example = daily.points.filter(p => p.is_synthetic);
  const exFrom = example[0]?.date;
  const exTo = example[example.length - 1]?.date;
  const nDays = daily.points.length;
  const latest = daily.points[nDays - 1];

  return (
    <Panel
      title={title}
      info={GLOSSARY.apix.short}
      subtitle={<>100 = prices on {daily.base_date ? fmtLongDate(daily.base_date) : 'our first day'} · {nDays} day{nDays === 1 ? '' : 's'} of prices so far</>}
    >
      {nDays < 2 ? (
        <EmptyState icon="📈" title="Only one day of prices so far"
          message="A trend needs at least two days. We check prices every morning — come back tomorrow to see the first movement." />
      ) : (
        <div style={{ width: '100%', height: 300 }} role="img"
          aria-label={`Airfare price index over ${nDays} days, from ${daily.points[0].value} on ${fmtDate(daily.points[0].date)} to ${latest.value} on ${fmtDate(latest.date)}.`}>
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 22, left: 16 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDate} stroke={GRID} tick={axisTick} tickLine={false} minTickGap={28}
                label={axisLabel('Date')} />
              <YAxis domain={[lo, hi]} stroke={GRID} width={52} tick={axisTick} tickLine={false} axisLine={false}
                label={axisLabel('Price index', -90)} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(d, payload) => {
                  const p = payload?.[0]?.payload as Row | undefined;
                  const kind = p?.example ? ' · example data' : p?.forecast != null && p?.actual == null ? ' · estimate' : '';
                  return `${fmtLongDate(String(d))}${kind}`;
                }}
                formatter={(v: any, name: string) => {
                  if (name === 'band') return [`${v[0].toFixed(1)} – ${v[1].toFixed(1)}`, 'Likely range'];
                  const n = Number(v);
                  const vs = n >= 100 ? `${(n - 100).toFixed(1)}% above` : `${(100 - n).toFixed(1)}% below`;
                  return [`${n.toFixed(1)} (${vs} the first day)`, name === 'actual' ? 'Price index' : 'Estimate'];
                }}
              />
              <Legend
                verticalAlign="top" align="right" height={30}
                payload={[
                  { value: 'Price index', type: 'plainline', color: SERIES.blue, payload: { strokeDasharray: '0' } } as any,
                  ...(hasForecast ? [{ value: 'Next 5 days (estimate)', type: 'plainline', color: SERIES.blue, payload: { strokeDasharray: '6 4' } } as any] : []),
                  ...(example.length ? [{ value: 'Example data', type: 'rect', color: '#e6ebf3' } as any] : []),
                ]}
                formatter={(v) => <span style={{ color: INK, fontSize: 13 }}>{v}</span>}
              />
              {exFrom && exTo && (
                <ReferenceArea x1={exFrom} x2={exTo} fill="#eef1f6" stroke="none"
                  label={{ value: 'example data', fill: INK_3, fontSize: 12, position: 'insideBottomLeft' }} />
              )}
              <ReferenceLine y={100} stroke="#b8c4d6" strokeDasharray="4 4"
                label={{ value: 'first day = 100', fill: INK_3, fontSize: 12, position: 'insideTopLeft' }} />
              {hasForecast && <Area type="monotone" dataKey="band" stroke="none" fill={SERIES.blue} fillOpacity={0.12} isAnimationActive={false} legendType="none" />}
              <Line type="monotone" dataKey="actual" stroke={SERIES.blue} strokeWidth={2.5}
                dot={(p: any) => (p.payload.example || p.payload.actual == null || p.cy == null)
                  ? <g key={p.index} />
                  : <circle key={p.index} cx={p.cx} cy={p.cy} r={4} fill={SERIES.blue} stroke="#ffffff" strokeWidth={2} />}
                activeDot={{ r: 6, strokeWidth: 2, stroke: '#ffffff' }} />
              {hasForecast && <Line type="monotone" dataKey="forecast" stroke={SERIES.blue} strokeWidth={2} strokeDasharray="6 4" dot={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {!hasForecast && forecast && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-sky-soft px-3 py-2.5 text-[14px] text-ink-2">
          <span aria-hidden>🔭</span>
          <span>
            <b className="font-semibold text-ink">No forecast yet.</b> {forecast.message}
          </span>
        </p>
      )}
      {hasForecast && (
        <p className="mt-2 flex items-center gap-2 text-[13px] text-ink-3">
          The shaded area is the likely range for the next {forecast!.horizon_days ?? 5} days.
          <InfoTip>{GLOSSARY.forecastRange.short}</InfoTip>
        </p>
      )}
    </Panel>
  );
}
