import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const api = axios.create({ baseURL: API_BASE_URL });

export interface DashboardSummary {
  current_index: number;
  index_change: number | null;
  routes_covered: number;
  airlines_covered: number;
  observations_count: number;
  data_quality_score: number;
  last_updated: string;
  base_period: string;
  calculation_period: string;
  data_mode: string;
}

export interface IndexHistory {
  periods: string[];
  values: number[];
  base_period: string;
}

export interface RouteRow {
  id: number;
  origin: string | null;
  destination: string | null;
  region: string | null;
  distance_km: number | null;
  index: number | null;
  weight: number | null;
  contribution: number | null;
}

export interface RouteDetail {
  route_id: number;
  origin: string | null;
  destination: string | null;
  origin_city: string | null;
  destination_city: string | null;
  region: string | null;
  distance_km: number | null;
  current_average_fare: number | null;
  index_value: number | null;
  price_relative: number | null;
  weight: number | null;
  in_basket: boolean;
  observation_count: number;
  anomaly_count: number;
  volatility: number;
  airline_breakdown: { airline: string; average_fare: number; observation_count: number }[];
}

export interface AnomalyRow {
  id: number;
  route: string | null;
  fare: number;
  expected: number;
  deviation: number;
  severity: string;
  status: string;
  algorithm: string;
  detected_at: string | null;
}

export interface AirlineRow {
  id: number;
  iata_code: string;
  name: string;
  contribution: number | null;
}

export interface DataQuality {
  observation_coverage: number;
  route_coverage: number;
  airline_coverage: number;
  source_availability: number;
  missing_data_rate: number;
  validation_rate: number;
  overall_score: number;
  total_observations: number;
  total_routes: number;
  total_airlines: number;
}

export interface Airport {
  id: number;
  iata_code: string;
  city: string;
  region: string;
  latitude: number;
  longitude: number;
}

export const getDashboardSummary = () =>
  api.get<DashboardSummary>('/api/dashboard/summary').then(r => r.data);
export const getIndexHistory = () =>
  api.get<IndexHistory>('/api/index/history').then(r => r.data);
export const getRoutes = () =>
  api.get<{ total: number; routes: RouteRow[] }>('/api/routes').then(r => r.data);
export const getRouteDetail = (id: number) =>
  api.get<RouteDetail>(`/api/routes/${id}`).then(r => r.data);
export const getAnomalies = () =>
  api.get<{ total: number; anomalies: AnomalyRow[] }>('/api/anomalies').then(r => r.data);
export const getAirlines = () =>
  api.get<{ total: number; airlines: AirlineRow[] }>('/api/airlines').then(r => r.data);
export const getDataQuality = () =>
  api.get<DataQuality>('/api/data-quality').then(r => r.data);
export const getSourceHealth = () =>
  api.get<{ sources: any[] }>('/api/source-health').then(r => r.data);
export const getBookingWindow = (routeId?: number) =>
  api.get<{ buckets: { bucket: string; average_fare: number; observation_count: number }[] }>(
    '/api/booking-window', { params: routeId ? { route_id: routeId } : {} },
  ).then(r => r.data);
export const getBookingHeatmap = () =>
  api.get<{ buckets: string[]; routes: { route_id: number; route: string; values: Record<string, number> }[] }>(
    '/api/booking-window/heatmap',
  ).then(r => r.data);
export const getRegions = () =>
  api.get<{ period: string; regions: { region: string; index_value: number; route_count: number }[] }>(
    '/api/regions',
  ).then(r => r.data);
export const getAirports = () =>
  api.get<{ airports: Airport[] }>('/api/airports').then(r => r.data);
