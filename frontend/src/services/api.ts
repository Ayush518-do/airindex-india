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

export const getDashboardSummary = () =>
  api.get<DashboardSummary>('/api/dashboard/summary').then((r) => r.data);

export const getIndexHistory = () =>
  api.get<IndexHistory>('/api/index/history').then((r) => r.data);

export const getRoutes = () =>
  api.get<{ total: number; routes: RouteRow[] }>('/api/routes').then((r) => r.data);

export const getAnomalies = () =>
  api.get<{ total: number; anomalies: AnomalyRow[] }>('/api/anomalies').then((r) => r.data);
