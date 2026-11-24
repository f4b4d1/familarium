// Unscharfe Daten: Anzeige und Jahresgrenzen.

import type { FuzzyDate, PartialDate } from './schema.ts';

/** Wie weit „um 1850" höchstens abweichen darf. */
const ABOUT_TOLERANCE_YEARS = 5;

const MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

export function formatPartialDate(date: PartialDate): string {
  if (date.month && date.day) return `${date.day}.${date.month}.${date.year}`;
  if (date.month) return `${MONTHS[date.month - 1]} ${date.year}`;
  return String(date.year);
}

export function formatFuzzyDate(date: FuzzyDate): string {
  switch (date.kind) {
    case 'exact':
      return formatPartialDate(date.date);
    case 'about':
      return `um ${formatPartialDate(date.date)}`;
    case 'before':
      return `vor ${formatPartialDate(date.date)}`;
    case 'after':
      return `nach ${formatPartialDate(date.date)}`;
    case 'between':
      return `zwischen ${formatPartialDate(date.from)} und ${formatPartialDate(date.to)}`;
  }
}

/** Spätestmögliches Jahr; bei „nach …" unbegrenzt. */
export function latestYear(date: FuzzyDate): number {
  switch (date.kind) {
    case 'exact':
    case 'before':
      return date.date.year;
    case 'about':
      return date.date.year + ABOUT_TOLERANCE_YEARS;
    case 'after':
      return Number.POSITIVE_INFINITY;
    case 'between':
      return date.to.year;
  }
}

/** Frühestmögliches Jahr; bei „vor …" unbegrenzt. */
export function earliestYear(date: FuzzyDate): number {
  switch (date.kind) {
    case 'exact':
    case 'after':
      return date.date.year;
    case 'about':
      return date.date.year - ABOUT_TOLERANCE_YEARS;
    case 'before':
      return Number.NEGATIVE_INFINITY;
    case 'between':
      return date.from.year;
  }
}

/** Ein repräsentatives Jahr, z. B. zum Sortieren oder für Zeitachsen. */
export function approximateYear(date: FuzzyDate): number {
  switch (date.kind) {
    case 'exact':
    case 'about':
    case 'before':
    case 'after':
      return date.date.year;
    case 'between':
      return Math.round((date.from.year + date.to.year) / 2);
  }
}

/** Vergleichswert für eine Sortierung nach Datum (Jahr, Monat, Tag). */
export function sortKey(date: FuzzyDate): number {
  const base = date.kind === 'between' ? date.from : date.date;
  return approximateYear(date) * 10000 + (base.month ?? 0) * 100 + (base.day ?? 0);
}
