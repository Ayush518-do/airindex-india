import PageHeader from './PageHeader';
import { Section } from './Motion';
import { Panel } from './ui';
import { GLOSSARY, GLOSSARY_ORDER } from '../lib/glossary';
import { routeLabel } from '../lib/cities';
import { API_DOCS_URL, type Meta } from '../services/api';

export default function AboutTab({ meta, onReplayGuide }: { meta: Meta | null; onReplayGuide: () => void }) {
  const routes = meta?.route_details ?? [];
  return (
    <div className="space-y-5">
      <PageHeader title="How it works"
        lead="What this site measures, where the numbers come from, and what the words mean — in plain English.">
        <button onClick={onReplayGuide} className="btn-ghost">↺ Show me around again</button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section>
          <Panel title="What is this?" className="h-full">
            <div className="space-y-3 text-[15px] leading-relaxed text-ink-2">
              <p>
                AIRINDEX INDIA tracks what domestic flights cost, every day. We check the same flights each morning
                and turn them into one number — the <b className="text-ink">Airfare Price Index</b> — so you can see at
                a glance whether flying is getting cheaper or more expensive.
              </p>
              <p>
                It also shows the best time to book each route, how festivals push prices up, and can email you when a
                route you care about gets cheaper than usual.
              </p>
            </div>
          </Panel>
        </Section>

        <Section delay={0.05}>
          <Panel title="Where the prices come from" className="h-full">
            <div className="space-y-3 text-[15px] leading-relaxed text-ink-2">
              <p>
                Every morning we look up direct economy fares on public booking sites for flights 2, 5, 10, 21 and 45
                days away. We read only what any visitor would see, follow each site's rules about automated access,
                and pause several seconds between pages so we never put strain on them.
              </p>
              <p>
                We compare with the government's official airfare index, published monthly by the Ministry of
                Statistics (MoSPI).
              </p>
            </div>
          </Panel>
        </Section>

        <Section>
          <Panel title="How the index is worked out" className="h-full">
            <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-ink-2">
              <li>For each route and each booking time, we take the average fare of the day.</li>
              <li>We compare it with the same route and booking time on our first day.</li>
              <li>Busier routes count for more — {routes[0] ? routeLabel(routes[0].route) : 'Delhi → Mumbai'} counts the most, because the most people fly it.</li>
              <li>We combine them into one number, where our first day = 100.</li>
            </ol>
            <p className="mt-3 rounded-xl bg-sky-soft px-3 py-2.5 text-[14px] text-ink-2">
              <b className="text-ink">Example:</b> if every route got 5% more expensive, the index would read 105.
              If half got 10% more expensive and half stayed the same, it would read about 105 too.
            </p>
          </Panel>
        </Section>

        <Section delay={0.05}>
          <Panel title="Routes we follow" className="h-full">
            <ul className="space-y-2">
              {routes.map(r => (
                <li key={r.route} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2 text-[14px]">
                  <span className="font-medium text-ink">{r.label}</span>
                  <span className="text-ink-3">counts {Math.round(r.weight * 100)}%</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-ink-3">{GLOSSARY.routeWeight.short}</p>
          </Panel>
        </Section>
      </div>

      <Section>
        <Panel title="Honest numbers">
          <ul className="space-y-2 text-[15px] leading-relaxed text-ink-2">
            <li>• Every price shown is one we actually found. When we don't have enough data yet, we say so instead of guessing.</li>
            <li>• A forecast only appears once we have at least 10 days of prices.</li>
            <li>• Unusually high one-off fares are set aside so they can't distort the average.</li>
            <li>• In presentations we sometimes switch on <b className="text-ink">demo mode</b>, which uses clearly-labelled example prices. A yellow "Demo data" badge is always shown when it's on, and real mode never mixes them in.</li>
          </ul>
        </Panel>
      </Section>

      <Section>
        <Panel title="Glossary" subtitle="Every term used on this site, explained.">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
            {GLOSSARY_ORDER.map(k => (
              <div key={k}>
                <dt className="text-[15px] font-semibold text-ink">{GLOSSARY[k].term}</dt>
                <dd className="mt-1 text-[14px] leading-relaxed text-ink-2">{GLOSSARY[k].short}</dd>
                <dd className="mt-1 text-[13px] leading-relaxed text-ink-3">{GLOSSARY[k].long}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </Section>

      <p className="text-center text-[13px] text-ink-3">
        Researchers and developers can use the same data through our{' '}
        <a href={API_DOCS_URL} target="_blank" rel="noreferrer" className="text-accent-ink underline underline-offset-2">open data API ↗</a>.
      </p>
    </div>
  );
}
