/**
 * Plain-English definitions, used by both the (i) tooltips and the
 * About / How it works page, so the wording never drifts between them.
 * Written for a traveller, not a statistician.
 */
export const GLOSSARY = {
  apix: {
    term: 'Airfare Price Index (APIx)',
    short: 'Airfare Price Index: 100 = prices on our first day of checking. 110 means fares are 10% higher than that day; 95 means 5% lower.',
    long: 'One number that sums up domestic airfares. We check the same flights every day and compare today\'s prices with those on our first day, which we call 100. Busier routes like Delhi → Mumbai count for more, because more people fly them.',
  },
  daysBefore: {
    term: 'Days before flight',
    short: 'How far ahead the ticket is bought. "1–2 weeks ahead" means booking 8 to 14 days before travel. Prices usually rise as the flight gets closer.',
    long: 'We check prices for flights 2, 5, 10, 21 and 45 days away (T+2 … T+45), then group them: 0–3 days (last minute), 4–7 days, 1–2 weeks, 2–4 weeks and 1–2 months (early bird).',
  },
  tPlus: {
    term: 'T+2, T+5, T+10, T+21, T+45',
    short: 'Booking 2 / 5 / 10 / 21 / 45 days before travel.',
    long: '"T" is the travel date. T+10 means a ticket bought 10 days before the flight.',
  },
  nonstop: {
    term: 'Nonstop economy fares',
    short: 'We only count direct economy flights, so we always compare like with like.',
    long: 'Connecting flights and business class are priced very differently. Leaving them out keeps the index about one thing: the price of an ordinary direct seat.',
  },
  baseDay: {
    term: 'Base day',
    short: 'Our first day of checking prices. The index is 100 on this day by definition.',
    long: 'Every later day is compared against the base day. The base day doesn\'t mean prices were "normal" then — it\'s simply where we started measuring.',
  },
  heatmap: {
    term: 'Price map',
    short: 'Darker = more expensive. Each row is a route; columns show how many days before the flight you book.',
    long: 'Each square is the average fare for that route when booked that far ahead. It shows at a glance which routes are pricey and whether booking early helps.',
  },
  official: {
    term: 'Official airfare index (MoSPI CPI)',
    short: 'The government\'s official airfare price index, published monthly by the Ministry of Statistics (MoSPI), compared with our live index.',
    long: 'MoSPI\'s Consumer Price Index includes an item for economy-class airfare. It\'s the official measure, but it\'s monthly and published with a delay. Our index is daily and live, so the two complement each other.',
  },
  pendingOverlap: {
    term: 'Why we can\'t compare them directly yet',
    short: 'Official data ends Dec 2025; our live data started Sep 2026, so they don\'t share any months yet. The comparison will appear once they overlap.',
    long: 'To say how closely our index tracks the official one, both need prices for the same months. Until then we show the official history and our live data side by side, and compare against the usual pattern for this time of year.',
  },
  seasonal: {
    term: 'Usual pattern for this month',
    short: 'How much airfares typically rise or fall in each month, averaged over 12 years of official data.',
    long: 'For example, if airfares have risen in most Octobers since 2014, a rise this October is normal rather than alarming.',
  },
  festival: {
    term: 'Festival price jump',
    short: 'How much more flights cost around a festival compared with ordinary days, for the same route and the same booking time.',
    long: 'We compare fares for travel during festival dates with fares for nearby ordinary dates, booked the same number of days ahead, so the difference reflects the festival and not how early people booked.',
  },
  estimate: {
    term: 'Price estimate',
    short: 'Our computer model\'s guess at the fare, based on the route, the airline, how far ahead you book, the day of the week and festivals.',
    long: 'It learns from the fares we\'ve collected. On past data it is typically within about 10% of the real price — useful as a guide, not a guarantee.',
  },
  forecastRange: {
    term: 'Likely range',
    short: 'The shaded area where the index will probably be over the next few days. Wider = less certain.',
    long: 'We draw a straight trend through the last 10 days and widen it the further ahead we look, because the future is less certain than the past.',
  },
  usualPrice: {
    term: 'Usual price',
    short: 'The average fare for this route over the last 14 days. We alert you when today is more than 15% below it.',
    long: 'Comparing against the last two weeks means a "cheap" alert reflects a real dip, not just a normal quiet day.',
  },
  routeWeight: {
    term: 'Route importance',
    short: 'Busier routes count for more in the index, based on how many people fly them (official DGCA traffic figures).',
    long: 'Delhi → Mumbai carries the most passengers, so a price change there moves the index more than one on a smaller route.',
  },
  demo: {
    term: 'Demo data',
    short: 'Practice numbers for presentations, not real fares. Shown only when demo mode is switched on.',
    long: 'Demo mode uses a separate, clearly-labelled set of example prices so a full trend can be shown before enough real days have been collected. Real mode never mixes them in.',
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;

/** Order for the About page. */
export const GLOSSARY_ORDER: GlossaryKey[] = [
  'apix', 'baseDay', 'nonstop', 'daysBefore', 'tPlus', 'heatmap', 'routeWeight',
  'official', 'pendingOverlap', 'seasonal', 'festival', 'estimate', 'forecastRange', 'usualPrice', 'demo',
];
