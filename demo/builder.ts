// Baukasten, um Datenbestände knapp im Code zu beschreiben: für Tests und den erfundenen Demo-Stammbaum.

import {
  Dataset,
  type ClaimStatus,
  type Confidence,
  type EventClaim,
  type FuzzyDate,
  type NameClaim,
  type Parentage,
  type PartialDate,
  type PartnershipEvent,
  type PersonEventType,
  type Place,
  type Source,
} from '../src/domain/schema.ts';

type DatasetInput = Dataset;
type SexValue = Dataset['persons'][number]['sex'];

function partial(year: number, month?: number, day?: number): PartialDate {
  return { year, ...(month ? { month } : {}), ...(day ? { day } : {}) };
}

export const exact = (year: number, month?: number, day?: number): FuzzyDate => ({ kind: 'exact', date: partial(year, month, day) });
export const about = (year: number, month?: number, day?: number): FuzzyDate => ({ kind: 'about', date: partial(year, month, day) });
export const before = (year: number, month?: number, day?: number): FuzzyDate => ({ kind: 'before', date: partial(year, month, day) });
export const after = (year: number, month?: number, day?: number): FuzzyDate => ({ kind: 'after', date: partial(year, month, day) });
export const between = (from: number, to: number): FuzzyDate => ({ kind: 'between', from: partial(from), to: partial(to) });

export interface ClaimOptions {
  source?: string;
  location?: string;
  confidence?: Confidence;
  status?: ClaimStatus;
  preferred?: boolean;
  verbatim?: string;
  alternatives?: string[];
  needsReview?: boolean;
  question?: string;
  note?: string;
}

export interface EventOptions extends ClaimOptions {
  date?: FuzzyDate;
  place?: string;
  value?: string;
  cause?: string;
}

export interface PersonOptions extends ClaimOptions {
  birthSurname?: string;
  callName?: string;
  mentioned?: boolean;
  birth?: EventOptions;
  baptism?: EventOptions;
  death?: EventOptions;
  burial?: EventOptions;
  occupation?: EventOptions | string;
  residence?: EventOptions | string;
  note?: string;
}

/** Ereignisse, die eine Person nur einmal hat; weitere Angaben dazu landen im selben Ereignis. */
const SINGLE_EVENTS = new Set<PersonEventType>(['birth', 'baptism', 'death', 'burial']);

export class DatasetBuilder {
  private counters = new Map<string, number>();
  private data: DatasetInput = {
    schemaVersion: 1,
    probandId: null,
    persons: [],
    partnerships: [],
    places: [],
    sources: [],
    media: [],
    lineages: [],
    lines: [],
    researchQuestions: [],
  };

  /** Quelle, die Angaben ohne eigene Quellenangabe bekommen. */
  defaultSourceId = '';

  nextId(prefix: string): string {
    const next = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, next);
    return `${prefix}-${String(next).padStart(3, '0')}`;
  }

  private claim(options: ClaimOptions) {
    const sourceId = options.source ?? this.defaultSourceId;
    if (!sourceId) throw new Error('Angabe ohne Quelle: defaultSourceId setzen oder source angeben');
    return {
      id: this.nextId('c'),
      citation: { sourceId, ...(options.location ? { location: options.location } : {}) },
      confidence: options.confidence ?? 'probable',
      status: options.status ?? 'accepted',
      ...(options.preferred ? { preferred: true } : {}),
      ...(options.verbatim ? { verbatim: options.verbatim } : {}),
      ...(options.alternatives ? { verbatimAlternatives: options.alternatives } : {}),
      ...(options.needsReview ? { needsReview: true } : {}),
      ...(options.question ? { researchQuestionId: options.question } : {}),
      ...(options.note ? { note: options.note } : {}),
    };
  }

  private eventClaim(options: EventOptions): EventClaim {
    return {
      ...this.claim(options),
      ...(options.date ? { date: options.date } : {}),
      ...(options.place ? { placeId: options.place } : {}),
      ...(options.value ? { value: options.value } : {}),
      ...(options.cause ? { cause: options.cause } : {}),
    };
  }

  source(source: Omit<Source, 'id'> & { id?: string }): string {
    const id = source.id ?? this.nextId('src');
    this.data.sources.push({ ...source, id });
    return id;
  }

  place(place: Omit<Place, 'id'> & { id: string }): string {
    this.data.places.push(place);
    return place.id;
  }

  person(sex: SexValue, given: string, surname: string | undefined, options: PersonOptions = {}): string {
    const id = this.nextId('p');
    const names: NameClaim[] = [];
    if (options.birthSurname) {
      names.push({ ...this.claim(options), type: 'birth', given, surname: options.birthSurname });
    }
    names.push({
      ...this.claim(options),
      type: options.birthSurname ? 'married' : 'birth',
      given,
      ...(surname ? { surname } : {}),
      ...(options.callName ? { callName: options.callName } : {}),
    });
    this.data.persons.push({
      id,
      sex,
      names,
      events: [],
      mentioned: options.mentioned ?? false,
      status: options.status ?? 'accepted',
    });

    for (const type of ['birth', 'baptism', 'death', 'burial'] as const) {
      const event = options[type];
      if (event) this.event(id, type, { source: options.source, ...event });
    }
    for (const type of ['occupation', 'residence'] as const) {
      const event = options[type];
      if (event) this.event(id, type, typeof event === 'string' ? { source: options.source, value: event, verbatim: event } : { source: options.source, ...event });
    }
    if (options.note) this.event(id, 'note', { source: options.source, value: options.note, verbatim: options.note });
    return id;
  }

  /** Zusätzlicher Name, z. B. heutiger Name nach erneuter Heirat oder eine Schreibvariante. */
  name(personId: string, type: NameClaim['type'], given: string | undefined, surname: string | undefined, options: ClaimOptions = {}): void {
    this.findPerson(personId).names.push({
      ...this.claim(options),
      type,
      ...(given ? { given } : {}),
      ...(surname ? { surname } : {}),
    });
  }

  event(personId: string, type: PersonEventType, options: EventOptions): string {
    const person = this.findPerson(personId);
    const claim = this.eventClaim(options);
    const existing = SINGLE_EVENTS.has(type) ? person.events.find((event) => event.type === type) : undefined;
    if (existing) existing.claims.push(claim);
    else person.events.push({ id: this.nextId('e'), type, claims: [claim] });
    return claim.id;
  }

  partnership(
    first: string | null,
    second: string | null,
    options: { kind?: 'marriage' | 'union' | 'unknown'; marriage?: EventOptions } = {},
  ): string {
    const id = this.nextId('pa');
    this.data.partnerships.push({ id, partners: [first, second], kind: options.kind ?? 'marriage', events: [], children: [] });
    if (options.marriage) this.partnershipEvent(id, 'marriage', options.marriage);
    return id;
  }

  partnershipEvent(partnershipId: string, type: PartnershipEvent['type'], options: EventOptions): void {
    const partnership = this.findPartnership(partnershipId);
    partnership.events.push({ id: this.nextId('e'), type, claims: [this.eventClaim(options)] });
  }

  child(partnershipId: string, childId: string, kind: Parentage['kind'] = 'biological', options: ClaimOptions = {}): void {
    this.findPartnership(partnershipId).children.push({ ...this.claim(options), childId, kind });
  }

  children(partnershipId: string, childIds: string[]): void {
    for (const childId of childIds) this.child(partnershipId, childId);
  }

  proband(personId: string): void {
    this.data.probandId = personId;
  }

  lineage(name: string, progenitorId: string, originalSourceId?: string): string {
    const id = this.nextId('stamm');
    this.data.lineages.push({ id, name, progenitorId, ...(originalSourceId ? { originalSourceId } : {}) });
    return id;
  }

  line(lineageId: string, name: string, founderId: string, verbatim?: string): string {
    const id = this.nextId('linie');
    this.data.lines.push({ id, lineageId, name, founderId, ...(verbatim ? { verbatim } : {}) });
    return id;
  }

  media(media: Omit<DatasetInput['media'][number], 'id'>): string {
    const id = this.nextId('m');
    this.data.media.push({ ...media, id });
    return id;
  }

  researchQuestion(question: Omit<DatasetInput['researchQuestions'][number], 'id'>): string {
    const id = this.nextId('rq');
    this.data.researchQuestions.push({ ...question, id });
    return id;
  }

  /** Prüft den Bestand gegen das Schema und liefert ihn mit allen Standardwerten. */
  build(): Dataset {
    return Dataset.parse(structuredClone(this.data));
  }

  private findPerson(id: string) {
    const person = this.data.persons.find((candidate) => candidate.id === id);
    if (!person) throw new Error(`Unbekannte Person ${id}`);
    return person;
  }

  private findPartnership(id: string) {
    const partnership = this.data.partnerships.find((candidate) => candidate.id === id);
    if (!partnership) throw new Error(`Unbekannte Partnerschaft ${id}`);
    return partnership;
  }
}
