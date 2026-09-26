import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const api = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });
export const API_DOCS_URL = `${API_BASE_URL}/docs`;

/**
 * Turn any API/network failure into one sentence a traveller can act on.
 * The backend already writes human-readable `detail` messages in its error
 * envelope ({error, detail, path}); network failures get their own wording.
 */
export function friendlyError(e: unknown): string {
  const err = e as { response?: { data?: { detail?: unknown } }; code?: string; message?: string };
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (err?.code === 'ECONNABORTED') return 'The server took too long to answer. Please try again in a moment.';
  if (!err?.response) return "We can't reach the server right now. Check your connection and try again.";
  return 'Something went wrong on our side. Please try again.';
}

// ---------------------------------------------------------------- types ---

/**
 * Endpoints that can legitimately have nothing to show return
 * `available: false` with a reason and a plain-English `message` (written for
 * travellers; the UI shows it as-is) instead of inventing data.
 */
export type UnavailableReason =
  | 'no_index_data' | 'insufficient_history' | 'no_official_data' | 'pending_overlap' | 'model_untrained';

interface Availability {
  available?: boolean;
  reason?: UnavailableReason | null;
  message?: string | null;
}

export interface City { code: string; city: string; state: string | null; airport: string | null; label: string }

export interface RouteInfo { route: string; origin: string; destination: string; label: string; weight: number }

export interface Meta {
  data_mode: 'live' | 'demo';
  demo_mode: boolean;
  has_data: boolean;
  snapshot_at: string | null;
  routes: string[];
  route_details: RouteInfo[];
  weights: Record<string, number>;
  windows: string[];
  window_labels: Record<string, string>;
  window_short: Record<string, string>;
  carriers: string[];
  n_real_days: number;
  n_synthetic_days: number;
  sources: { source: string; last_scraped_at: string | null; snapshots: number | null; records: number | null; synthetic: boolean }[];
  db_path: string | null;
}

export interface IndexPoint {
  date: string;
  value: number;
  change_pct: number | null;
  n_records: number;
  coverage?: number | null;
  is_synthetic?: boolean;
}

export interface IndexDaily extends Availability {
  index_name: string;
  base_date: string | null;
  base_value: number;
  weights: Record<string, number>;
  points: IndexPoint[];
  latest: { date: string; value: number; change_pct: number | null; change_abs: number | null } | null;
  n_real_days?: number;
  n_synthetic_days?: number;
}

export interface ForecastPoint { date: string; value: number; lower: number; upper: number }

export interface IndexForecast extends Availability {
  have?: number | null;
  need?: number | null;
  method?: string | null;
  history_days?: number | null;
  horizon_days?: number | null;
  slope_per_day?: number | null;
  r2?: number | null;
  residual_se?: number | null;
  points: ForecastPoint[];
}

export interface HeatmapCell { route: string; window: string; avg_fare: number; n: number }

export interface Heatmap extends Availability {
  date?: string | null;
  routes: string[];
  windows: string[];
  cells: HeatmapCell[];
}

export interface RouteWindow {
  window: string;
  label?: string | null;
  actual_avg: number | null;
  median?: number | null;
  predicted_avg: number | null;
  min_fare: number | null;
  max_fare: number | null;
  n: number;
}

export interface BestWindow {
  window: string; label: string; avg_fare: number;
  vs_window: string; vs_label: string; saving_pct: number;
}

export interface RouteTrend extends Availability {
  route: string;
  label?: string | null;
  date?: string | null;
  windows: RouteWindow[];
  carriers: { carrier: string; carrier_name?: string | null; avg_fare: number; n: number }[];
  best_window?: BestWindow | null;
  model?: { holdout_mape_pct?: number; holdout_mae_inr?: number } | null;
}

export interface FareRecord {
  origin: string;
  destination: string;
  route: string;
  carrier: string;
  carrier_name?: string | null;
  flight_number?: string | null;
  travel_date: string;
  departure_time?: string | null;
  duration_min?: number | null;
  stops?: number | null;
  advance_purchase_days: number;
  advance_purchase_window: string;
  fare_class: string;
  total_fare: number;
  source: string;
  scraped_at: string;
  scrape_date?: string | null;
  is_outlier?: boolean;
  is_synthetic?: boolean;
}

export interface FaresPage extends Availability {
  count: number; total: number; records: FareRecord[];
  offset?: number; limit?: number; has_more?: boolean; next_offset?: number | null;
}

export interface Festival { name: string; start: string; end: string; observed?: string }

export interface SurgeRow {
  festival: string;
  route: string;
  label?: string | null;
  normal_avg: number;
  festival_avg: number;
  surge_pct: number;
  n_festival: number;
  n_normal: number;
  windows?: string[];
  basis?: string | null;
}

export interface FestivalSurge extends Availability {
  festivals: Festival[];
  surge: SurgeRow[];
  n_records?: number;
}

export interface SavedRoute {
  id: number;
  browser_id: string;
  origin: string;
  destination: string;
  route?: string | null;
  label?: string | null;
  preferred_days: string[];
  email: string;
  created_at: string;
  last_notified_at: string | null;
}

export interface RouteAlerts {
  browser_id: string;
  checked_at: string;
  any_cheap: boolean;
  threshold_pct: number;
  baseline_days: number;
  alerts: {
    route: string;
    label?: string | null;
    today_fare: number | null;
    baseline_fare: number | null;
    pct_below_baseline: number | null;
    is_cheap: boolean;
    last_notified_at?: string | null;
  }[];
}

export interface BookingWindow {
  window: string; label: string; typical_days: number | null; avg_fare: number; n: number; days: number;
}

export interface BestTime extends Availability {
  route: string;
  label: string;
  best?: BookingWindow | null;
  worst?: BookingWindow | null;
  saving_pct?: number | null;
  windows: BookingWindow[];
  n_days: number;
  summary?: string | null;
}

export interface Prediction {
  route: string; carrier: string; travel_date: string; as_of: string; predicted_fare: number;
  features: Record<string, string | number>;
  model: { holdout_mae_inr: number; holdout_mape_pct: number; holdout_r2: number; n_real: number; n_synthetic: number };
}

export interface OfficialPoint { period: string; index: number; inflation_pct: number | null; status?: string | null }

export interface OfficialCompare extends Availability {
  official?: {
    source: string; item_name: string; base_year: number;
    first_period: string; latest_period: string; n_months: number;
    points: OfficialPoint[];
  };
  apix?: {
    n_months: number; first_period: string | null;
    points: { period: string; value: number; n_days: number; linked_value: number }[];
  };
  link?: { period: string; official_index: number; scale: number; basis: string };
  overlap?: {
    available: boolean; overlap_months: number; need?: number; reason?: string; message?: string;
    correlation?: number | null; mae_index_points?: number; mape_pct?: number; periods?: string[];
  };
  seasonal?: {
    note: string; current_month: string;
    months: { month_num: number; month: string; mean_change_pct: number;
              min_change_pct: number; max_change_pct: number; n_years: number }[];
  };
}

// ---------------------------------------------------------------- calls ---

export const getMeta = () => api.get<Meta>('/meta').then(r => r.data);
export const getCities = () => api.get<City[]>('/meta/cities').then(r => r.data);
export const getIndexDaily = () => api.get<IndexDaily>('/index/daily').then(r => r.data);
export const getIndexForecast = (days = 5) =>
  api.get<IndexForecast>('/index/forecast', { params: { days } }).then(r => r.data);
export const getHeatmap = () => api.get<Heatmap>('/index/heatmap').then(r => r.data);
export const getRouteTrend = (route: string) =>
  api.get<RouteTrend>(`/routes/${route}/trend`).then(r => r.data);
export const getFaresRaw = (params: {
  route?: string; date_from?: string; date_to?: string; limit?: number; offset?: number; nonstop_only?: boolean;
}) => api.get<FaresPage>('/fares/raw', { params }).then(r => r.data);
export const getFestivalSurge = () => api.get<FestivalSurge>('/festivals/surge').then(r => r.data);
export const saveRoute = (body: {
  browser_id: string; origin: string; destination: string; preferred_days: string[]; email: string;
}) => api.post<SavedRoute>('/routes/save', body).then(r => r.data);
export const getSavedRoutes = (browserId: string) =>
  api.get<{ browser_id: string; routes: SavedRoute[] }>(`/routes/saved/${browserId}`).then(r => r.data);
/** Only deletes if the alert belongs to this browser (checked server-side). */
export const deleteSavedRoute = (browserId: string, id: number) =>
  api.delete(`/routes/${id}`, { headers: { 'X-Browser-Id': browserId } }).then(() => undefined);
export const getBestTime = (route: string) => api.get<BestTime>(`/routes/${route}/best-time`).then(r => r.data);
export const getFestivalCalendar = () =>
  api.get<{ festivals: Festival[] }>('/festivals/calendar').then(r => r.data);
export const getRouteAlerts = (browserId: string) =>
  api.get<RouteAlerts>(`/routes/${browserId}/alerts`).then(r => r.data);
export const getOfficialCompare = () => api.get<OfficialCompare>('/official/compare').then(r => r.data);
export const getPrediction = (params: { route: string; travel_date: string; carrier?: string }) =>
  api.get<Prediction>('/predict', { params }).then(r => r.data);
