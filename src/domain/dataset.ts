// Zugriff auf den Datenbestand: Nachschlagen, Verwandtschaft, bevorzugte Angaben, Namen.

import type {
  Dataset,
  EventClaim,
  NameClaim,
  Parentage,
  Partnership,
  Person,
  PersonEventType,
} from './schema.ts';

/** Die bevorzugte unter den übernommenen Angaben, sonst die erste übernommene. */
export function preferredClaim<T extends { status: string; preferred?: boolean }>(claims: readonly T[]): T | undefined {
  const accepted = claims.filter((claim) => claim.status === 'accepted');
  return accepted.find((claim) => claim.preferred) ?? accepted[0];
}

export function preferredEventClaim(person: Person, type: PersonEventType): EventClaim | undefined {
  const event = person.events.find((candidate) => candidate.type === type);
  return event ? preferredClaim(event.claims) : undefined;
}

/** Alle übernommenen Angaben eines Ereignistyps, z. B. alle Berufe. */
export function acceptedEventClaims(person: Person, type: PersonEventType): EventClaim[] {
  return person.events
    .filter((event) => event.type === type)
    .flatMap((event) => event.claims.filter((claim) => claim.status === 'accepted'));
}

/** Angezeigter Name: der heutige Name, sonst der bevorzugte. */
export function displayName(person: Person): NameClaim {
  const accepted = person.names.filter((name) => name.status === 'accepted');
  const current = accepted.find((name) => name.type === 'current');
  return current ?? preferredClaim(accepted) ?? person.names[0]!;
}

export function formatName(name: NameClaim): string {
  return [name.given, name.surname].filter(Boolean).join(' ') || 'N. N.';
}

/** Geburtsname, falls er vom angezeigten Namen abweicht. */
export function birthSurname(person: Person): string | undefined {
  const birth = person.names.find((name) => name.type === 'birth' && name.status === 'accepted');
  const shown = displayName(person);
  return birth?.surname && birth.surname !== shown.surname ? birth.surname : undefined;
}

export interface ParentLink {
  partnership: Partnership;
  parentage: Parentage;
}

export interface DatasetIndex {
  dataset: Dataset;
  person(id: string): Person | undefined;
  /** Partnerschaften, in denen die Person Partner ist, in Reihenfolge des Datenbestands. */
  partnershipsOf(personId: string): Partnership[];
  /** Partnerschaften, aus denen die Person als Kind stammt (leiblich, adoptiert, Stiefkind …). */
  parentLinksOf(personId: string): ParentLink[];
  /** Der andere Partner einer Partnerschaft. */
  partnerOf(partnership: Partnership, personId: string): string | null;
}

export function indexDataset(dataset: Dataset): DatasetIndex {
  const persons = new Map(dataset.persons.map((person) => [person.id, person]));
  const partnershipsByPerson = new Map<string, Partnership[]>();
  const parentLinksByChild = new Map<string, ParentLink[]>();

  for (const partnership of dataset.partnerships) {
    for (const partnerId of partnership.partners) {
      if (!partnerId) continue;
      partnershipsByPerson.set(partnerId, [...(partnershipsByPerson.get(partnerId) ?? []), partnership]);
    }
    for (const parentage of partnership.children) {
      if (parentage.status === 'rejected') continue;
      const links = parentLinksByChild.get(parentage.childId) ?? [];
      links.push({ partnership, parentage });
      parentLinksByChild.set(parentage.childId, links);
    }
  }

  return {
    dataset,
    person: (id) => persons.get(id),
    partnershipsOf: (personId) => partnershipsByPerson.get(personId) ?? [],
    parentLinksOf: (personId) => parentLinksByChild.get(personId) ?? [],
    partnerOf: (partnership, personId) =>
      partnership.partners[0] === personId ? partnership.partners[1] : partnership.partners[0],
  };
}

/** Prüft, ob alle Verweise im Datenbestand auf existierende Einträge zeigen. Liefert Fehlertexte. */
export function findBrokenReferences(dataset: Dataset): string[] {
  const errors: string[] = [];
  const ids = {
    person: new Set(dataset.persons.map((item) => item.id)),
    place: new Set(dataset.places.map((item) => item.id)),
    source: new Set(dataset.sources.map((item) => item.id)),
    media: new Set(dataset.media.map((item) => item.id)),
    lineage: new Set(dataset.lineages.map((item) => item.id)),
    question: new Set(dataset.researchQuestions.map((item) => item.id)),
  };

  const allIds = [
    ...dataset.persons.map((item) => item.id),
    ...dataset.partnerships.map((item) => item.id),
    ...dataset.places.map((item) => item.id),
    ...dataset.sources.map((item) => item.id),
    ...dataset.media.map((item) => item.id),
    ...dataset.lineages.map((item) => item.id),
    ...dataset.lines.map((item) => item.id),
    ...dataset.researchQuestions.map((item) => item.id),
  ];
  const seen = new Set<string>();
  for (const id of allIds) {
    if (seen.has(id)) errors.push(`ID doppelt vergeben: ${id}`);
    seen.add(id);
  }

  const check = (kind: keyof typeof ids, id: string | null | undefined, where: string) => {
    if (id && !ids[kind].has(id)) errors.push(`${where}: unbekannte ${kind}-ID „${id}"`);
  };
  const checkClaim = (
    claim: { citation: { sourceId: string; region?: { mediaId: string } }; researchQuestionId?: string },
    where: string,
  ) => {
    check('source', claim.citation.sourceId, where);
    check('media', claim.citation.region?.mediaId, where);
    check('question', claim.researchQuestionId, where);
  };

  check('person', dataset.probandId, 'Proband');
  for (const person of dataset.persons) {
    for (const name of person.names) checkClaim(name, `Person ${person.id}, Name`);
    for (const event of person.events) {
      for (const claim of event.claims) {
        checkClaim(claim, `Person ${person.id}, ${event.type}`);
        check('place', claim.placeId, `Person ${person.id}, ${event.type}`);
      }
    }
  }
  for (const partnership of dataset.partnerships) {
    for (const partnerId of partnership.partners) check('person', partnerId, `Partnerschaft ${partnership.id}`);
    for (const event of partnership.events) {
      for (const claim of event.claims) {
        checkClaim(claim, `Partnerschaft ${partnership.id}, ${event.type}`);
        check('place', claim.placeId, `Partnerschaft ${partnership.id}, ${event.type}`);
      }
    }
    for (const child of partnership.children) {
      check('person', child.childId, `Partnerschaft ${partnership.id}, Kind`);
      checkClaim(child, `Partnerschaft ${partnership.id}, Kind`);
    }
  }
  for (const source of dataset.sources) check('media', source.mediaId, `Quelle ${source.id}`);
  for (const lineage of dataset.lineages) {
    check('person', lineage.progenitorId, `Stamm ${lineage.id}`);
    check('source', lineage.originalSourceId, `Stamm ${lineage.id}`);
  }
  for (const line of dataset.lines) {
    check('lineage', line.lineageId, `Linie ${line.id}`);
    check('person', line.founderId, `Linie ${line.id}`);
  }
  for (const question of dataset.researchQuestions) {
    for (const personId of question.personIds) check('person', personId, `Forschungsfrage ${question.id}`);
  }
  return errors;
}
