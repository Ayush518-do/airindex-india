/**
 * City names for display, sourced from the backend's single list
 * (GET /meta/cities -> pipeline/cities.py). There is deliberately no copy of
 * the list here, so the two can never disagree.
 *
 * Loaded once at startup (Dashboard fetches it alongside /meta, before any
 * content renders), after which these helpers are synchronous.
 */
import type { City } from '../services/api';

let byCode: Record<string, City> = {};

export function setCities(list: City[]) {
  byCode = Object.fromEntries(list.map(c => [c.code, c]));
}

export function allCities(): City[] {
  return Object.values(byCode).sort((a, b) => a.city.localeCompare(b.city));
}

/** 'DEL' -> 'Delhi' */
export function cityName(code: string): string {
  return byCode[code.toUpperCase()]?.city ?? code.toUpperCase();
}

/** 'DEL' -> 'Delhi (DEL)' */
export function cityLabel(code: string): string {
  const c = byCode[code.toUpperCase()];
  return c ? `${c.city} (${c.code})` : code.toUpperCase();
}

/** 'DEL-BOM' -> 'Delhi (DEL) → Mumbai (BOM)' — the default everywhere. */
export function routeLabel(route: string): string {
  const [o, d] = route.toUpperCase().split('-');
  return d ? `${cityLabel(o)} → ${cityLabel(d)}` : route;
}

/** 'DEL-BOM' -> 'Delhi → Mumbai' — only where space is tight (chart ticks),
 *  and always paired with the full label in the tooltip. */
export function routeShort(route: string): string {
  const [o, d] = route.toUpperCase().split('-');
  return d ? `${cityName(o)} → ${cityName(d)}` : route;
}
