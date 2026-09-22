import { useEffect, useState } from 'react';
import { Panel, Badge, inr, STATUS } from './ui';
import {
  saveRoute, getSavedRoutes, deleteSavedRoute, getRouteAlerts, getPrediction,
  type SavedRoute, type RouteAlerts, type Prediction,
} from '../services/api';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const field = 'bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#7c5cff]/60 w-full';

export default function MyRoutesTab({ browserId, routes, alerts, onAlertsChange }: {
  browserId: string; routes: string[]; alerts: RouteAlerts | null; onAlertsChange: (a: RouteAlerts) => void;
}) {
  const [saved, setSaved] = useState<SavedRoute[]>([]);
  const [route, setRoute] = useState(routes[0] ?? 'DEL-BOM');
  const [days, setDays] = useState<string[]>(['Fri', 'Sat']);
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('airindex_email') ?? ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [predDate, setPredDate] = useState(() => {
    const d = new Date(Date.now() + 21 * 864e5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [pred, setPred] = useState<Prediction | null>(null);

  const refresh = async () => {
    const [s, a] = await Promise.all([getSavedRoutes(browserId), getRouteAlerts(browserId)]);
    setSaved(s.routes); onAlertsChange(a);
  };
  useEffect(() => { refresh().catch(() => {}); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [browserId]);

  useEffect(() => {
    let alive = true;
    setPred(null);
    getPrediction({ route, travel_date: predDate }).then(p => alive && setPred(p)).catch(() => {});
    return () => { alive = false; };
  }, [route, predDate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const [origin, destination] = route.split('-');
      await saveRoute({ browser_id: browserId, origin, destination, preferred_days: days, email });
      try { localStorage.setItem('airindex_email', email); } catch { /* ignore */ }
      await refresh();
      setMsg({ tone: 'ok', text: `Watching ${route}. You'll get an email when it drops >15% below its 14-day baseline (max one per route per 24h).` });
    } catch (err: any) {
      setMsg({ tone: 'err', text: err?.response?.data?.detail?.[0]?.msg ?? err?.response?.data?.detail ?? err?.message ?? 'Could not save route' });
    } finally { setBusy(false); }
  };

  const remove = async (id: number | string) => {
    await deleteSavedRoute(browserId, id);
    await refresh();
  };

  const alertFor = (r: SavedRoute) => alerts?.alerts.find(a => a.route === `${r.origin}-${r.destination}`);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <Panel title="Watch a route" subtitle="No account needed — routes are tied to this browser and the email you give us">
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-[12.5px] text-white/55">Route
            <select value={route} onChange={e => setRoute(e.target.value)} className={`${field} mt-1`}>
              {routes.map(r => <option key={r} value={r} className="bg-[#131320]">{r}</option>)}
            </select>
          </label>
          <div className="text-[12.5px] text-white/55">Preferred travel days
            <div className="mt-1 flex flex-wrap gap-1.5">
              {DAYS.map(d => (
                <button type="button" key={d} onClick={() => setDays(days.includes(d) ? days.filter(x => x !== d) : [...days, d])}
                  className={`px-2.5 py-1 rounded-md text-[12px] border transition-colors ${days.includes(d) ? 'bg-[#7c5cff]/25 border-[#7c5cff]/40 text-white' : 'bg-white/[0.04] border-white/10 text-white/55 hover:text-white'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-[12.5px] text-white/55">Email for alerts
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={`${field} mt-1`} />
          </label>
          <button type="submit" disabled={busy || !email}
            className="w-full rounded-lg bg-[#7c5cff] hover:bg-[#8b6fff] disabled:opacity-40 text-white text-[13px] font-medium py-2 transition-colors">
            {busy ? 'Saving…' : 'Save & watch this route'}
          </button>
          {msg && <p className={`text-[12px] ${msg.tone === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</p>}
        </form>

        <div className="mt-5 pt-4 border-t border-white/[0.07]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-white/40">Fare estimate</p>
          <div className="mt-2 flex items-center gap-2">
            <input type="date" value={predDate} onChange={e => setPredDate(e.target.value)} className={field} />
          </div>
          {pred ? (
            <div className="mt-2">
              <p className="text-[26px] font-semibold text-white leading-none">{inr(pred.predicted_fare)}</p>
              <p className="text-[11.5px] text-white/45 mt-1">
                model estimate for {route} on {pred.travel_date} ({pred.features.days_to_departure} days out{pred.features.is_festival_season ? ', festival season' : ''}) · MAPE {pred.model.holdout_mape_pct}% on hold-out
              </p>
            </div>
          ) : <p className="text-[12px] text-white/35 mt-2">Estimating…</p>}
        </div>
      </Panel>

      <div className="xl:col-span-2">
        <Panel title="Saved routes" subtitle={alerts ? `Checked ${alerts.checked_at.replace('T', ' ')} · today's mean fare vs 14-day baseline` : undefined}>
          {saved.length === 0 ? (
            <p className="text-[13px] text-white/40 py-8 text-center">No routes saved on this browser yet.</p>
          ) : (
            <ul className="space-y-2">
              {saved.map(r => {
                const a = alertFor(r);
                return (
                  <li key={r.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 ${a?.is_cheap ? 'border-emerald-400/30 bg-emerald-400/[0.06]' : 'border-white/[0.07] bg-white/[0.03]'}`}>
                    <div className="min-w-[110px]">
                      <p className="text-[15px] font-semibold text-white">{r.origin} → {r.destination}</p>
                      <p className="text-[11.5px] text-white/45">{r.preferred_days.length ? r.preferred_days.join(', ') : 'any day'} · {r.email}</p>
                    </div>
                    <div className="flex-1 flex flex-wrap items-center gap-4 text-[12.5px] tabular-nums">
                      <span className="text-white/70">Today <b className="text-white">{a?.today_fare != null ? inr(a.today_fare) : '—'}</b></span>
                      <span className="text-white/70">Baseline <b className="text-white">{a?.baseline_fare != null ? inr(a.baseline_fare) : '—'}</b></span>
                      {a?.pct_below_baseline != null && (
                        <span style={{ color: a.pct_below_baseline > 0 ? STATUS.good : STATUS.critical }}>
                          {a.pct_below_baseline > 0 ? '▼' : '▲'} {Math.abs(a.pct_below_baseline)}% {a.pct_below_baseline > 0 ? 'below' : 'above'} baseline
                        </span>
                      )}
                      {a?.is_cheap && <Badge tone="good">CHEAP TODAY</Badge>}
                      {r.last_notified_at && <span className="text-[11px] text-white/35">emailed {r.last_notified_at.replace('T', ' ')}</span>}
                    </div>
                    <button onClick={() => remove(r.id)} className="text-[12px] text-white/40 hover:text-rose-300">Remove</button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-[11.5px] text-white/35">
            Alerts run after every scrape + pipeline cycle (`pipeline/notifier.py`): a route is "cheap" when today's mean nonstop fare is more than 15% below its mean over the previous 14 scrape days. Emails go out via Brevo with a 24-hour cooldown per route.
          </p>
        </Panel>
      </div>
    </div>
  );
}
