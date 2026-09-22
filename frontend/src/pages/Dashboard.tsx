import { useEffect, useState } from 'react';
import Aurora from '../components/reactbits/Aurora';
import FadeContent from '../components/reactbits/FadeContent';
import TopBar, { type Tab } from '../components/TopBar';
import HeroStat from '../components/HeroStat';
import TrendChart from '../components/TrendChart';
import Heatmap from '../components/Heatmap';
import { FilterPanel, ElasticityChart } from '../components/RoutePanel';
import BacktestPanel from '../components/BacktestPanel';
import FestivalsTab from '../components/FestivalsTab';
import MyRoutesTab from '../components/MyRoutesTab';
import { Loading, ErrorState, Panel, inr } from '../components/ui';
import { getBrowserId } from '../lib/browserId';
import {
  getMeta, getIndexDaily, getIndexForecast, getHeatmap, getRouteTrend, getFaresRaw, getRouteAlerts,
  type Meta, type IndexDaily, type IndexForecast, type Heatmap as HeatmapData, type RouteTrend, type FareRecord, type RouteAlerts,
} from '../services/api';

// Local-date ISO string (toISOString() is UTC and shifts the day in IST).
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Short, non-blocking scroll-in for dashboard sections (React Bits FadeContent).
const Section = ({ children }: { children: React.ReactNode }) => (
  <FadeContent duration={450} threshold={0.05} initialOpacity={0}>{children}</FadeContent>
);

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>('overview');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [daily, setDaily] = useState<IndexDaily | null>(null);
  const [forecast, setForecast] = useState<IndexForecast | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [route, setRoute] = useState('DEL-BOM');
  const [trend, setTrend] = useState<RouteTrend | null>(null);
  const [fares, setFares] = useState<{ records: FareRecord[]; total: number }>({ records: [], total: 0 });
  const [dateFrom, setDateFrom] = useState(iso(new Date()));
  const [dateTo, setDateTo] = useState(iso(new Date(Date.now() + 60 * 864e5)));
  const [nonstop, setNonstop] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [browserId] = useState(getBrowserId);
  const [alerts, setAlerts] = useState<RouteAlerts | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Global data — one fetch on mount.
  useEffect(() => {
    (async () => {
      try {
        const [m, d, f, h] = await Promise.all([getMeta(), getIndexDaily(), getIndexForecast(5), getHeatmap()]);
        setMeta(m); setDaily(d); setForecast(f); setHeatmap(h);
        if (!m.routes.includes(route)) setRoute(m.routes[0]);
        // Low-price check for this browser's saved routes (drives the banner + tab badge).
        getRouteAlerts(browserId).then(setAlerts).catch(() => {});
      } catch (e: any) {
        setError(e?.response?.data?.detail ?? e?.message ?? 'Unable to reach the API.');
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Route-scoped data — refetch when the filter changes.
  useEffect(() => {
    let alive = true;
    setTrend(null);
    getRouteTrend(route).then(t => alive && setTrend(t)).catch(() => {});
    getFaresRaw({ route, date_from: dateFrom, date_to: dateTo, nonstop_only: nonstop, limit: 15 })
      .then(r => alive && setFares({ records: r.records, total: r.total })).catch(() => {});
    return () => { alive = false; };
  }, [route, dateFrom, dateTo, nonstop]);

  return (
    <div className="relative min-h-screen">
      <div className="fixed inset-0 -z-10 opacity-50 pointer-events-none">
        <Aurora colorStops={['#5227FF', '#22d3ee', '#7c5cff']} amplitude={0.9} blend={0.6} speed={0.5} />
      </div>
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-[#07070c]/30 via-[#07070c]/80 to-[#07070c] pointer-events-none" />

      <TopBar meta={meta} tab={tab} onTab={setTab} alertCount={alerts?.alerts.filter(a => a.is_cheap).length ?? 0} />

      <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-8 space-y-5">
        {loading && <Loading label="Loading airfare index…" />}
        {!loading && (error || !daily || !heatmap || !meta) && (
          <ErrorState message={error ?? 'No data returned. Is the backend running on :8000?'} />
        )}

        {alerts?.any_cheap && !bannerDismissed && (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.08] px-4 py-3">
            <span className="text-[13px] font-semibold text-emerald-200">Low fare today</span>
            <span className="text-[13px] text-white/80">
              {alerts.alerts.filter(a => a.is_cheap).map(a => `${a.route} ${inr(a.today_fare ?? 0)} (${a.pct_below_baseline}% below baseline)`).join(' · ')}
            </span>
            <button onClick={() => setTab('my-routes')} className="text-[12.5px] text-emerald-200 underline underline-offset-2">View my routes</button>
            <button onClick={() => setBannerDismissed(true)} className="ml-auto text-white/40 hover:text-white text-[13px]" aria-label="Dismiss">✕</button>
          </div>
        )}

        {!loading && meta && tab === 'festivals' && <Section><FestivalsTab routes={meta.routes} /></Section>}
        {!loading && meta && tab === 'my-routes' && (
          <Section><MyRoutesTab browserId={browserId} routes={meta.routes} alerts={alerts} onAlertsChange={setAlerts} /></Section>
        )}

        {!loading && daily && heatmap && meta && tab === 'overview' && (
          <>
            <Section><HeroStat daily={daily} meta={meta} /></Section>
            <Section><TrendChart daily={daily} forecast={forecast} /></Section>

            <Section>
              <FilterPanel
                routes={meta.routes} route={route} onRoute={setRoute}
                dateFrom={dateFrom} dateTo={dateTo} onDates={(f, t) => { setDateFrom(f); setDateTo(t); }}
                nonstop={nonstop} onNonstop={setNonstop}
              />
            </Section>

            <Section>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <Heatmap data={heatmap} selectedRoute={route} onSelectRoute={setRoute} />
                <ElasticityChart trend={trend} />
              </div>
            </Section>

            <Section><BacktestPanel /></Section>

            <Section>
              <Panel
                title={`Latest scraped fares · ${route}`}
                subtitle={`${fares.total} cleaned records from /fares/raw · travel ${dateFrom} → ${dateTo}${nonstop ? ' · nonstop' : ''} · showing ${fares.records.length}`}
              >
                {fares.records.length === 0 ? (
                  <p className="text-[13px] text-white/40 py-6 text-center">No fares in this date range.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                      <thead className="text-white/40 text-left">
                        <tr>
                          {['Flight', 'Airline', 'Travel date', 'Dep', 'Stops', 'Days out', 'Window', 'Total fare', 'Source', 'Scraped'].map(h => (
                            <th key={h} className="font-medium pb-2 pr-4 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="tabular-nums">
                        {fares.records.map((f, i) => (
                          <tr key={i} className={`border-t border-white/[0.06] ${f.is_outlier ? 'text-white/35' : 'text-white/80'}`}>
                            <td className="py-1.5 pr-4 whitespace-nowrap">{f.flight_number ?? f.carrier}</td>
                            <td className="py-1.5 pr-4 whitespace-nowrap">{f.carrier_name ?? f.carrier}</td>
                            <td className="py-1.5 pr-4">{f.travel_date}</td>
                            <td className="py-1.5 pr-4">{f.departure_time ?? '—'}</td>
                            <td className="py-1.5 pr-4">{f.stops == null ? '—' : f.stops === 0 ? 'Nonstop' : `${f.stops} stop`}</td>
                            <td className="py-1.5 pr-4">{f.advance_purchase_days}</td>
                            <td className="py-1.5 pr-4">{f.advance_purchase_window}</td>
                            <td className="py-1.5 pr-4 font-semibold text-white">
                              {inr(f.total_fare)}{f.is_outlier && <span className="ml-1 text-[10px] text-amber-300/80">outlier</span>}
                            </td>
                            <td className="py-1.5 pr-4">{f.source}</td>
                            <td className="py-1.5 pr-4 text-white/45 whitespace-nowrap">{f.scraped_at.replace('T', ' ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </Section>

            <footer className="pt-2 pb-6 text-[11.5px] text-white/30">
              Prototype for SIH 2026 · MoSPI PS · Not an official statistic. Data mode: <b>{meta.data_mode}</b>
              {meta.snapshot_at && <> · latest real snapshot {meta.snapshot_at.replace('T', ' ')}</>}
              {meta.n_synthetic_days > 0 && <> · {meta.n_synthetic_days} seeded history days are synthetic and disclosed in the chart</>}.
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
