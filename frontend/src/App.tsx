import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import IntroSplash from './components/IntroSplash';
import CursorEffects from './components/CursorEffects';
import HomePage from './pages/HomePage';
import RoutesPage from './pages/RoutesPage';
import { FestivalsPage, OfficialPage, AlertsPage, AboutPage, NotFoundPage } from './pages/SimplePages';
import { AppDataProvider } from './lib/appData';
import { shouldShowIntro } from './lib/intro';

export default function App() {
  const [showIntro, setShowIntro] = useState(shouldShowIntro);

  return (
    <BrowserRouter>
      {/* Mounted immediately so the data fetch runs during the intro, not after. */}
      <AppDataProvider>
        {/* First focusable element: lets keyboard users jump past the navigation. */}
        <a href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:font-semibold focus:text-accent-ink focus:shadow-pop">
          Skip to content
        </a>
        <Routes>
          <Route element={<Layout introActive={showIntro} />}>
            <Route index element={<HomePage />} />
            <Route path="routes" element={<RoutesPage />} />
            <Route path="festivals" element={<FestivalsPage />} />
            <Route path="official" element={<OfficialPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
        <CursorEffects />
        {showIntro && <IntroSplash onDone={() => setShowIntro(false)} />}
      </AppDataProvider>
    </BrowserRouter>
  );
}
