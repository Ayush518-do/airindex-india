import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import IntroSplash from './components/IntroSplash';
import CursorEffects from './components/CursorEffects';
import { shouldShowIntro } from './lib/intro';

export default function App() {
  const [showIntro, setShowIntro] = useState(shouldShowIntro);

  return (
    <>
      {/* First focusable element: lets keyboard users jump past the navigation. */}
      <a href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:font-semibold focus:text-accent-ink focus:shadow-pop">
        Skip to content
      </a>
      {/* Mounted immediately so its data fetch runs during the intro, not after. */}
      <Dashboard introActive={showIntro} />
      <CursorEffects />
      {showIntro && <IntroSplash onDone={() => setShowIntro(false)} />}
    </>
  );
}
