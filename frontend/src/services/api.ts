import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const api = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });
export const API_DOCS_URL = `${API_BASE_URL}/docs`;

// ---------------------------------------------------------------- types ---

/**
 * Endpoints that can legitimately have nothing to show return
 * `available: false` with a reason instead of inventing data. Populated
 * responses carry `available: true` plus the usual fields.
 */
export interface Unavailable {
  available: false;
  reason: 'no_index_data' | 'insufficient_history' | 'no_official_data' | 'pending_overlap';
  message: string;
  have?: number;
  need?: number;
}

export interface Meta {
  data_mode: 'live' | 'demo';
  demo_mode: boolean;
  has_data: boolean;
  snapshot_at: string | null;
  routes: string[];
  weights: Record<string, number>;
  windows: string[];
  carriers: string[];
  n_real_days: number;
  n_synthetic_days: number;
  sources: { source: string; last_scraped_at: string; snapshots: number; records: number; synthetic: boolean }[];
  db_path: string | null;
}

export interface IndexPoint {
  date: string;
  value: number;
  change_pct: number | null;
  n_records: number;
  coverage?: number;
  is_synthetic?: boolean;
}

export interface IndexDaily {
  available?: boolean;
  index_name: string;
  base_date: string;
  base_value: number;
  weights: Record<string, number>;
  points: IndexPoint[];
  latest: { date: string; value: number; change_pct: number | null; change_abs: number };
  n_real_days?: number;
  n_synthetic_days?: number;
}

export interface ForecastPoint {
  date: string;
  value: number;
  lower: number;
  upper: number;
}

export interface IndexForecast {
  available?: boolean;
  reason?: string;
  message?: string;
  have?: number;
  need?: number;
  method?: string;
  history_days?: number;
  horizon_days?: number;
  slope_per_day?: number;
  r2?: number | null;
  residual_se?: number | null;
  anchor?: { date: string; value: number };
  points: ForecastPoint[];
}

export interface HeatmapCell {
  route: string;
  window: string;
  avg_fare: number;
  n: number;
}

export interface Heatmap {
  available?: boolean;
  routes: string[];
  windows: string[];
  cells: HeatmapCell[];
}

export interface RouteWindow {
  window: string;
  actual_avg: number | null;
  median?: number | null;
  predicted_avg: number | null;
  min_fare: number | null;
  max_fare: number | null;
  n: number;
}

export interface RouteTrend {
  available?: boolean;
  route: string;
  date?: string;
  windows: RouteWindow[];
  carriers: { carrier: string; carrier_name?: string | null; avg_fare: number; n: number }[];
}

export interface FareRecord {
  origin: string;
  destination: string;
  route: string;
  carrier: string;
  travel_date: string;
  advance_purchase_days: number;
  advance_purchase_window: string;
  fare_class: string;
  base_fare: number | null;
  taxes: number | null;
  total_fare: number;
  scraped_at: string;
  scrape_date?: string;
  source: string;
  stops?: number | null;
  duration_min?: number | null;
  departure_time?: string | null;
  flight_number?: string | null;
  carrier_name?: string | null;
  is_outlier?: boolean;
  is_synthetic?: boolean;
}

export interface Festival { name: string; start: string; end: string; observed?: string }

export interface SurgeRow {
  festival: string;
  route: string;
  normal_avg: number;
  festival_avg: number;
  surge_pct: number;
  n_festival: number;
  n_normal: number;
  windows?: string[];
  basis?: 'same window' | 'route overall';
}

export interface FestivalSurge {
  available?: boolean;
  festivals: Festival[];
  surge: SurgeRow[];
  n_records?: number;
}

export interface SavedRoute {
  id: number | string;
  browser_id: string;
  origin: string;
  destination: string;
  preferred_days: string[];
  email: string;
  created_at: string;
  last_notified_at: string | null;
}

export interface RouteAlerts {
  browser_id: string;
  checked_at: string;
  any_cheap: boolean;
  alerts: {
    route: string;
    today_fare: number | null;
    baseline_fare: number | null;
    pct_below_baseline: number | null;
    is_cheap: boolean;
    last_notified_at?: string | null;
  }[];
}

export interface Prediction {
  route: string; carrier: string; travel_date: string; as_of: string; predicted_fare: number;
  features: Record<string, string | number>;
  model: { holdout_mae_inr: number; holdout_mape_pct: number; holdout_r2: number; n_real: number; n_synthetic: number };
}

export interface Backtest {
  reference: { name: string; intended_source: string; status: 'ILLUSTRATIVE' | 'OFFICIAL'; note: string; lead_times_days: number[]; unit: string };
  latest_month: string | null;
  comparison: { route: string; month: string | null; ours: number | null; n: number; reference: number | null; deviation_pct: number | null }[];
  mean_abs_deviation_pct: number | null;
  series: { month: string; ours_index: number | null; reference_index: number | null; ours_fare: number | null; reference_fare: number | null }[];
  include_synthetic: boolean;
}

export interface OfficialPoint { period: string; index: number; inflation_pct: number | null; status?: string }

export interface OfficialCpi {
  available: boolean;
  source?: string;
  level?: string;
  sector?: string;
  item_name?: string;
  item_code?: string;
  n_months?: number;
  points: OfficialPoint[];
  reason?: string;
  message?: string;
}

export interface OfficialCompare {
  available: boolean;
  reason?: string;
  message?: string;
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
export const getIndexDaily = () => api.get<IndexDaily>('/index/daily').then(r => r.data);
export const getIndexForecast = (days = 5) =>
  api.get<IndexForecast>('/index/forecast', { params: { days } }).then(r => r.data);
export const getHeatmap = () => api.get<Heatmap>('/index/heatmap').then(r => r.data);
export const getRouteTrend = (route: string) =>
  api.get<RouteTrend>(`/routes/${route}/trend`).then(r => r.data);
export const getFaresRaw = (params: {
  route?: string; date_from?: string; date_to?: string; limit?: number; offset?: number; nonstop_only?: boolean;
}) =>
  api.get<{ count: number; total: number; records: FareRecord[] }>('/fares/raw', { params }).then(r => r.data);
export const getFestivalSurge = () => api.get<FestivalSurge>('/festivals/surge').then(r => r.data);
export const saveRoute = (body: {
  browser_id: string; origin: string; destination: string; preferred_days: string[]; email: string;
}) => api.post<SavedRoute>('/routes/save', body).then(r => r.data);
export const getSavedRoutes = (browserId: string) =>
  api.get<{ browser_id: string; routes: SavedRoute[] }>(`/routes/saved/${browserId}`).then(r => r.data);
export const deleteSavedRoute = (browserId: string, id: number | string) =>
  api.delete(`/routes/saved/${browserId}/${id}`).then(() => undefined);
export const getRouteAlerts = (browserId: string) =>
  api.get<RouteAlerts>(`/routes/${browserId}/alerts`).then(r => r.data);
export const getOfficialCpi = (params?: { level?: string; sector?: string }) =>
  api.get<OfficialCpi>('/official/cpi', { params }).then(r => r.data);
export const getOfficialCompare = () => api.get<OfficialCompare>('/official/compare').then(r => r.data);
export const getBacktest = () => api.get<Backtest>('/backtest/dgca').then(r => r.data);
export const getPrediction = (params: { route: string; travel_date: string; carrier?: string }) =>
  api.get<Prediction>('/predict', { params }).then(r => r.data);
