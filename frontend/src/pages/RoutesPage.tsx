import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Heatmap from '../components/Heatmap';
import BestTimeCard from '../components/BestTimeCard';
import FaresTable from '../components/FaresTable';
import { FilterPanel, ElasticityChart } from '../components/RoutePanel';
import { Section } from '../components/Motion';
import { usePageTitle } from '../components/Layout';
import { PanelSkeleton, Skeleton } from '../components/ui';
import { routeGraph, useAppData } from '../lib/appData';
import { routeLabel } from '../lib/cities';
import {
  friendlyError, getFaresRaw, getRouteTrend, type FareRecord, type RouteTrend,
} from '../services/api';

// Local-date ISO string (toISOString() is UTC and shifts the day in IST).
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const defaultFrom = () => iso(new Date());
const defaultTo = () => iso(new Date(Date.now() + 60 * 864e5));
const DEFAULT_ROUTE = 'DEL-BOM';

/**
 * Route prices. The chosen route lives in the URL (?from=DEL&to=BOM) so it
 * can be linked to, bookmarked and reached with the back button.
 */
export default function RoutesPage() {
  const { meta, heatmap, loading } = useAppData();
  const [params, setParams] = useSearchParams();

  const routes = useMemo(() => meta?.routes ?? [], [meta]);
  const graph = useMemo(() => routeGraph(routes), [routes]);
  const fallback = routes.includes(DEFAULT_ROUTE) ? DEFAULT_ROUTE : routes[0] ?? DEFAULT_ROUTE;

  // Resolve the URL to a tracked route; anything unknown falls back quietly.
  const qFrom = (params.get('from') ?? '').toUpperCase();
  const qTo = (params.get('to') ?? '').toUpperCase();
  const fromDests = graph.destinationsFrom(qFrom);
  const route = routes.includes(`${qFrom}-${qTo}`) ? `${qFrom}-${qTo}`
    : fromDests.length ? `${qFrom}-${fromDests[0]}`
    : fallback;
  const [origin, destination] = route.split('-');
  usePageTitle(meta ? `Prices · ${routeLabel(route)}` : 'Route prices');

  const setRoute = useCallback((r: string) => {
    const [o, d] = r.split('-');
    setParams(p => { const n = new URLSearchParams(p); n.set('from', o); n.set('to', d); return n; });
  }, [setParams]);

  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [nonstop, setNonstop] = useState(true);

  const [trend, setTrend] = useState<RouteTrend | null>(null);
  const [trendErr, setTrendErr] = useState<string | null>(null);
  const [fares, setFares] = useState<{ records: FareRecord[]; total: number; message?: string | null }>({ records: [], total: 0 });
  const [faresLoading, setFaresLoading] = useState(true);
  const [faresErr, setFaresErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!meta) return;
    let alive = true;
    setTrend(null); setTrendErr(null);
    getRouteTrend(route).then(t => alive && setTrend(t)).catch(e => alive && setTrendErr(friendlyError(e)));
    return () => { alive = false; };
  }, [meta, route, attempt]);

  useEffect(() => {
    if (!meta) return;
    let alive = true;
    setFaresLoading(true); setFaresErr(null);
    getFaresRaw({ route, date_from: dateFrom, date_to: dateTo, nonstop_only: nonstop, limit: 15 })
      .then(r => alive && setFares({ records: r.records, total: r.total, message: r.message }))
      .catch(e => alive && setFaresErr(friendlyError(e)))
      .finally(() => alive && setFaresLoading(false));
    return () => { alive = false; };
  }, [meta, route, dateFrom, dateTo, nonstop, attempt]);

  const retry = () => setAttempt(a => a + 1);
  const reset = () => { setRoute(fallback); setDateFrom(defaultFrom()); setDateTo(defaultTo()); setNonstop(true); };
  const onOrigin = (o: string) => {
    const dests = graph.destinationsFrom(o);
    setRoute(`${o}-${dests.includes(destination) ? destination : dests[0]}`);
  };

  return (
    <>
      <PageHeader title="Route prices"
        lead="Pick where you're flying from and to. See the best time to book, prices by booking time, and the actual flights we found." />

      {loading || !meta || !heatmap ? (
        <div className="space-y-5" role="status" aria-label="Loading route prices">
          <Skeleton className="h-24 w-full !rounded-2xl" />
          <PanelSkeleton height={160} />
          <PanelSkeleton height={280} />
        </div>
      ) : (
        <>
          <Section>
            <FilterPanel
              origins={graph.origins} destinations={graph.destinationsFrom(origin)}
              origin={origin} destination={destination}
              onOrigin={onOrigin} onDestination={d => setRoute(`${origin}-${d}`)}
              dateFrom={dateFrom} dateTo={dateTo} onDates={(f, t) => { setDateFrom(f); setDateTo(t); }}
              nonstop={nonstop} onNonstop={setNonstop} onReset={reset}
            />
          </Section>

          <Section><BestTimeCard route={route} /></Section>

          <Section>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <ElasticityChart trend={trend} error={trendErr} onRetry={retry} />
              <div data-tour="prices">
                <Heatmap data={heatmap} windowShort={meta.window_short} selectedRoute={route} onSelectRoute={setRoute} />
              </div>
            </div>
          </Section>

          <Section>
            <FaresTable route={route} fares={fares} loading={faresLoading} error={faresErr} onRetry={retry}
              windowShort={meta.window_short} dateFrom={dateFrom} dateTo={dateTo} nonstop={nonstop} />
          </Section>
        </>
      )}
    </>
  );
}
