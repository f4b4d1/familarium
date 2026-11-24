// Schutzregel für externe Recherche (ADR 0003).

import { latestYear } from './dates.ts';
import { preferredEventClaim, type DatasetIndex } from './dataset.ts';

/** Mindestabstand zur Geburt, ab dem eine Person ohne bekannten Tod recherchiert werden darf. */
export const BIRTH_YEARS = 100;
/** Mindestabstand zum Tod, ab dem eine verstorbene Person recherchiert werden darf. */
export const DEATH_YEARS = 30;
/** Mindestalter eines Elternteils bei Geburt eines Kindes oder bei der Heirat, für die Schätzung. */
export const MIN_PARENT_AGE = 15;

/**
 * Spätestmögliches Geburtsjahr einer Person: aus eigener Geburt oder Taufe, sonst geschätzt
 * aus der frühesten Geburt eines Kindes oder der frühesten Heirat (jeweils minus 15 Jahre).
 * `undefined`, wenn sich nichts schätzen lässt.
 */
export function latestBirthYear(index: DatasetIndex, personId: string): number | undefined {
  const person = index.person(personId);
  if (!person) return undefined;

  const own = [preferredEventClaim(person, 'birth'), preferredEventClaim(person, 'baptism')]
    .map((claim) => (claim?.date ? latestYear(claim.date) : Number.POSITIVE_INFINITY))
    .reduce((a, b) => Math.min(a, b));
  if (Number.isFinite(own)) return own;

  let estimate = Number.POSITIVE_INFINITY;
  for (const partnership of index.partnershipsOf(personId)) {
    for (const event of partnership.events.filter((candidate) => candidate.type === 'marriage')) {
      for (const claim of event.claims) {
        if (claim.status === 'accepted' && claim.date) estimate = Math.min(estimate, latestYear(claim.date) - MIN_PARENT_AGE);
      }
    }
    for (const parentage of partnership.children) {
      if (parentage.status !== 'accepted' || !['biological', 'unknown'].includes(parentage.kind)) continue;
      const child = index.person(parentage.childId);
      const childBirth = child && (preferredEventClaim(child, 'birth') ?? preferredEventClaim(child, 'baptism'));
      if (childBirth?.date) estimate = Math.min(estimate, latestYear(childBirth.date) - MIN_PARENT_AGE);
    }
  }
  return Number.isFinite(estimate) ? estimate : undefined;
}

export type ProtectionReason =
  | 'died-recently'
  | 'death-date-unknown-born-recently'
  | 'born-recently'
  | 'birth-not-estimable';

export interface ProtectionResult {
  protected: boolean;
  reason?: ProtectionReason;
}

/**
 * Geschützt ist, wer noch leben könnte oder erst kürzlich gestorben ist (GLOSSARY: Geschützte Person).
 * - Tod mit Datum: frei erst, wenn er spätestens vor 30 Jahren war.
 * - Sonst: frei, wenn die Geburt (eigen oder geschätzt) sicher mehr als 100 Jahre zurückliegt.
 */
export function protectionOf(index: DatasetIndex, personId: string, today = new Date()): ProtectionResult {
  const person = index.person(personId);
  if (!person) return { protected: true, reason: 'birth-not-estimable' };
  const year = today.getFullYear();

  const death = preferredEventClaim(person, 'death') ?? preferredEventClaim(person, 'burial');
  if (death?.date) {
    return latestYear(death.date) <= year - DEATH_YEARS
      ? { protected: false }
      : { protected: true, reason: 'died-recently' };
  }

  const birth = latestBirthYear(index, personId);
  if (birth === undefined) return { protected: true, reason: 'birth-not-estimable' };
  if (birth < year - BIRTH_YEARS) return { protected: false };
  return { protected: true, reason: death ? 'death-date-unknown-born-recently' : 'born-recently' };
}

export function isProtected(index: DatasetIndex, personId: string, today = new Date()): boolean {
  return protectionOf(index, personId, today).protected;
}
