import Particles from './reactbits/Particles';
import { StatCard, fmtDate, Badge } from './ui';
import type { IndexDaily, Meta } from '../services/api';

export default function HeroStat({ daily, meta }: { daily: IndexDaily; meta: Meta }) {
  const { latest, base_date, points } = daily;
  const real = daily.n_real_days ?? points.length;
  const seeded = daily.n_synthetic_days ?? 0;
  const lastPoint = points[points.length - 1];
  const snapshot = meta.snapshot_at ? new Date(meta.snapshot_at) : null;

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Subtle cursor-reactive particle field behind the hero (React Bits / ogl). */}
      <div className="absolute inset-0 -z-0 pointer-events-none opacity-60">
        <Particles
          particleCount={140}
          particleSpread={9}
          speed={0.06}
          particleColors={['#9085e9', '#3987e5', '#ffffff']}
          moveParticlesOnHover
          particleHoverFactor={0.6}
          alphaParticles
          particleBaseSize={70}
          sizeRandomness={0.8}
          cameraDistance={22}
          disableRotation={false}
        />
      </div>

      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <StatCard
            label={`${daily.index_name} · ${fmtDate(latest.date)}`}
            value={latest.value}
            decimals={1}
            delta={latest.change_pct}
            deltaLabel="day-over-day"
            footnote={
              <>
                Base {fmtDate(base_date)} = 100 · {latest.change_abs >= 0 ? '+' : ''}{latest.change_abs.toFixed(2)} pts vs previous day
                {lastPoint.coverage != null && <> · basket coverage {(lastPoint.coverage * 100).toFixed(0)}%</>}
              </>
            }
          >
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone="good">{real} real scrape day{real === 1 ? '' : 's'}</Badge>
              {seeded > 0 && <Badge tone="warn">{seeded} seeded days (synthetic, disclosed)</Badge>}
              {snapshot && (
                <span className="text-[11.5px] text-white/40">
                  latest snapshot {snapshot.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </StatCard>
        </div>
        <StatCard
          label="Fares in today's index"
          value={lastPoint.n_records}
          footnote={`nonstop economy, outliers removed · ${Object.keys(daily.weights).length} routes, DGCA-share weighted`}
        />
      </div>
    </div>
  );
}
