import { Panel, Skeleton, EmptyState, ErrorState, Badge, InfoTip, inr, fmtDate } from './ui';
import { GLOSSARY } from '../lib/glossary';
import { routeLabel } from '../lib/cities';
import type { FareRecord } from '../services/api';

/** The individual fares behind the averages, cheapest first. */
export default function FaresTable({ route, fares, loading, error, onRetry, windowShort, dateFrom, dateTo, nonstop }: {
  route: string; fares: { records: FareRecord[]; total: number; message?: string | null }; loading: boolean;
  error?: string | null; onRetry?: () => void;
  windowShort: Record<string, string>; dateFrom: string; dateTo: string; nonstop: boolean;
}) {
  return (
    <Panel
      title={<>Flights we found · {routeLabel(route)}</>}
      info={GLOSSARY.nonstop.short}
      subtitle={<>{fares.total.toLocaleString('en-IN')} fares for travel between {fmtDate(dateFrom)} and {fmtDate(dateTo)}{nonstop ? ', direct flights only' : ''} · cheapest first{fares.records.length < fares.total ? `, showing ${fares.records.length}` : ''}</>}
    >
      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : fares.records.length === 0 ? (
        <EmptyState icon="🔎" title="No flights found for these dates"
          message={fares.message ?? 'Try a wider date range, or include flights with stops.'} />
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[760px] text-[14px]">
            <caption className="sr-only">Individual fares found for {routeLabel(route)}</caption>
            <thead className="text-left text-[13px] text-ink-3">
              <tr>
                <th scope="col" className="whitespace-nowrap pb-2 pr-4 font-semibold">Airline</th>
                <th scope="col" className="whitespace-nowrap pb-2 pr-4 font-semibold">Flight</th>
                <th scope="col" className="whitespace-nowrap pb-2 pr-4 font-semibold">Travel date</th>
                <th scope="col" className="whitespace-nowrap pb-2 pr-4 font-semibold">Departs</th>
                <th scope="col" className="whitespace-nowrap pb-2 pr-4 font-semibold">Stops</th>
                <th scope="col" className="whitespace-nowrap pb-2 pr-4 font-semibold">
                  <span className="inline-flex items-center gap-1.5">Booked <InfoTip>{GLOSSARY.daysBefore.short}</InfoTip></span>
                </th>
                <th scope="col" className="whitespace-nowrap pb-2 pr-4 text-right font-semibold">Fare</th>
                <th scope="col" className="whitespace-nowrap pb-2 font-semibold">Found on</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[...fares.records].sort((a, b) => a.total_fare - b.total_fare).map((f, i) => (
                <tr key={i} className="border-t border-line text-ink-2">
                  <td className="py-2 pr-4 font-medium text-ink">{f.carrier_name ?? f.carrier}</td>
                  <td className="whitespace-nowrap py-2 pr-4">{f.flight_number ?? '—'}</td>
                  <td className="whitespace-nowrap py-2 pr-4">{fmtDate(f.travel_date)}</td>
                  <td className="py-2 pr-4">{f.departure_time ?? '—'}</td>
                  <td className="py-2 pr-4">{f.stops == null ? '—' : f.stops === 0 ? 'Direct' : `${f.stops} stop${f.stops > 1 ? 's' : ''}`}</td>
                  <td className="whitespace-nowrap py-2 pr-4">
                    {f.advance_purchase_days} day{f.advance_purchase_days === 1 ? '' : 's'} ahead
                    <span className="block text-[12px] text-ink-3">{windowShort[f.advance_purchase_window] ?? ''}</span>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-right font-semibold text-ink">
                    {inr(f.total_fare)}
                    {f.is_outlier && <span className="ml-1.5 align-middle"><Badge tone="warn">unusually high · not counted</Badge></span>}
                  </td>
                  <td className="py-2 capitalize">{f.source.replace(/_/g, ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
