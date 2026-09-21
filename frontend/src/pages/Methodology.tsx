import { Panel } from '../components/ui';

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'Observation definition',
    body: [
      'One observation is a single quoted total fare (base fare + taxes + fees, INR) for one route, one airline, one travel date, captured at one observation timestamp.',
      'Every observation carries a data_type. In this prototype all observations are SYNTHETIC — generated to exhibit realistic drift, booking-window pricing and seasonal effects, and clearly labelled as such throughout the interface.',
    ],
  },
  {
    title: 'Comparability',
    body: [
      'Fares are compared only within the same fare class (ECONOMY_STANDARD in this build). Within a route and period, fares are averaged across airlines and booking windows to yield one representative fare per route per calendar month.',
      'Anomalies flagged CRITICAL are excluded from the averaging step but are never deleted from the observation store.',
    ],
  },
  {
    title: 'Representative route basket',
    body: [
      'Each active route receives a selection score = 0.5 × importance + 0.3 × observation coverage + 0.2 × airline coverage. Components are normalised to [0, 1] against the best-observed route.',
      'The top twelve routes with at least one observation form the basket. Their selection scores are normalised to produce weights that sum to exactly 1. The basket and reasons for inclusion are persisted per period for auditability.',
    ],
  },
  {
    title: 'Price relatives and the index',
    body: [
      'price_relative(route, t) = mean fare(route, t) ÷ mean fare(route, base period) × 100.',
      'index(t) = Σ weight(route) × price_relative(route, t), with weights re-normalised across whichever basket routes produced a valid relative for that period. The base period index is 100 by construction.',
      'This is a fixed-basket, weighted arithmetic mean of price relatives — a prototype methodology for demonstration. It is not the official MoSPI CPI computation.',
    ],
  },
  {
    title: 'Decomposition',
    body: [
      'Route contribution = normalised weight × price relative. Contributions sum to the national index.',
      'Airline contribution distributes each route contribution across carriers in proportion to the number of observations each carrier supplied for that route in the period. This describes observed association, not causation.',
      'Regional index is the weight-averaged price relative of basket routes grouped by origin region.',
    ],
  },
  {
    title: 'Anomaly detection',
    body: [
      'Observations are grouped by (route, booking-window bucket) so that a 7-day-out fare is never compared against a 90-day-out fare as if they were one distribution.',
      'Within each group, an observation is flagged if it falls outside Q1 − 1.5 IQR / Q3 + 1.5 IQR, or if |z| ≥ 2.5. Severity: LOW (|z| ≥ 2.5), HIGH (≥ 3.0), CRITICAL (≥ 3.5).',
      'Flagged observations are retained with their status and surfaced for analyst review.',
    ],
  },
  {
    title: 'Data-quality indicator',
    body: [
      'overall = 0.3 × route coverage + 0.2 × airline coverage + 0.2 × source availability + 0.3 × validation rate. Stored alongside each index calculation, scaled by observation volume per basket route.',
      'This is a transparency aid, not a statistical confidence interval.',
    ],
  },
  {
    title: 'Auditability',
    body: [
      'Every index calculation stores its base period, calculation period, route and observation counts, data-quality indicator, methodology version and timestamp. Route- and airline-level decompositions are stored per period, allowing any published figure to be reproduced.',
    ],
  },
];

export default function Methodology() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[26px] font-semibold tracking-tight text-white">Methodology</h1>
        <p className="text-[13.5px] text-white/45 mt-1">How each number on this platform is produced</p>
      </header>

      <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-5 text-[13.5px] text-amber-100/90 leading-relaxed">
        <strong className="text-amber-200">Prototype disclaimer.</strong> This platform demonstrates automated airfare
        price measurement and analytics. Its index methodology and data sources would require validation and
        alignment with official statistical standards before production use. It is not the MoSPI CPI.
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {SECTIONS.map(s => (
          <Panel key={s.title} title={s.title}>
            <div className="space-y-2.5 text-[13.5px] text-white/70 leading-relaxed">
              {s.body.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
