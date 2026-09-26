import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getBrowserId } from './browserId';
import { setCities } from './cities';
import {
  getMeta, getIndexDaily, getIndexForecast, getHeatmap, getCities, getRouteAlerts, friendlyError,
  type Meta, type IndexDaily, type IndexForecast, type Heatmap, type RouteAlerts,
} from '../services/api';

/**
 * Data every page needs, loaded once for the whole app. Cities load alongside
 * /meta so no page ever renders a bare airport code, and a single `error` +
 * `reload` gives every page the same "backend is down — Retry" behaviour.
 */
interface AppData {
  meta: Meta | null;
  daily: IndexDaily | null;
  forecast: IndexForecast | null;
  heatmap: Heatmap | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  browserId: string;
  alerts: RouteAlerts | null;
  setAlerts: (a: RouteAlerts) => void;
  refreshAlerts: () => Promise<void>;
}

const Ctx = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [browserId] = useState(getBrowserId);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [daily, setDaily] = useState<IndexDaily | null>(null);
  const [forecast, setForecast] = useState<IndexForecast | null>(null);
  const [heatmap, setHeatmap] = useState<Heatmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<RouteAlerts | null>(null);

  const refreshAlerts = useCallback(async () => {
    try { setAlerts(await getRouteAlerts(browserId)); } catch { /* the banner is optional */ }
  }, [browserId]);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [m, d, f, h, cities] = await Promise.all([
        getMeta(), getIndexDaily(), getIndexForecast(5), getHeatmap(), getCities(),
      ]);
      setCities(cities);
      setMeta(m); setDaily(d); setForecast(f); setHeatmap(h);
      refreshAlerts();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [refreshAlerts]);

  useEffect(() => { reload(); }, [reload]);

  const value = useMemo<AppData>(() => ({
    meta, daily, forecast, heatmap, loading, error, reload: () => { reload(); },
    browserId, alerts, setAlerts, refreshAlerts,
  }), [meta, daily, forecast, heatmap, loading, error, reload, browserId, alerts, refreshAlerts]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData must be used inside <AppDataProvider>');
  return v;
}

/** Tracked routes as origin -> destinations, so pickers only offer real routes. */
export function routeGraph(routes: string[]) {
  const origins = Array.from(new Set(routes.map(r => r.split('-')[0])));
  const destinationsFrom = (o: string) => routes.filter(r => r.startsWith(`${o}-`)).map(r => r.split('-')[1]);
  return { origins, destinationsFrom };
}
