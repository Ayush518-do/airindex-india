import { useEffect, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, LabelList,
} from 'recharts';
import { Panel, Badge, Loading, SERIES, GRID, AXIS_INK, tooltipStyle, inr } from './ui';
import { getBacktest, type Backtest } from '../services/api';

export default function BacktestPanel() {
  const [data, setData] = useState<Backtest | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getBacktest().then(setData).catch(e => setError(e?.response?.data?.detail ?? e?.message)); }, []);

  if (error) return <Panel title="Back-test vs DGCA reference"><p className="text-[13px] text-white/40 py-6 text-center">{error}</p></Panel>;
  if (!data) return <Panel title="Back-test vs DGCA reference"><Loading label="Comparing…" /></Panel>;

  const illustrative = data.reference.status !== 'OFFICIAL';
  const rows = data.comparison.map(c => ({ ...c, label: c.route }));
  const monthsWithBoth = data.series.filter(s => s.ours_index != null && s.reference_index != null);

  return (
    <Panel
      title="Back-test: scraped levels vs DGCA-monitored reference"
      subtitle={`Mean nonstop economy basket fare, ${data.latest_month} · mean absolute deviation ${data.mean_abs_deviation_pct ?? '—'}% across routes`}
      action={illustrative ? <Badge tone="warn">REFERENCE VALUES ILLUSTRATIVE</Badge> : <Badge tone="good">OFFICIAL REFERENCE</Badge>}
    >
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 18, right: 16, bottom: 4, left: 8 }} barCategoryGap="28%" barGap={2}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" stroke={GRID} tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} />
            <YAxis stroke={GRID} width={58} tick={{ fill: AXIS_INK, fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              formatter={(v: any, name: string, p: any) => [
                v == null ? '—' : inr(Number(v)),
                name === 'ours' ? `APIx basket (n=${p.payload.n})` : `Reference (${data.reference.status.toLowerCase()})`,
              ]}
            />
            <Legend verticalAlign="top" align="right" height={28}
              formatter={v => <span style={{ color: AXIS_INK, fontSize: 12 }}>{v === 'ours' ? 'Scraped (APIx basket)' : 'DGCA-monitored reference'}</span>} />
            <Bar dataKey="ours" fill={SERIES.blue} radius={[4, 4, 0, 0]} maxBarSize={34}>
              {rows.map((_, i) => <Cell key={i} fill={SERIES.blue} />)}
              <LabelList dataKey="deviation_pct" position="top" formatter={(v: any) => v == null ? '' : `${v > 0 ? '+' : ''}${v}%`} style={{ fill: '#c3c2b7', fontSize: 11 }} />
            </Bar>
            <Bar dataKey="reference" fill={SERIES.aqua} radius={[4, 4, 0, 0]} maxBarSize={34}>
              {rows.map((_, i) => <Cell key={i} fill={SERIES.aqua} />)}
            </Bar>
            {monthsWithBoth.length > 1 && <Line dataKey="none" hide />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11.5px] text-white/40">
        {data.reference.intended_source}{' '}
        {illustrative && <>· <span className="text-amber-300/80">{data.reference.note}</span></>}
        {monthsWithBoth.length > 1 ? ` · ${monthsWithBoth.length} months available for the indexed series.` : ' · Once ≥2 months of scrapes exist, a monthly APIx-vs-reference index (both = 100 at the first common month) is drawn here on one axis.'}
      </p>
    </Panel>
  );
}
