import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import CursorEffects from './components/CursorEffects';
import LandingPage from './pages/LandingPage';
import HomePage from './pages/HomePage';
import RoutesPage from './pages/RoutesPage';
import { FestivalsPage, OfficialPage, AlertsPage, AboutPage, NotFoundPage } from './pages/SimplePages';
import { AppDataProvider } from './lib/appData';

export default function App() {
  return (
    <BrowserRouter>
      {/* Data loads once for the whole app — including behind the landing
          page's video, so the dashboard is ready by the time anyone clicks. */}
      <AppDataProvider>
        {/* First focusable element: lets keyboard users jump past the navigation. */}
        <a href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:font-semibold focus:text-accent-ink focus:shadow-pop">
          Skip to content
        </a>
        <Routes>
          <Route index element={<LandingPage />} />
          <Route element={<Layout />}>
            <Route path="home" element={<HomePage />} />
            <Route path="routes" element={<RoutesPage />} />
            <Route path="festivals" element={<FestivalsPage />} />
            <Route path="official" element={<OfficialPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="about" element={<AboutPage />} />
            {/* Old links and obvious guesses land on the dashboard. */}
            <Route path="dashboard" element={<Navigate to="/home" replace />} />
            <Route path="index" element={<Navigate to="/home" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
        <CursorEffects />
      </AppDataProvider>
    </BrowserRouter>
  );
}
