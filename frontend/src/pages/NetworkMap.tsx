import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAirports, getRoutes, type Airport, type RouteRow } from '../services/api';
import { Panel, Loading, ErrorState, StatCard } from '../components/ui';

// Equirectangular projection over India's bounding box.
const LON_MIN = 67, LON_MAX = 98, LAT_MIN = 6, LAT_MAX = 38;
const W = 900, H = 900;
const project = (lon: number, lat: number) => ({
  x: ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * W,
  y: ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * H,
});

// Price-movement categories per spec section 22.
function movementBand(index: number | null) {
  if (index == null) return { label: 'Not in basket', color: '#4a4a62', dash: '4 6' };
  const change = index - 100;
  if (change <= -8) return { label: 'Strong decrease', color: '#22d3ee' };
  if (change <= -2) return { label: 'Moderate decrease', color: '#5c9dff' };
  if (change < 8)   return { label: 'Stable', color: '#a3a3c2' };
  if (change < 18)  return { label: 'Moderate increase', color: '#ff9f43' };
  return { label: 'Strong increase', color: '#ff4d6d' };
}

const BANDS = [
  { label: 'Strong decrease', color: '#22d3ee' },
  { label: 'Moderate decrease', color: '#5c9dff' },
  { label: 'Stable', color: '#a3a3c2' },
  { label: 'Moderate increase', color: '#ff9f43' },
  { label: 'Strong increase', color: '#ff4d6d' },
  { label: 'Not in basket', color: '#4a4a62' },
];

export default function NetworkMap() {
  const [airports, setAirports] = useState<Airport[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [regionFilter, setRegionFilter] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAirports(), getRoutes()])
      .then(([a, r]) => { setAirports(a.airports); setRoutes(r.routes); })
      .catch(e => setError(e?.message ?? 'Failed to load map data'))
      .finally(() => setLoading(false));
  }, []);

  const byCode = useMemo(() => Object.fromEntries(airports.map(a => [a.iata_code, a])), [airports]);
  const regions = useMemo(() => ['All', ...Array.from(new Set(airports.map(a => a.region))).sort()], [airports]);

  if (loading) return <Loading label="Projecting network…" />;
  if (error) return <ErrorState message={error} />;

  const visibleRoutes = routes.filter(r =>
    r.origin && r.destination && byCode[r.origin] && byCode[r.destination] &&
    (regionFilter === 'All' || r.region === regionFilter),
  );
  const inBasket = visibleRoutes.filter(r => r.index != null).length;
  const rising = visibleRoutes.filter(r => (r.index ?? 100) - 100 >= 8).length;
  const hovered = hover != null ? routes.find(r => r.id === hover) : null;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-white">India Route Network</h1>
          <p className="text-[13.5px] text-white/45 mt-1">
            Routes coloured by price movement against the base period · hover a route for detail
          </p>
        </div>
        <div className="flex gap-1.5 text-[12.5px] flex-wrap">
          {regions.map(r => (
            <button key={r} onClick={() => setRegionFilter(r)}
              className={`px-3 py-1.5 rounded-lg border transition-colors ${
                regionFilter === r ? 'bg-[#7c5cff]/20 border-[#7c5cff]/40 text-white' : 'border-white/10 text-white/50 hover:text-white'
              }`}>
              {r}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Airports" value={airports.length} />
        <StatCard label="Routes Shown" value={visibleRoutes.length} footnote={`${inBasket} in index basket`} />
        <StatCard label="Strongly Rising" value={rising} footnote="≥ +8% vs base" />
      </div>

      <div className="grid xl:grid-cols-[1fr_300px] gap-6">
        <Panel className="!p-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 720 }}>
            <defs>
              <radialGradient id="glow">
                <stop offset="0%" stopColor="#7c5cff" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#7c5cff" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width={W} height={H} fill="rgba(0,0,0,0.18)" rx={16} />
            {Array.from({ length: 7 }).map((_, i) => (
              <line key={`v${i}`} x1={(i / 6) * W} y1={0} x2={(i / 6) * W} y2={H}
                stroke="rgba(255,255,255,0.04)" />
            ))}
            {Array.from({ length: 7 }).map((_, i) => (
              <line key={`h${i}`} x1={0} y1={(i / 6) * H} x2={W} y2={(i / 6) * H}
                stroke="rgba(255,255,255,0.04)" />
            ))}

            {visibleRoutes.map(r => {
              const a = project(byCode[r.origin!].longitude, byCode[r.origin!].latitude);
              const b = project(byCode[r.destination!].longitude, byCode[r.destination!].latitude);
              const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
              const dx = b.x - a.x, dy = b.y - a.y;
              const len = Math.hypot(dx, dy) || 1;
              const cx = mx - (dy / len) * len * 0.18, cy = my + (dx / len) * len * 0.18;
              const band = movementBand(r.index);
              const isHover = hover === r.id;
              const dim = hover != null && !isHover;
              return (
                <path key={r.id}
                  d={`M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`}
                  fill="none" stroke={band.color}
                  strokeWidth={isHover ? 4 : r.index != null ? 2.2 : 1.2}
                  strokeDasharray={band.dash}
                  strokeOpacity={dim ? 0.15 : r.index != null ? 0.85 : 0.4}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-opacity .2s, stroke-width .2s', cursor: 'pointer' }}
                  onMouseEnter={() => setHover(r.id)}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}

            {airports.map(ap => {
              const p = project(ap.longitude, ap.latitude);
              const touched = visibleRoutes.some(r => r.origin === ap.iata_code || r.destination === ap.iata_code);
              return (
                <g key={ap.id} opacity={touched ? 1 : 0.35}>
                  <circle cx={p.x} cy={p.y} r={16} fill="url(#glow)" />
                  <circle cx={p.x} cy={p.y} r={5} fill="#0b0b14" stroke="#c9c6f0" strokeWidth={2} />
                  <text x={p.x + 10} y={p.y - 8} fill="#e8e8f0" fontSize={13} fontWeight={600}
                    style={{ paintOrder: 'stroke', stroke: '#07070c', strokeWidth: 3 }}>
                    {ap.iata_code}
                  </text>
                  <text x={p.x + 10} y={p.y + 6} fill="#8a8aa6" fontSize={10.5}
                    style={{ paintOrder: 'stroke', stroke: '#07070c', strokeWidth: 3 }}>
                    {ap.city}
                  </text>
                </g>
              );
            })}
          </svg>
        </Panel>

        <div className="space-y-4">
          <Panel title="Legend" subtitle="Price movement vs base period">
            <ul className="space-y-2 text-[13px]">
              {BANDS.map(b => (
                <li key={b.label} className="flex items-center gap-2.5 text-white/70">
                  <span className="h-[3px] w-6 rounded-full" style={{ background: b.color }} />
                  {b.label}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title={hovered ? `${hovered.origin} → ${hovered.destination}` : 'Route detail'}
            subtitle={hovered ? hovered.region ?? undefined : 'Hover a route on the map'}>
            {hovered ? (
              <div className="space-y-2 text-[13px]">
                <Row label="Route index" value={hovered.index?.toFixed(1) ?? 'Not in basket'} />
                <Row label="Change vs base" value={hovered.index != null
                  ? `${hovered.index - 100 >= 0 ? '+' : ''}${(hovered.index - 100).toFixed(1)}%` : '—'} />
                <Row label="Basket weight" value={hovered.weight != null ? `${(hovered.weight * 100).toFixed(1)}%` : '—'} />
                <Row label="Distance" value={hovered.distance_km ? `${hovered.distance_km.toFixed(0)} km` : '—'} />
                <Row label="Movement" value={movementBand(hovered.index).label}
                  color={movementBand(hovered.index).color} />
                <Link to={`/routes/${hovered.id}`}
                  className="inline-block mt-2 text-[#9d86ff] hover:text-white">
                  Open route analytics →
                </Link>
              </div>
            ) : (
              <p className="text-[13px] text-white/35">
                Move your cursor over any route line to see its index, weight and movement band.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/[0.06] pb-2">
      <span className="text-white/45">{label}</span>
      <span className="tabular-nums font-medium" style={{ color: color ?? '#fff' }}>{value}</span>
    </div>
  );
}
