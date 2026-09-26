import PageHeader from '../components/PageHeader';
import HomeSummary from '../components/HomeSummary';
import HeroStat from '../components/HeroStat';
import TrendChart from '../components/TrendChart';
import QuickCards from '../components/QuickCards';
import { Section } from '../components/Motion';
import { usePageTitle } from '../components/Layout';
import { Panel, PanelSkeleton, Skeleton, EmptyState } from '../components/ui';
import { useAppData } from '../lib/appData';

export default function HomePage() {
  usePageTitle('Airfares today');
  const { meta, daily, forecast, heatmap, loading } = useAppData();

  return (
    <>
      <PageHeader title="Airfares today"
        lead="How much domestic flights cost right now, and the best time to book." />

      {loading || !meta || !daily || !heatmap ? (
        <div className="space-y-5" role="status" aria-label="Loading today's prices">
          <Skeleton className="h-36 w-full !rounded-2xl" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-44 !rounded-2xl" />)}
          </div>
          <PanelSkeleton height={300} />
        </div>
      ) : !daily.available ? (
        <Panel title="No prices yet">
          <EmptyState title="We haven't collected any fares yet"
            message={daily.message ?? 'Prices appear after the next daily check, usually by 8 am. Check back soon.'} />
        </Panel>
      ) : (
        <>
          <Section><HomeSummary daily={daily} heatmap={heatmap} windowShort={meta.window_short} /></Section>
          <Section><HeroStat daily={daily} meta={meta} /></Section>
          <Section><QuickCards meta={meta} heatmap={heatmap} /></Section>
          <Section><TrendChart daily={daily} forecast={forecast} /></Section>
        </>
      )}
    </>
  );
}
