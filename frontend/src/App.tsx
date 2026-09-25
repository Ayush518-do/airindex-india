import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import IntroSplash from './components/IntroSplash';
import { shouldShowIntro } from './lib/intro';

export default function App() {
  const [showIntro, setShowIntro] = useState(shouldShowIntro);

  return (
    <>
      {/* Mounted immediately so its data fetch runs during the intro, not after. */}
      <Dashboard />
      {showIntro && <IntroSplash onDone={() => setShowIntro(false)} />}
    </>
  );
}
