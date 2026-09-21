import { useEffect, useState } from 'react';
import { getAnomalies, api, type AnomalyRow } from '../services/api';
import {
  Panel, StatCard, Loading, ErrorState, EmptyState, SEVERITY, AXIS_INK, inr,
} from '../components/ui';

const REVIEW_STATES = [
  { value: 'REVIEWED', label: 'Reviewed' },
  { value: 'VALID_ANOMALY', label: 'Valid anomaly' },
  { value: 'INVALID_OBSERVATION', label: 'Invalid observation' },
];

export default function Anomalies() {
  const [rows, setRows] = useState<AnomalyRow[]>([]);
  const [filter, setFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = () =>
    getAnomalies()
      .then(r => setRows(r.anomalies))
      .catch(e => setError(e?.message ?? 'Failed to load anomalies'))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const review = async (id: number, status: string) => {
    setBusy(id);
    try {
      await api.post(`/api/anomalies/${id}/review`, null, { params: { status } });
      setRows(rs => rs.map(r => (r.id === id ? { ...r, status } : r)));
    } finally { setBusy(null); }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.severity] = (acc[r.severity] ?? 0) + 1; return acc;
  }, {});
  const pending = rows.filter(r => r.status === 'PENDING').length;
  const visible = filter === 'ALL' ? rows : rows.filter(r => r.severity === filter);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-white">Anomaly Review</h1>
          <p className="text-[13.5px] text-white/45 mt-1">
            IQR + Z-score within comparable booking windows · observations are flagged, never deleted
          </p>
        </div>
        <div className="flex gap-1.5 text-[12.5px]">
          {['ALL', 'CRITICAL_ANOMALY', 'HIGH_ANOMALY', 'LOW_ANOMALY'].map(k => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-lg border transition-colors ${
                filter === k ? 'bg-[#7c5cff]/20 border-[#7c5cff]/40 text-white' : 'border-white/10 text-white/50 hover:text-white'
              }`}>
              {k === 'ALL' ? 'All' : SEVERITY[k]?.label ?? k}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Pending Review" value={pending} />
        <StatCard label="Critical" value={counts.CRITICAL_ANOMALY ?? 0} />
        <StatCard label="High" value={counts.HIGH_ANOMALY ?? 0} />
        <StatCard label="Low" value={counts.LOW_ANOMALY ?? 0} />
      </div>

      <Panel>
        {visible.length === 0 ? <EmptyState message="No anomalies match this filter." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/10">
                  <th className="py-2 font-medium">Severity</th>
                  <th className="py-2 font-medium">Route</th>
                  <th className="py-2 font-medium text-right">Observed</th>
                  <th className="py-2 font-medium text-right">Expected</th>
                  <th className="py-2 font-medium text-right">Deviation</th>
                  <th className="py-2 font-medium">Method</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium text-right">Analyst action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(a => {
                  const s = SEVERITY[a.severity] ?? { color: AXIS_INK, label: a.severity, icon: '●' };
                  const isPending = a.status === 'PENDING';
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
                      <td className="py-2.5 text-white/50 font-mono text-[11.5px]">{a.algorithm}</td>
                      <td className="py-2.5">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                          isPending ? 'bg-amber-400/15 text-amber-300' : 'bg-white/[0.06] text-white/60'
                        }`}>
                          {a.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        {isPending ? (
                          <select
                            disabled={busy === a.id}
                            defaultValue=""
                            onChange={e => e.target.value && review(a.id, e.target.value)}
                            className="bg-white/[0.06] border border-white/10 rounded-md px-2 py-1 text-[12px] text-white/80 focus:outline-none focus:border-[#7c5cff]/60"
                          >
                            <option value="" disabled>Mark as…</option>
                            {REVIEW_STATES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        ) : <span className="text-white/30 text-[12px]">Done</span>}
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
