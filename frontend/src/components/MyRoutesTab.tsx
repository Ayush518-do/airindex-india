import { useEffect, useId, useMemo, useState } from 'react';
import PageHeader from './PageHeader';
import { MagnetButton, Section } from './Motion';
import CityCombobox from './CityCombobox';
import { Panel, EmptyState, ErrorState, InfoTip, Skeleton, inr, fmtLongDate } from './ui';
import { GLOSSARY } from '../lib/glossary';
import { cityName, routeLabel } from '../lib/cities';
import {
  saveRoute, getSavedRoutes, deleteSavedRoute, getRouteAlerts, getPrediction, friendlyError,
  type SavedRoute, type RouteAlerts, type Prediction,
} from '../services/api';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Deliberately simple: something@something.tld, no spaces. The server validates too.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function loadEmail() { try { return localStorage.getItem('airindex_email') ?? ''; } catch { return ''; } }
function storeEmail(v: string) { try { localStorage.setItem('airindex_email', v); } catch { /* private mode */ } }

export default function MyRoutesTab({ browserId, routes, alerts, onAlertsChange }: {
  browserId: string; routes: string[]; alerts: RouteAlerts | null; onAlertsChange: (a: RouteAlerts) => void;
}) {
  const id = useId();
  // Every city we fly to or from can be picked; the pair is checked on submit
  // so the traveller gets a clear reason rather than a silently shrunk list.
  const origins = useMemo(() => Array.from(new Set(routes.map(r => r.split('-')[0]))), [routes]);
  const destinations = useMemo(() => Array.from(new Set(routes.map(r => r.split('-')[1]))), [routes]);
  const [origin, setOrigin] = useState(origins.includes('DEL') ? 'DEL' : origins[0] ?? '');
  const [destination, setDestination] = useState(destinations.includes('BOM') ? 'BOM' : destinations[0] ?? '');
  const [errors, setErrors] = useState<{ route?: string; email?: string }>({});

  const [email, setEmail] = useState(loadEmail);
  const [saved, setSaved] = useState<SavedRoute[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [predDate, setPredDate] = useState(() => iso(new Date(Date.now() + 21 * 864e5)));
  const [pred, setPred] = useState<Prediction | null>(null);
  const [predErr, setPredErr] = useState<string | null>(null);

  const route = origin && destination && routes.includes(`${origin}-${destination}`) ? `${origin}-${destination}` : '';

  const refresh = async () => {
    const [s, a] = await Promise.all([getSavedRoutes(browserId), getRouteAlerts(browserId)]);
    setSaved(s.routes); onAlertsChange(a);
  };
  const loadList = () => { setListErr(null); refresh().catch(e => setListErr(friendlyError(e))); };
  useEffect(loadList, [browserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const validate = () => {
    const next: { route?: string; email?: string } = {};
    if (origin === destination) next.route = 'From and To must be different cities.';
    else if (!routes.includes(`${origin}-${destination}`))
      next.route = `We don't track flights from ${cityName(origin)} to ${cityName(destination)} yet. Try another destination.`;
    const e = email.trim();
    if (!e) next.email = 'Please enter your email address.';
    else if (!EMAIL_RE.test(e)) next.email = "That email address doesn't look right. Check for typos (for example you@example.com).";
    setErrors(next);
    return next;
  };

  useEffect(() => {
    if (!route) return;
    let alive = true;
    setPred(null); setPredErr(null);
    getPrediction({ route, travel_date: predDate })
      .then(p => alive && setPred(p))
      .catch(e => alive && setPredErr(friendlyError(e)));
    return () => { alive = false; };
  }, [route, predDate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const v = validate();
    if (v.route || v.email) {
      // Move focus to the first problem so keyboard and screen-reader users land on it.
      document.getElementById(v.route ? `${id}-to` : `${id}-email`)?.focus();
      return;
    }
    setBusy(true);
    const clean = email.trim();
    try {
      await saveRoute({ browser_id: browserId, origin, destination, preferred_days: [], email: clean });
      storeEmail(clean);
      await refresh();
      setMsg({ tone: 'ok', text: `Done! We'll email ${clean} when ${routeLabel(route)} gets more than ${alerts?.threshold_pct ?? 15}% cheaper than usual.` });
    } catch (err) {
      setMsg({ tone: 'err', text: friendlyError(err) });
    } finally { setBusy(false); }
  };

  const [removing, setRemoving] = useState<number | null>(null);
  const remove = async (r: SavedRoute) => {
    setRemoving(r.id);
    try {
      await deleteSavedRoute(browserId, r.id);
      await refresh();
      setMsg({ tone: 'ok', text: `Alert for ${r.label ?? routeLabel(`${r.origin}-${r.destination}`)} deleted.` });
    } catch (err) {
      setMsg({ tone: 'err', text: friendlyError(err) });
    } finally { setRemoving(null); }
  };

  const alertFor = (r: SavedRoute) => alerts?.alerts.find(a => a.route === `${r.origin}-${r.destination}`);

  return (
    <div className="space-y-5">
      <PageHeader title="My price alerts"
        lead={<>Pick a route and we'll email you when its fares drop more than {alerts?.threshold_pct ?? 15}% below the usual price. No account needed.</>} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="xl:col-span-2">
        <Section>
          <Panel title="Set up an alert">
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <CityCombobox id={`${id}-from`} label="From" value={origin} options={origins}
                  onChange={c => { setOrigin(c); setErrors(x => ({ ...x, route: undefined })); }} />
                <CityCombobox id={`${id}-to`} label="To" value={destination} options={destinations}
                  onChange={c => { setDestination(c); setErrors(x => ({ ...x, route: undefined })); }}
                  error={errors.route} />
              </div>
              <div>
                <label htmlFor={`${id}-email`} className="mb-1 block text-[14px] font-medium text-ink-2">Your email</label>
                <input id={`${id}-email`} type="email" autoComplete="email" inputMode="email" value={email}
                  onChange={e => { setEmail(e.target.value); if (errors.email) setErrors(x => ({ ...x, email: undefined })); }}
                  placeholder="you@example.com" className="field"
                  aria-invalid={!!errors.email}
                  aria-describedby={`${id}-email-hint${errors.email ? ` ${id}-email-err` : ''}`} />
                {errors.email && <p id={`${id}-email-err`} className="mt-1 text-[13px] font-medium text-bad">{errors.email}</p>}
                <p id={`${id}-email-hint`} className="mt-1 text-[13px] text-ink-3">We only use this to send your alerts.</p>
              </div>
              <MagnetButton className="w-full">
                <button type="submit" disabled={busy} className="btn-primary w-full">
                  {busy ? 'Saving…' : '🔔 Create alert'}
                </button>
              </MagnetButton>
              {msg && (
                <p role={msg.tone === 'ok' ? 'status' : 'alert'}
                  className={`rounded-lg px-3 py-2 text-[14px] ${msg.tone === 'ok' ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad'}`}>
                  {msg.text}
                </p>
              )}
            </form>

            {route && (
              <div className="mt-6 border-t border-line pt-5">
                <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                  What should a ticket cost?
                  <InfoTip>{GLOSSARY.estimate.short}</InfoTip>
                </h3>
                <label htmlFor={`${id}-date`} className="mb-1 mt-2 block text-[14px] text-ink-2">
                  Flying {routeLabel(route)} on
                </label>
                <input id={`${id}-date`} type="date" value={predDate} min={iso(new Date())}
                  onChange={e => setPredDate(e.target.value)} className="field" />
                <div aria-live="polite" className="mt-3">
                  {pred && (
                    <>
                      <p className="text-[30px] font-semibold leading-none tabular-nums text-ink">{inr(pred.predicted_fare)}</p>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
                        Our estimate for {fmtLongDate(pred.travel_date)}, booking {pred.features.days_to_departure} days ahead
                        {pred.features.is_festival_season ? ' (festival season — expect higher prices)' : ''}.
                        Usually within about {pred.model.holdout_mape_pct}% of the real fare.
                      </p>
                    </>
                  )}
                  {predErr && <p className="text-[14px] text-ink-2">{predErr}</p>}
                  {!pred && !predErr && <p className="text-[14px] text-ink-3">Working it out…</p>}
                </div>
              </div>
            )}
          </Panel>
        </Section>
        </div>

        <div className="xl:col-span-3">
          <Section delay={0.05}>
            <Panel title="Your alerts"
              info={GLOSSARY.usualPrice.short}
              subtitle={alerts ? `Prices compared with each route's usual price over the last ${alerts.baseline_days} days.` : undefined}>
              {listErr ? (
                <ErrorState message={listErr} onRetry={loadList} />
              ) : saved == null ? (
                <div className="space-y-2" role="status" aria-label="Loading your alerts">
                  {[0, 1].map(i => <Skeleton key={i} className="h-16 w-full !rounded-xl" />)}
                </div>
              ) : saved.length === 0 ? (
                <EmptyState icon="🔔" title="No alerts yet"
                  message="Create one on the left and it will show up here, with today's price next to the usual price." />
              ) : (
                <ul className="space-y-2">
                  {saved.map(r => {
                    const a = alertFor(r);
                    const label = r.label ?? routeLabel(`${r.origin}-${r.destination}`);
                    return (
                      <li key={r.id}
                        className={`flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border px-4 py-3 ${
                          a?.is_cheap ? 'border-good/30 bg-good-soft' : 'border-line bg-surface-2'}`}>
                        <div className="min-w-[200px] flex-1">
                          <p className="text-[15px] font-semibold text-ink">{label}</p>
                          <p className="text-[13px] text-ink-3">Emails to {r.email}</p>
                        </div>
                        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[14px] tabular-nums">
                          <div><dt className="text-[12px] text-ink-3">Today</dt><dd className="font-semibold text-ink">{a?.today_fare != null ? inr(a.today_fare) : '—'}</dd></div>
                          <div><dt className="text-[12px] text-ink-3">Usual price</dt><dd className="font-semibold text-ink">{a?.baseline_fare != null ? inr(a.baseline_fare) : 'Not enough days yet'}</dd></div>
                        </dl>
                        <p className="min-w-[160px] text-[14px]">
                          {a?.is_cheap && <b className="text-good">Cheap today — {a.pct_below_baseline}% below usual</b>}
                          {a && !a.is_cheap && a.pct_below_baseline != null && (
                            <span className="text-ink-2">
                              {a.pct_below_baseline > 0 ? `${a.pct_below_baseline}% below usual` : `${Math.abs(a.pct_below_baseline)}% above usual`} — no alert yet
                            </span>
                          )}
                          {a && a.pct_below_baseline == null && <span className="text-ink-3">Watching — needs a few more days of prices</span>}
                        </p>
                        <button type="button" onClick={() => remove(r)} disabled={removing === r.id}
                          className="btn-ghost !px-3 !py-1.5 text-[13px]"
                          aria-label={`Delete alert for ${label}`}>
                          {removing === r.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
                We check prices every morning. If a route is more than {alerts?.threshold_pct ?? 15}% cheaper than usual, you get one email — then nothing more about that route for 24 hours.
              </p>
            </Panel>
          </Section>
        </div>
      </div>
    </div>
  );
}
