import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import HeroVideo from '../components/HeroVideo';
import BlurText from '../components/reactbits/BlurText';
import AnimatedContent from '../components/reactbits/AnimatedContent';
import { MagnetButton, Section } from '../components/Motion';
import { useFlightTransition } from '../components/FlightTransition';
import { usePageTitle } from '../components/Layout';
import { AnimatedNumber, Badge, Skeleton, fmtMonth } from '../components/ui';
import { useAppData } from '../lib/appData';
import { useMotionSettings } from '../lib/motion';
import { PROBLEM, TEAM, initials } from '../lib/team';
import { getOfficialCompare, type OfficialCompare } from '../services/api';

// Local-date ISO (toISOString() is UTC and shifts the day in IST).
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** One line of the hero, rising in on a stagger (a plain block under reduced motion). */
function Rise({ at, children, className = '' }: { at: number; children: ReactNode; className?: string }) {
  const { heavyEffects } = useMotionSettings();
  if (!heavyEffects) return <div className={className}>{children}</div>;
  return (
    <AnimatedContent distance={18} duration={0.8} ease="power3.out" initialOpacity={0} delay={at} threshold={0} className={className}>
      {children}
    </AnimatedContent>
  );
}

/**
 * Real heading text for screen readers and the document outline; the
 * letter-by-letter blur-in is a decorative copy (BlurText renders a <p> of
 * spans, which would break up the heading).
 */
function Animated({ text, as: Tag, className, startDelay, by = 'words', step = 60 }: {
  text: string; as: 'h1' | 'p'; className: string; startDelay: number; by?: 'words' | 'letters'; step?: number;
}) {
  const { heavyEffects } = useMotionSettings();
  if (!heavyEffects) return <Tag className={className}>{text}</Tag>;
  return (
    <>
      <Tag className="sr-only">{text}</Tag>
      <div aria-hidden className={className}>
        {by === 'letters' ? (
          // One unbreakable group per word, so a narrow screen wraps between
          // words and never mid-word; letters still stagger continuously.
          <span className="flex flex-wrap gap-x-[0.25em]">
            {text.split(' ').map((word, i, words) => (
              <span key={i} className="whitespace-nowrap">
                <BlurText text={word} animateBy="letters" delay={step} threshold={0} direction="bottom" stepDuration={0.32}
                  startDelay={startDelay + words.slice(0, i).join('').length * step} />
              </span>
            ))}
          </span>
        ) : (
          <BlurText text={text} animateBy={by} delay={step} startDelay={startDelay} direction="bottom" stepDuration={0.32} threshold={0} />
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- icons ---
const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.6}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const ICONS = {
  scrape: 'M11 4a7 7 0 1 0 4.9 12l4.1 4M8 11h6M11 8v6',
  clean: 'M4 5h16l-6 7v6l-4 2v-8L4 5z',
  index: 'M4 19V5M4 19h16M7 15l4-4 3 3 5-6',
  alert: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20a2 2 0 0 0 4 0',
};

const STEPS = [
  { icon: ICONS.scrape, title: 'Scrape', body: 'Every morning we check direct economy fares on airline and travel sites, for flights 2 days to 2 months away. Politely: we follow each site’s rules and go slowly.' },
  { icon: ICONS.clean, title: 'Clean', body: 'Sold-out seats, placeholders and freak prices are set aside, so only real, comparable fares count.' },
  { icon: ICONS.index, title: 'Index', body: 'The fares become one number, the Airfare Price Index: 100 on our first day, weighted towards the busiest routes.' },
  { icon: ICONS.alert, title: 'Alert', body: 'If a route you follow gets more than 15% cheaper than usual, we email you. No account needed.' },
];

// ----------------------------------------------------------------- page ----
export default function LandingPage() {
  usePageTitle('Real-time Airfare Price Index for India');
  const { meta, daily, loading } = useAppData();
  const { go, overlay } = useFlightTransition();
  const [official, setOfficial] = useState<OfficialCompare | null>(null);
  const [officialDone, setOfficialDone] = useState(false);

  useEffect(() => {
    getOfficialCompare().then(setOfficial).catch(() => {}).finally(() => setOfficialDone(true));
  }, []);

  const explore = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Let modified clicks (new tab/window) behave like a normal link.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    go('/home');
  };

  // Live stat strip. Each card hides itself when its data is missing.
  const latest = daily?.available ? daily.latest : null;
  const lastPoint = daily?.points[daily.points.length - 1];
  const faresToday = lastPoint && lastPoint.n_records > 0 ? lastPoint : null;
  const cpiPoints = official?.official?.points ?? [];
  const cpi = cpiPoints.length ? cpiPoints[cpiPoints.length - 1] : null;
  const stats: { label: string; value: number; decimals?: number; note: string }[] = [];
  if (latest) stats.push({ label: "Today's airfare index", value: latest.value, decimals: 1, note: '100 = our first day' });
  if (meta?.routes.length) stats.push({ label: 'Routes tracked', value: meta.routes.length, note: 'busiest domestic routes' });
  if (faresToday) stats.push({
    label: faresToday.date === todayIso() ? 'Fares checked today' : 'Fares in latest check',
    value: faresToday.n_records, note: 'direct economy flights',
  });
  if (cpi) stats.push({ label: 'Official CPI airfare', value: cpi.index, decimals: 1, note: `MoSPI, ${fmtMonth(cpi.period)}` });
  const statsLoading = loading || !officialDone;

  const exploreBtn = (label: string) => (
    <MagnetButton>
      <Link to="/home" onClick={explore} className="btn-primary !px-6 !py-3 !text-[15px] shadow-pop">
        {label} <span aria-hidden>→</span>
      </Link>
    </MagnetButton>
  );
  const alertBtn = (
    <Link to="/alerts" className="btn-ghost !border-white/70 !bg-white/60 !px-6 !py-3 !text-[15px] !text-ink">
      <span aria-hidden>🔔</span> Set a price alert
    </Link>
  );

  return (
    <div className="relative min-h-screen bg-page text-ink">
      {/* ----------------------------------------------------- header -- */}
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-4 md:px-8">
          <Link to="/" className="rounded-lg text-[15px] font-bold tracking-[0.16em] text-ink" aria-label="AIRINDEX INDIA — welcome page">
            AIRINDEX INDIA
          </Link>
          {/* Demo mode must be unmistakable on every page, this one included. */}
          {meta?.demo_mode && <span className="mr-auto"><Badge tone="warn">Demo data — not real fares</Badge></span>}
          <nav aria-label="Main" className="flex items-center gap-1 text-[14px]">
            <Link to="/home" className="hidden rounded-full px-3 py-1.5 text-ink-2 hover:bg-white/60 hover:text-ink sm:inline-flex">Today's fares</Link>
            <Link to="/about" className="hidden rounded-full px-3 py-1.5 text-ink-2 hover:bg-white/60 hover:text-ink sm:inline-flex">How it works</Link>
            <Link to="/home" className="rounded-full border border-white/70 bg-white/60 px-4 py-1.5 font-semibold text-ink backdrop-blur hover:bg-white/85">
              Open dashboard
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="outline-none">
        {/* ------------------------------------------------------- hero -- */}
        <section aria-label="Welcome" className="relative flex min-h-[100svh] flex-col overflow-hidden">
          <HeroVideo />
          {/* Readability: cloud white on the LEFT only (desktop), from the TOP on
              phones where the text sits above the plane. The plane stays clear. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-page/95 via-page/85 via-40% to-transparent to-65% md:block" />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-page/95 via-page/80 via-45% to-page/10 md:hidden" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-page/85 to-transparent" />

          <div className="relative z-10 mx-auto flex w-full max-w-[1280px] flex-1 flex-col px-4 pb-6 pt-24 md:px-8 md:pt-32">
            <div className="max-w-[36rem]">
              <Rise at={0.5}>
                <p className="inline-flex rounded-full border border-white/70 bg-white/65 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-ink backdrop-blur sm:text-[12px]">
                  {PROBLEM.hackathon} · {PROBLEM.statement}
                </p>
              </Rise>

              <div className="mt-5">
                <Animated as="h1" text="AIRINDEX INDIA" by="letters" step={45} startDelay={650}
                  className="font-display text-[56px] leading-[0.95] text-ink sm:text-[80px] lg:text-[104px]" />
              </div>

              <Animated as="p" text="Real-time Airfare Price Index for India" startDelay={1250} step={70}
                className="mt-4 text-[20px] font-medium leading-snug text-ink sm:text-[24px]" />

              <Rise at={1.7}>
                <p className="mt-3 max-w-[32rem] text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">
                  Daily airfares from airlines and travel sites, compared with the government's official price index (MoSPI CPI).
                </p>
              </Rise>

              <Rise at={1.95} className="mt-7">
                <div className="flex flex-wrap items-center gap-3">
                  {exploreBtn("Explore today's fares")}
                  {alertBtn}
                </div>
              </Rise>

              <Rise at={2.2}>
                <p className="mt-7 text-[12px] font-medium uppercase tracking-[0.14em] text-ink-2">
                  For {PROBLEM.organisation} · {PROBLEM.division} · Theme: {PROBLEM.theme}
                </p>
              </Rise>
              <Rise at={2.35}>
                <p className="mt-2 text-[14px] text-ink-2">
                  Team <b className="font-semibold text-ink">{TEAM.name}</b> · {TEAM.college}
                </p>
              </Rise>
            </div>

            {/* Live numbers, from the same endpoints as the dashboard. */}
            <div className="mt-auto pt-10">
              {statsLoading ? (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="status" aria-label="Loading live numbers">
                  {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[92px] !rounded-2xl !bg-white/50" />)}
                </div>
              ) : stats.length > 0 && (
                <Rise at={2.5}>
                  <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {stats.map(s => (
                      <div key={s.label} className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3 shadow-card backdrop-blur-xl">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">{s.label}</dt>
                        <dd className="mt-1 font-display text-[34px] leading-none tabular-nums text-ink sm:text-[40px]">
                          <AnimatedNumber value={s.value} decimals={s.decimals ?? 0} />
                        </dd>
                        <dd className="mt-1 text-[12px] text-ink-3">{s.note}</dd>
                      </div>
                    ))}
                  </dl>
                </Rise>
              )}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------- how it works -- */}
        <section aria-labelledby="how-title" className="mx-auto max-w-[1280px] px-4 py-20 md:px-8 md:py-28">
          <Section>
            <p className="eyebrow">How it works</p>
            <h2 id="how-title" className="mt-3 max-w-2xl font-display text-[40px] leading-[1.1] text-ink sm:text-[52px]">
              From a search page to one honest number
            </h2>
          </Section>
          <ol className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <Section delay={i * 0.08}>
                  <div className="card h-full p-6">
                    <div className="flex items-center justify-between">
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-sky-soft text-sky-ink">
                        <Icon d={s.icon} />
                      </span>
                      <span aria-hidden className="font-display text-[34px] leading-none text-sky">0{i + 1}</span>
                    </div>
                    <h3 className="mt-5 text-[18px] font-semibold text-ink">
                      <span className="sr-only">Step {i + 1}: </span>{s.title}
                    </h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
                  </div>
                </Section>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------------------------------------------- why it matters -- */}
        <section aria-labelledby="why-title" className="relative overflow-hidden py-20 md:py-28">
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-page via-sky-soft to-page" />
          <div className="relative mx-auto max-w-[1280px] px-4 md:px-8">
            <Section>
              <p className="eyebrow">Why it matters</p>
              <h2 id="why-title" className="mt-3 max-w-3xl font-display text-[40px] leading-[1.1] text-ink sm:text-[52px]">
                Official figures and the fares people actually pay — finally side by side
              </h2>
            </Section>
            <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-3">
              <Section>
                <div className="card h-full p-6">
                  <p className="eyebrow !text-ink-3">The official view</p>
                  <h3 className="mt-3 text-[18px] font-semibold text-ink">MoSPI's airfare price index</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                    The government measures airfares once a month, for all of India, and publishes it weeks later.
                    Reliable — but it can't tell you what Delhi → Mumbai costs this week.
                  </p>
                </div>
              </Section>
              <Section delay={0.08}>
                <div className="card h-full p-6">
                  <p className="eyebrow !text-peach-ink">What travellers see</p>
                  <h3 className="mt-3 text-[18px] font-semibold text-ink">Prices that change every day</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                    Fares jump with festivals, weekends and how early you book. The same seat can cost twice as much a
                    few days before the flight.
                  </p>
                </div>
              </Section>
              <Section delay={0.16}>
                <div className="h-full rounded-[1.5rem] bg-accent p-6 text-white shadow-pop">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-sky-2">The bridge</p>
                  <h3 className="mt-3 text-[18px] font-semibold">A daily index, checked against the official one</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-white/90">
                    AIRINDEX publishes a daily, route-by-route index from real fares and lines it up with MoSPI's
                    series — fresh numbers for statisticians, practical answers for travellers.
                  </p>
                </div>
              </Section>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ meet the team -- */}
        <section aria-labelledby="team-title" className="mx-auto max-w-[1280px] px-4 py-20 md:px-8 md:py-28">
          <Section>
            <p className="eyebrow">Meet the team</p>
            <h2 id="team-title" className="mt-3 font-display text-[40px] leading-[1.1] text-ink sm:text-[52px]">
              Team {TEAM.name}
            </h2>
            <p className="mt-2 text-[16px] text-ink-2">{TEAM.college}</p>
          </Section>
          <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...TEAM.members, ...(TEAM.mentor ? [TEAM.mentor] : [])].map((m, i) => (
              <li key={`${m.name}-${i}`}>
                <Section delay={(i % 3) * 0.08}>
                  <div className="card flex items-center gap-4 p-5">
                    <span aria-hidden
                      className={`grid h-14 w-14 shrink-0 place-items-center rounded-full font-display text-[22px] ${
                        m === TEAM.mentor ? 'bg-peach text-peach-ink' : 'bg-sky-2 text-ink'}`}>
                      {initials(m.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[17px] font-semibold text-ink">{m.name}</p>
                      <p className="text-[14px] text-ink-3">{m.role}</p>
                    </div>
                  </div>
                </Section>
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------- final call -- */}
        <section aria-labelledby="cta-title" className="px-4 pb-20 md:px-8 md:pb-28">
          <Section>
            <div className="relative mx-auto max-w-[1280px] overflow-hidden rounded-[2rem] px-6 py-14 text-center shadow-pop sm:px-12 md:py-20">
              <img src="/media/hero-cruise-poster.jpg" alt="" aria-hidden
                className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
              <div aria-hidden className="absolute inset-0 bg-page/80 backdrop-blur-[2px]" />
              <div className="relative">
                <h2 id="cta-title" className="mx-auto max-w-2xl font-display text-[40px] leading-[1.1] text-ink sm:text-[56px]">
                  Ready to find a cheaper flight?
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-[16px] leading-relaxed text-ink-2">
                  See today's prices on every route, the best time to book, and set a free alert in under a minute.
                </p>
                <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                  {exploreBtn("Explore today's fares")}
                  {alertBtn}
                </div>
              </div>
            </div>
          </Section>
        </section>
      </main>

      <footer className="border-t border-line px-4 py-8 text-center text-[13px] leading-relaxed text-ink-3 md:px-8">
        {PROBLEM.hackathon} · {PROBLEM.statement} · For {PROBLEM.organisation}, {PROBLEM.division}.
        <br />Team {TEAM.name} · {TEAM.college} · Not an official statistic.
        {meta?.demo_mode && <><br /><b className="text-warn">Demo mode is on — the price history includes example data.</b></>}
      </footer>

      {overlay}
    </div>
  );
}
