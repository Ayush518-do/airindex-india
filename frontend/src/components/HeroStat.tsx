import Particles from './reactbits/Particles';
import { StatCard, Delta, Badge, fmtDate, fmtLongDate } from './ui';
import { GLOSSARY } from '../lib/glossary';
import { useMotionSettings } from '../lib/motion';
import type { IndexDaily, Meta } from '../services/api';

export default function HeroStat({ daily, meta }: { daily: IndexDaily; meta: Meta }) {
  const { heavyEffects } = useMotionSettings();
  const { latest, base_date, points } = daily;
  if (!latest) return null;
  const real = daily.n_real_days ?? points.length;
  const example = daily.n_synthetic_days ?? 0;
  const lastPoint = points[points.length - 1];
  const prev = points.length > 1 ? points[points.length - 2] : null;

  return (
    <div className="relative" data-tour="index">
      {heavyEffects && (
        // Pastel particles drifting behind the cards; they part around the cursor.
        <div aria-hidden className="pointer-events-none absolute -inset-4 opacity-70">
          <Particles
            particleCount={110}
            particleSpread={10}
            speed={0.05}
            particleColors={['#8b7cf6', '#5aa2e8', '#a9c9f2']}
            moveParticlesOnHover
            particleHoverFactor={0.5}
            alphaParticles
            particleBaseSize={60}
            sizeRandomness={0.8}
            cameraDistance={22}
          />
        </div>
      )}

      <div className="relative grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          className="md:col-span-2"
          label={`Airfare Price Index · ${fmtDate(latest.date)}`}
          info={GLOSSARY.apix.short}
          value={latest.value}
          decimals={1}
        >
          <Delta value={latest.change_pct}
            suffix={prev ? `than on ${fmtDate(prev.date)}` : ''} />
          {!prev && <p className="mt-2 text-[14px] text-ink-2">This is our first day of prices — changes show from the next check.</p>}
          <p className="mt-2 text-[13px] text-ink-3">
            100 = prices on {base_date ? fmtLongDate(base_date) : 'our first day'}.
            {' '}{latest.value >= 100
              ? `Fares are ${(latest.value - 100).toFixed(1)}% higher than that day.`
              : `Fares are ${(100 - latest.value).toFixed(1)}% lower than that day.`}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="sky">{real} day{real === 1 ? '' : 's'} of real prices</Badge>
            {example > 0 && <Badge tone="warn">+ {example} days of example data</Badge>}
          </div>
        </StatCard>

        <StatCard
          label="Fares checked today"
          info={GLOSSARY.nonstop.short}
          value={lastPoint.n_records}
        >
          <p className="mt-2 text-[14px] text-ink-2">
            Direct economy flights on {Object.keys(daily.weights).length} busy routes, from{' '}
            {meta.sources.filter(s => !s.synthetic).length || 'several'} booking site{meta.sources.filter(s => !s.synthetic).length === 1 ? '' : 's'}.
          </p>
          <p className="mt-2 text-[13px] text-ink-3">Unusually high prices are set aside so one odd fare can't skew the average.</p>
        </StatCard>
      </div>
    </div>
  );
}
