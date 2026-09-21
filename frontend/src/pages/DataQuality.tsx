import { useEffect, useState } from 'react';
import { getDataQuality, getSourceHealth, type DataQuality as DQ } from '../services/api';
import { Panel, StatCard, Loading, ErrorState, EmptyState, ACCENT, ACCENT_2 } from '../components/ui';

type Source = {
  name: string; status: string; last_successful_run: string | null;
  last_failed_run: string | null; success_rate: number; records_last_run: number;
};

const METRICS: { key: keyof DQ; label: string; hint: string }[] = [
  { key: 'route_coverage', label: 'Route coverage', hint: 'Active routes with ≥1 observation' },
  { key: 'airline_coverage', label: 'Airline coverage', hint: 'Active airlines with ≥1 observation' },
  { key: 'validation_rate', label: 'Validation rate', hint: 'Observations passing validation rules' },
  { key: 'source_availability', label: 'Source availability', hint: 'Registered sources currently ACTIVE' },
];

export default function DataQuality() {
  const [dq, setDq] = useState<DQ | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getDataQuality(), getSourceHealth()])
      .then(([d, s]) => { setDq(d); setSources(s.sources); })
      .catch(e => setError(e?.message ?? 'Failed to load data quality'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (error || !dq) return <ErrorState message={error ?? 'No data'} />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[26px] font-semibold tracking-tight text-white">Data Quality &amp; Source Health</h1>
        <p className="text-[13.5px] text-white/45 mt-1">
          A transparent composite indicator — explicitly not a statistical confidence interval
        </p>
      </header>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Overall Indicator" value={dq.overall_score * 100} decimals={0} suffix="%" />
        <StatCard label="Observations" value={dq.total_observations} />
        <StatCard label="Missing / Invalid" value={dq.missing_data_rate * 100} decimals={1} suffix="%" />
        <StatCard label="Routes · Airlines" value={dq.total_routes} footnote={`${dq.total_airlines} airlines`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Component Scores" subtitle="Each component is weighted into the overall indicator">
          <div className="space-y-4">
            {METRICS.map(m => {
              const v = dq[m.key] as number;
              return (
                <div key={m.key}>
                  <div className="flex justify-between text-[13px] mb-1.5">
                    <span className="text-white/80">{m.label}
                      <span className="text-white/35 ml-2 text-[12px]">{m.hint}</span>
                    </span>
                    <span className="tabular-nums text-white font-medium">{(v * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${v * 100}%`, background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_2})` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[12px] text-white/35 mt-5 leading-relaxed">
            Overall = 0.3 × route coverage + 0.2 × airline coverage + 0.2 × source availability + 0.3 × validation rate.
          </p>
        </Panel>

        <Panel title="Source Health" subtitle="Collection adapters and their last run">
          {sources.length === 0 ? <EmptyState message="No sources registered." /> : (
            <div className="space-y-3">
              {sources.map(s => {
                const ok = s.status === 'ACTIVE';
                return (
                  <div key={s.name} className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${ok ? 'bg-[#3ddc91]' : 'bg-[#ff4d6d]'}`} />
                        <span className="text-white font-medium text-[13.5px]">{s.name}</span>
                        <span className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded ${
                          ok ? 'bg-[#3ddc91]/15 text-[#3ddc91]' : 'bg-[#ff4d6d]/15 text-[#ff4d6d]'
                        }`}>{s.status}</span>
                      </div>
                      <p className="text-[12px] text-white/40 mt-1.5">
                        Last success: {s.last_successful_run ? new Date(s.last_successful_run).toLocaleString('en-IN') : '—'}
                      </p>
                      {s.last_failed_run && (
                        <p className="text-[12px] text-[#ff9f43] mt-0.5">
                          Last failure: {new Date(s.last_failed_run).toLocaleString('en-IN')}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-white tabular-nums font-semibold">{(s.success_rate * 100).toFixed(0)}%</p>
                      <p className="text-[11.5px] text-white/35">{s.records_last_run.toLocaleString('en-IN')} records</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
