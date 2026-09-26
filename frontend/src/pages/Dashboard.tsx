import { useCallback, useEffect, useState } from 'react';
import Aurora from '../components/reactbits/Aurora';
import TopBar, { type Tab } from '../components/TopBar';
import PageHeader from '../components/PageHeader';
import HomeSummary from '../components/HomeSummary';
import HeroStat from '../components/HeroStat';
import TrendChart from '../components/TrendChart';
import Heatmap from '../components/Heatmap';
import { FilterPanel, ElasticityChart } from '../components/RoutePanel';
import OfficialCpiPanel from '../components/OfficialCpiPanel';
import FestivalsTab from '../components/FestivalsTab';
import MyRoutesTab from '../components/MyRoutesTab';
import AboutTab from '../components/AboutTab';
import Guide, { guideDone, resetGuide } from '../components/Guide';
import { Section } from '../components/Motion';
import { ErrorState, Panel, PanelSkeleton, Skeleton, EmptyState, Badge, InfoTip, inr, fmtDate } from '../components/ui';
import { GLOSSARY } from '../lib/glossary';
import { getBrowserId } from '../lib/browserId';
import { setCities, routeLabel } from '../lib/cities';
import { useMotionSettings } from '../lib/motion';
import {
  getMeta, getIndexDaily, getIndexForecast, getHeatmap, getRouteTrend, getFaresRaw, getRouteAlerts, getCities,
  friendlyError,
  type Meta, type IndexDaily, type IndexForecast, type Heatmap as HeatmapData, type RouteTrend, type FareRecord, type RouteAlerts,
} from '../services/api';

// Local-date ISO string (toISOString() is UTC and shifts the day in IST).
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const defaultFrom = () => iso(new Date());
const defaultTo = () => iso(new Date(Date.now() + 60 * 864e5));

export default function Dashboard({ introActive = false }: { introActive?: boolean }) {
  const { heavyEffects } = useMotionSettings();
  const [tab, setTab] = useState<Tab>('overview');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [daily, setDaily] = useState<IndexDaily | null>(null);
  const [forecast, setForecast] = useState<IndexForecast | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [route, setRoute] = useState('DEL-BOM');
  const [trend, setTrend] = useState<RouteTrend | null>(null);
  const [fares, setFares] = useState<{ records: FareRecord[]; total: number; message?: string | null }>({ records: [], total: 0 });
  const [faresLoading, setFaresLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [nonstop, setNonstop] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [browserId] = useState(getBrowserId);
  const [alerts, setAlerts] = useState<RouteAlerts | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // Global data, fetched once. Cities load alongside /meta so every label is
  // ready before the first chart renders — no flash of bare airport codes.
  const loadAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [m, d, f, h, cities] = await Promise.all([
        getMeta(), getIndexDaily(), getIndexForecast(5), getHeatmap(), getCities(),
      ]);
      setCities(cities);
      setMeta(m); setDaily(d); setForecast(f); setHeatmap(h);
      if (!m.routes.includes(route)) setRoute(m.routes[0]);
      getRouteAlerts(browserId).then(setAlerts).catch(() => {});
    } catch (e) {
      setError(friendlyError(e));
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserId]);
  useEffect(() => { loadAll(); }, [loadAll]);

  // Route-scoped data — refetch when the filters change.
  useEffect(() => {
    let alive = true;
    setTrend(null); setFaresLoading(true);
    getRouteTrend(route).then(t => alive && setTrend(t)).catch(() => {});
    getFaresRaw({ route, date_from: dateFrom, date_to: dateTo, nonstop_only: nonstop, limit: 15 })
      .then(r => alive && setFares({ records: r.records, total: r.total, message: r.message }))
      .catch(() => alive && setFares({ records: [], total: 0 }))
      .finally(() => alive && setFaresLoading(false));
    return () => { alive = false; };
  }, [route, dateFrom, dateTo, nonstop]);

  // First-visit tour: after the intro, once there is something to point at.
  useEffect(() => {
    if (!introActive && !loading && !error && tab === 'overview' && daily?.available && !guideDone()) {
      const t = window.setTimeout(() => setShowGuide(true), 600);
      return () => clearTimeout(t);
    }
  }, [introActive, loading, error, tab, daily]);

  const resetFilters = () => { setRoute(meta?.routes[0] ?? 'DEL-BOM'); setDateFrom(defaultFrom()); setDateTo(defaultTo()); setNonstop(true); };
  const goTab = (t: Tab) => { setTab(t); window.scrollTo({ top: 0, behavior: heavyEffects ? 'smooth' : 'auto' }); };
  const cheapAlerts = alerts?.alerts.filter(a => a.is_cheap) ?? [];

  return (
    <div className="relative min-h-screen">
      {/* Slowly drifting pastel sky behind the top of the page. Light mode of
          Aurora is fully opaque and quite saturated, so it is dimmed and faded
          into the page colour; off entirely under reduced motion. */}
      {heavyEffects && (
        <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[70vh] opacity-45">
          <Aurora colorStops={['#9cc4f2', '#c3b6fb', '#a8d8f5']} amplitude={0.8} blend={0.7} speed={0.35} lightMode />
        </div>
      )}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[70vh] bg-gradient-to-b from-transparent via-page/40 to-page" />

      <TopBar meta={meta} tab={tab} onTab={goTab} alertCount={cheapAlerts.length} />

      <main id="main" className="mx-auto max-w-[1280px] space-y-5 px-4 py-6 md:px-8 md:py-8">
        {loading && (
          <div className="space-y-5" role="status" aria-label="Loading prices">
            <Skeleton className="h-36 w-full !rounded-2xl" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Skeleton className="h-44 md:col-span-2 !rounded-2xl" />
              <Skeleton className="h-44 !rounded-2xl" />
            </div>
            <PanelSkeleton height={300} />
          </div>
        )}
        {!loading && error && <ErrorState message={error} onRetry={loadAll} />}

        {!loading && !error && cheapAlerts.length > 0 && !bannerDismissed && (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-good/25 bg-good-soft px-4 py-3">
            <span className="text-[15px] font-semibold text-good">Good time to book!</span>
            <span className="text-[14px] text-ink-2">
              {cheapAlerts.map(a => `${a.label ?? routeLabel(a.route)} is ${a.pct_below_baseline}% cheaper than usual (${inr(a.today_fare ?? 0)})`).join(' · ')}
            </span>
            <button onClick={() => goTab('my-routes')} className="text-[14px] font-semibold text-good underline underline-offset-2">See my alerts</button>
            <button onClick={() => setBannerDismissed(true)} className="ml-auto rounded px-1 text-[16px] text-ink-3 hover:text-ink" aria-label="Dismiss">✕</button>
          </div>
        )}

        {!loading && !error && meta && tab === 'festivals' && <FestivalsTab routes={meta.routes} />}
        {!loading && !error && meta && tab === 'my-routes' && (
          <MyRoutesTab browserId={browserId} routes={meta.routes} alerts={alerts} onAlertsChange={setAlerts} />
        )}
        {!loading && !error && tab === 'about' && (
          <AboutTab meta={meta} onReplayGuide={() => { resetGuide(); goTab('overview'); setShowGuide(true); }} />
        )}

        {!loading && !error && daily && heatmap && meta && tab === 'overview' && (
          <>
            <PageHeader title="Airfares today"
              lead="How much domestic flights cost right now, the best time to book, and how today compares with official figures." />

            {!daily.available ? (
              <Panel title="No prices yet">
                <EmptyState title="We haven't collected any fares yet"
                  message={daily.message ?? 'Prices appear after the next daily check, usually by 8 am. Check back soon.'} />
              </Panel>
            ) : (
              <>
                <Section><HomeSummary daily={daily} heatmap={heatmap} windowShort={meta.window_short} onSetAlert={() => goTab('my-routes')} /></Section>
                <Section><HeroStat daily={daily} meta={meta} /></Section>
                <Section><TrendChart daily={daily} forecast={forecast} /></Section>

                <Section>
                  <FilterPanel
                    routes={meta.routes} route={route} onRoute={setRoute}
                    dateFrom={dateFrom} dateTo={dateTo} onDates={(f, t) => { setDateFrom(f); setDateTo(t); }}
                    nonstop={nonstop} onNonstop={setNonstop} onReset={resetFilters}
                  />
                </Section>

                <Section>
                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                    <div data-tour="prices">
                      <Heatmap data={heatmap} windowShort={meta.window_short} selectedRoute={route} onSelectRoute={setRoute} />
                    </div>
                    <ElasticityChart trend={trend} />
                  </div>
                </Section>

                <Section><OfficialCpiPanel /></Section>

                <Section>
                  <FaresTable route={route} fares={fares} loading={faresLoading} windowShort={meta.window_short}
                    dateFrom={dateFrom} dateTo={dateTo} nonstop={nonstop} />
                </Section>
              </>
            )}
          </>
        )}

        {!loading && !error && meta && (
          <footer className="pb-6 pt-2 text-[13px] leading-relaxed text-ink-3">
            A Smart India Hackathon 2026 project for MoSPI · not an official statistic.
            {meta.snapshot_at && <> Prices last checked {new Date(meta.snapshot_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.</>}
            {meta.demo_mode && <> <b className="text-warn">Demo mode is on — the price history includes example data.</b></>}
          </footer>
        )}
      </main>

      {showGuide && tab === 'overview' && <Guide onClose={() => setShowGuide(false)} />}
    </div>
  );
}

function FaresTable({ route, fares, loading, windowShort, dateFrom, dateTo, nonstop }: {
  route: string; fares: { records: FareRecord[]; total: number; message?: string | null }; loading: boolean;
  windowShort: Record<string, string>; dateFrom: string; dateTo: string; nonstop: boolean;
}) {
  return (
    <Panel
      title={<>Flights we found · {routeLabel(route)}</>}
      info={GLOSSARY.nonstop.short}
      subtitle={<>{fares.total.toLocaleString('en-IN')} fares for travel between {fmtDate(dateFrom)} and {fmtDate(dateTo)}{nonstop ? ', direct flights only' : ''} · cheapest first{fares.records.length < fares.total ? `, showing ${fares.records.length}` : ''}</>}
    >
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : fares.records.length === 0 ? (
        <EmptyState icon="🔎" title="No flights found for these dates"
          message={fares.message ?? 'Try a wider date range, or include flights with stops.'} />
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[760px] text-[14px]">
            <caption className="sr-only">Individual fares found for {routeLabel(route)}</caption>
            <thead className="text-left text-[13px] text-ink-3">
              <tr>
                <th scope="col" className="whitespace-nowrap pb-2 pr-4 font-semibold">Airline</th>
                <th scope="col" className="whitespace-nowrap pb-2 pr-4 font-semibold">Flight</th>
                <th scope="col" className="whitespace-nowrap pb-2 pr-4 font-semibold">Travel date</th>
                <th scope="col" className="whitespace-nowrap pb-2 pr-4 font-semibold">Departs</th>
                <th scope="col" className="whitespace-nowrap pb-2 pr-4 font-semibold">Stops</th>
                <th scope="col" className="whitespace-nowrap pb-2 pr-4 font-semibold">
                  <span className="inline-flex items-center gap-1.5">Booked <InfoTip>{GLOSSARY.daysBefore.short}</InfoTip></span>
                </th>
                <th scope="col" className="whitespace-nowrap pb-2 pr-4 text-right font-semibold">Fare</th>
                <th scope="col" className="whitespace-nowrap pb-2 font-semibold">Found on</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[...fares.records].sort((a, b) => a.total_fare - b.total_fare).map((f, i) => (
                <tr key={i} className="border-t border-line text-ink-2">
                  <td className="py-2 pr-4 font-medium text-ink">{f.carrier_name ?? f.carrier}</td>
                  <td className="whitespace-nowrap py-2 pr-4">{f.flight_number ?? '—'}</td>
                  <td className="whitespace-nowrap py-2 pr-4">{fmtDate(f.travel_date)}</td>
                  <td className="py-2 pr-4">{f.departure_time ?? '—'}</td>
                  <td className="py-2 pr-4">{f.stops == null ? '—' : f.stops === 0 ? 'Direct' : `${f.stops} stop${f.stops > 1 ? 's' : ''}`}</td>
                  <td className="whitespace-nowrap py-2 pr-4">
                    {f.advance_purchase_days} day{f.advance_purchase_days === 1 ? '' : 's'} ahead
                    <span className="block text-[12px] text-ink-3">{windowShort[f.advance_purchase_window] ?? ''}</span>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-right font-semibold text-ink">
                    {inr(f.total_fare)}
                    {f.is_outlier && <span className="ml-1.5 align-middle"><Badge tone="warn">unusually high · not counted</Badge></span>}
                  </td>
                  <td className="py-2 capitalize">{f.source.replace(/_/g, ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
