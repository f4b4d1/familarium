// Gemeinsamer Datenzugriff der Entwürfe: lädt den erfundenen Demo-Stammbaum und bereitet Anzeigewerte auf.

import demo from '../demo/demo-stammbaum.json';
import {
  acceptedEventClaims,
  birthSurname,
  displayName,
  formatName,
  indexDataset,
  preferredClaim,
  preferredEventClaim,
} from '../src/domain/dataset.ts';
import { formatFuzzyDate, sortKey } from '../src/domain/dates.ts';
import { computeGenerations, formatGeneration } from '../src/domain/generations.ts';
import { computeKekuleNumbers } from '../src/domain/kekule.ts';
import { protectionOf } from '../src/domain/protection.ts';
import { Dataset, type EventClaim, type Partnership } from '../src/domain/schema.ts';

export const dataset = Dataset.parse(demo);
export const index = indexDataset(dataset);
export const lineage = dataset.lineages[0]!;
export const probandId = dataset.probandId!;
export const generations = computeGenerations(index, lineage.id);
export const kekule = computeKekuleNumbers(index, probandId);

/** Nachkommen des Stammvaters (über Kinder erreichbar), ohne Eingeheiratete. */
export const descendants = (() => {
  const result = new Set<string>([lineage.progenitorId]);
  const queue = [lineage.progenitorId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const partnership of index.partnershipsOf(id)) {
      for (const child of partnership.children) {
        if (child.status !== 'rejected' && !result.has(child.childId)) {
          result.add(child.childId);
          queue.push(child.childId);
        }
      }
    }
  }
  return result;
})();

export function placeName(id?: string): string | undefined {
  return id ? dataset.places.find((place) => place.id === id)?.historicalName : undefined;
}

export function sourceOf(id: string) {
  return dataset.sources.find((source) => source.id === id);
}

export function claimText(claim: EventClaim | undefined): string | undefined {
  if (!claim) return undefined;
  const parts = [claim.date ? formatFuzzyDate(claim.date) : undefined, placeName(claim.placeId)].filter(Boolean);
  return parts.length > 0 ? parts.join(' in ') : claim.verbatim ? 'Datum unbekannt' : undefined;
}

export interface Summary {
  id: string;
  sex: 'm' | 'f' | 'u';
  name: string;
  given: string;
  surname: string;
  birthSurname?: string;
  born?: string;
  died?: string;
  occupation?: string;
  generation?: number;
  generationLabel?: string;
  kekule: number[];
  protected: boolean;
  mentioned: boolean;
  suggested: boolean;
  needsReview: boolean;
  birthKey: number;
}

const summaries = new Map<string, Summary>();

export function summary(id: string): Summary {
  const cached = summaries.get(id);
  if (cached) return cached;
  const person = index.person(id);
  if (!person) throw new Error(`Unbekannte Person ${id}`);
  const name = displayName(person);
  const birth = preferredEventClaim(person, 'birth') ?? preferredEventClaim(person, 'baptism');
  const death = preferredEventClaim(person, 'death') ?? preferredEventClaim(person, 'burial');
  const occupation = acceptedEventClaims(person, 'occupation')[0] ?? preferredClaim(person.events.find((e) => e.type === 'occupation')?.claims ?? []);
  const generation = generations.get(id);
  const allClaims = [...person.names, ...person.events.flatMap((event) => event.claims)];
  const result: Summary = {
    id,
    sex: person.sex,
    name: formatName(name),
    given: name.given ?? 'N. N.',
    surname: name.surname ?? '',
    birthSurname: birthSurname(person),
    born: claimText(birth),
    died: death ? (claimText(death) ?? 'verstorben') : undefined,
    occupation: occupation?.value,
    generation,
    generationLabel: generation === undefined ? undefined : formatGeneration(generation),
    kekule: kekule.get(id) ?? [],
    protected: protectionOf(index, id).protected,
    mentioned: person.mentioned,
    suggested: person.status === 'suggested',
    needsReview: allClaims.some((claim) => claim.needsReview),
    birthKey: birth?.date ? sortKey(birth.date) : Number.POSITIVE_INFINITY,
  };
  summaries.set(id, result);
  return result;
}

export function lifeSpan(s: Summary): string {
  return [s.born ? `* ${s.born}` : undefined, s.died ? `† ${s.died}` : undefined].filter(Boolean).join('  ');
}

export function marriageClaim(partnership: Partnership): EventClaim | undefined {
  const event = partnership.events.find((candidate) => candidate.type === 'marriage');
  return event ? preferredClaim(event.claims) : undefined;
}

/** „⚭ 3.2.1636 in Eschenbrück", soweit bekannt. */
export function marriageText(partnership: Partnership): string | undefined {
  const claim = marriageClaim(partnership);
  if (!claim) return undefined;
  const text = claimText(claim);
  return text ? `⚭ ${text}` : '⚭';
}

export function isDivorced(partnership: Partnership): boolean {
  return partnership.events.some((event) => event.type === 'divorce');
}

/** Partnerschaften einer Person, nach Heiratsdatum sortiert. */
export function partnershipsSorted(personId: string): Partnership[] {
  return [...index.partnershipsOf(personId)].sort((a, b) => {
    const da = marriageClaim(a)?.date;
    const db = marriageClaim(b)?.date;
    return (da ? sortKey(da) : Infinity) - (db ? sortKey(db) : Infinity);
  });
}

/** Kinder einer Partnerschaft, nach Geburt sortiert, mit Art der Elternschaft. */
export function childrenOf(partnership: Partnership) {
  return partnership.children
    .filter((child) => child.status !== 'rejected')
    .map((child) => ({ id: child.childId, kind: child.kind, suggested: child.status === 'suggested' }))
    .sort((a, b) => summary(a.id).birthKey - summary(b.id).birthKey);
}

export const KIND_LABEL: Record<string, string | undefined> = {
  adopted: 'adoptiert',
  step: 'Stiefkind',
  foster: 'Pflegekind',
};

/** Eltern einer Person (aus der ersten nicht verworfenen Elternschaft). */
export function parentsOf(personId: string): { father?: string; mother?: string; partnership?: Partnership } {
  const link = index.parentLinksOf(personId)[0];
  if (!link) return {};
  const [a, b] = link.partnership.partners;
  const aIsMother = (a && index.person(a)?.sex === 'f') || (b && index.person(b)?.sex === 'm');
  return {
    father: (aIsMother ? b : a) ?? undefined,
    mother: (aIsMother ? a : b) ?? undefined,
    partnership: link.partnership,
  };
}

/** Weg in der Stammlinie vom Stammvater bis zur Person (über den Elternteil, der Nachkomme ist, bevorzugt den Vater). */
export function pathFromProgenitor(personId: string): string[] {
  const path = [personId];
  let current = personId;
  while (current !== lineage.progenitorId) {
    const { father, mother } = parentsOf(current);
    const next = [father, mother].find((id) => id && descendants.has(id) && index.person(id)?.status === 'accepted');
    if (!next) break;
    path.unshift(next);
    current = next;
  }
  return path;
}

export function searchablePersons(): Summary[] {
  return dataset.persons.map((person) => summary(person.id)).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export const EVENT_LABEL: Record<string, string> = {
  birth: 'Geburt',
  baptism: 'Taufe',
  death: 'Tod',
  burial: 'Begräbnis',
  occupation: 'Beruf / Amt',
  residence: 'Wohnort',
  emigration: 'Auswanderung',
  military: 'Militär',
  note: 'Notiz',
  marriage: 'Heirat',
  divorce: 'Scheidung',
  engagement: 'Verlobung',
  separation: 'Trennung',
};

export const CONFIDENCE_LABEL: Record<string, string> = {
  proven: 'belegt',
  probable: 'wahrscheinlich',
  assumed: 'vermutet',
  unknown: 'unbekannt',
};

/** Römische Ordnungszahl für „I. Ehe", „II. Ehe". */
export function ordinal(n: number): string {
  return ['I', 'II', 'III', 'IV', 'V'][n - 1] ?? String(n);
}
