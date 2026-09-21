import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import IndexTrend from './pages/IndexTrend';
import { RoutesList, RouteDetailPage } from './pages/Routes';
import Airlines from './pages/Airlines';
import NetworkMap from './pages/NetworkMap';
import BookingWindow from './pages/BookingWindow';
import Anomalies from './pages/Anomalies';
import DataQuality from './pages/DataQuality';
import Methodology from './pages/Methodology';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="index-trend" element={<IndexTrend />} />
          <Route path="routes" element={<RoutesList />} />
          <Route path="routes/:routeId" element={<RouteDetailPage />} />
          <Route path="airlines" element={<Airlines />} />
          <Route path="map" element={<NetworkMap />} />
          <Route path="booking-window" element={<BookingWindow />} />
          <Route path="anomalies" element={<Anomalies />} />
          <Route path="data-quality" element={<DataQuality />} />
          <Route path="methodology" element={<Methodology />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
