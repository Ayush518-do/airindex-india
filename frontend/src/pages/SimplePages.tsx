import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import FestivalsTab from '../components/FestivalsTab';
import OfficialCpiPanel from '../components/OfficialCpiPanel';
import MyRoutesTab from '../components/MyRoutesTab';
import AboutTab from '../components/AboutTab';
import { resetGuide } from '../components/Guide';
import { Section } from '../components/Motion';
import { usePageTitle } from '../components/Layout';
import { EmptyState, Panel, PanelSkeleton } from '../components/ui';
import { useAppData } from '../lib/appData';

/** Thin page wrappers: each sets its title and hands shared data to an existing component. */

export function FestivalsPage() {
  usePageTitle('Festival prices');
  const { meta } = useAppData();
  return meta ? <FestivalsTab routes={meta.routes} /> : <PanelSkeleton height={320} />;
}

export function OfficialPage() {
  usePageTitle('Official airfare data');
  return (
    <>
      <PageHeader title="Official airfare data"
        lead="The government's own monthly airfare index from the Ministry of Statistics (MoSPI), since 2014 — and how our daily index lines up with it." />
      <Section><OfficialCpiPanel /></Section>
    </>
  );
}

export function AlertsPage() {
  usePageTitle('My price alerts');
  const { meta, browserId, alerts, setAlerts } = useAppData();
  return meta
    ? <MyRoutesTab browserId={browserId} routes={meta.routes} alerts={alerts} onAlertsChange={setAlerts} />
    : <PanelSkeleton height={320} />;
}

export function AboutPage() {
  usePageTitle('How it works');
  const { meta } = useAppData();
  const navigate = useNavigate();
  return <AboutTab meta={meta} onReplayGuide={() => { resetGuide(); navigate('/?tour=1'); }} />;
}

export function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <Panel title="Page not found">
      <EmptyState icon="🧭" title="We couldn't find that page" message="The link may be old or mistyped.">
        <Link to="/" className="btn-primary mt-3 inline-flex">Go to the home page</Link>
      </EmptyState>
    </Panel>
  );
}
