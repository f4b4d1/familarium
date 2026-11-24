import { describe, expect, it } from 'vitest';
import { about, before, between, DatasetBuilder, exact } from '../../demo/builder.ts';
import { findBrokenReferences, formatName, displayName, indexDataset, preferredEventClaim } from './dataset.ts';
import { earliestYear, formatFuzzyDate, latestYear } from './dates.ts';
import { computeGenerations, formatGeneration, toRoman } from './generations.ts';
import { computeKekuleNumbers, kekuleGeneration } from './kekule.ts';
import { protectionOf } from './protection.ts';

// Alle Personen sind erfunden.

/** Kleiner Stamm mit Cousinenehe (Ahnenschwund) und einem Vorfahren des Stammvaters. */
function cousinFamily() {
  const b = new DatasetBuilder();
  b.defaultSourceId = b.source({ kind: 'original', title: 'Test-Original' });

  const vorfahr = b.person('m', 'Veit', 'Testmann', { birth: { date: about(1670) } });
  const stammvater = b.person('m', 'Arnold', 'Testmann', { birth: { date: about(1700) } });
  b.child(b.partnership(vorfahr, null, { kind: 'unknown' }), stammvater);

  const sohn = b.person('m', 'Bernd', 'Testmann', { birth: { date: exact(1730) } });
  const tochter = b.person('f', 'Clara', 'Testmann', { birth: { date: exact(1732) } });
  b.children(b.partnership(stammvater, null, { kind: 'unknown' }), [sohn, tochter]);

  const schwiegertochter = b.person('f', 'Berta', 'Eingeheiratet');
  const enkel = b.person('m', 'Dietrich', 'Testmann', { birth: { date: exact(1760) } });
  b.child(b.partnership(sohn, schwiegertochter), enkel);

  const schwiegersohn = b.person('m', 'Conrad', 'Anders');
  const enkelin = b.person('f', 'Elke', 'Anders', { birth: { date: exact(1762) } });
  b.child(b.partnership(schwiegersohn, tochter), enkelin);

  const proband = b.person('m', 'Friedrich', 'Testmann', { birth: { date: exact(1790) } });
  const adoptiert = b.person('f', 'Grete', 'Testmann');
  const cousinehe = b.partnership(enkel, enkelin, { marriage: { date: exact(1788, 5, 3) } });
  b.child(cousinehe, proband);
  b.child(cousinehe, adoptiert, 'adopted');
  b.proband(proband);
  const stamm = b.lineage('Stamm Testmann', stammvater);

  return {
    index: indexDataset(b.build()),
    ids: { vorfahr, stammvater, sohn, tochter, schwiegertochter, enkel, schwiegersohn, enkelin, proband, adoptiert, stamm },
  };
}

describe('unscharfe Daten', () => {
  it('formatiert alle Arten', () => {
    expect(formatFuzzyDate(exact(1872, 3, 12))).toBe('12.3.1872');
    expect(formatFuzzyDate(exact(1872, 3))).toBe('März 1872');
    expect(formatFuzzyDate(about(1560))).toBe('um 1560');
    expect(formatFuzzyDate(before(1611))).toBe('vor 1611');
    expect(formatFuzzyDate(between(1840, 1845))).toBe('zwischen 1840 und 1845');
  });

  it('liefert Jahresgrenzen', () => {
    expect(latestYear(about(1850))).toBe(1855);
    expect(earliestYear(about(1850))).toBe(1845);
    expect(latestYear(before(1611))).toBe(1611);
    expect(earliestYear(before(1611))).toBe(Number.NEGATIVE_INFINITY);
    expect(latestYear(between(1840, 1845))).toBe(1845);
  });
});

describe('Generationen', () => {
  it('zählt ab dem Stammvater, Eingeheiratete in der Generation ihres Partners', () => {
    const { index, ids } = cousinFamily();
    const generations = computeGenerations(index, ids.stamm);
    expect(generations.get(ids.stammvater)).toBe(1);
    expect(generations.get(ids.sohn)).toBe(2);
    expect(generations.get(ids.schwiegertochter)).toBe(2);
    expect(generations.get(ids.enkelin)).toBe(3);
    expect(generations.get(ids.proband)).toBe(4);
  });

  it('zählt Vorfahren des Stammvaters als „vor I"', () => {
    const { index, ids } = cousinFamily();
    const generations = computeGenerations(index, ids.stamm);
    expect(generations.get(ids.vorfahr)).toBe(0);
    expect(formatGeneration(0)).toBe('vor I (1)');
    expect(formatGeneration(-1)).toBe('vor I (2)');
    expect(formatGeneration(13)).toBe('XIII');
    expect(toRoman(16)).toBe('XVI');
  });
});

describe('Ahnennummern', () => {
  it('vergibt Vater 2n und Mutter 2n+1', () => {
    const { index, ids } = cousinFamily();
    const numbers = computeKekuleNumbers(index, ids.proband);
    expect(numbers.get(ids.proband)).toEqual([1]);
    expect(numbers.get(ids.enkel)).toEqual([2]);
    expect(numbers.get(ids.enkelin)).toEqual([3]);
    expect(numbers.get(ids.schwiegertochter)).toEqual([5]);
    expect(numbers.get(ids.tochter)).toEqual([7]);
  });

  it('gibt bei Ahnenschwund mehrere Nummern', () => {
    const { index, ids } = cousinFamily();
    const numbers = computeKekuleNumbers(index, ids.proband);
    expect(numbers.get(ids.stammvater)).toEqual([8, 14]);
    expect(numbers.get(ids.vorfahr)).toEqual([16, 28]);
  });

  it('macht Adoptivkinder nicht zu Ahnen-Linien', () => {
    const { index, ids } = cousinFamily();
    expect(computeKekuleNumbers(index, ids.adoptiert).size).toBe(1);
  });

  it('berechnet die Generation aus der Nummer', () => {
    expect(kekuleGeneration(1)).toBe(1);
    expect(kekuleGeneration(3)).toBe(2);
    expect(kekuleGeneration(8)).toBe(4);
  });
});

describe('Schutzregel (ADR 0003)', () => {
  const today = new Date('2026-06-01');

  function single(options: Parameters<DatasetBuilder['person']>[3]) {
    const b = new DatasetBuilder();
    b.defaultSourceId = b.source({ kind: 'family-knowledge', title: 'Test' });
    const id = b.person('u', 'Test', 'Person', options);
    return protectionOf(indexDataset(b.build()), id, today);
  }

  it('gibt Personen frei, deren Geburt sicher über 100 Jahre zurückliegt', () => {
    expect(single({ birth: { date: exact(1900) } })).toEqual({ protected: false });
    expect(single({ birth: { date: about(1915) } })).toEqual({ protected: false });
  });

  it('schützt Personen, die noch leben könnten', () => {
    expect(single({ birth: { date: exact(1930) } })).toEqual({ protected: true, reason: 'born-recently' });
    expect(single({ birth: { date: about(1922) } })).toEqual({ protected: true, reason: 'born-recently' });
  });

  it('schützt kürzlich Verstorbene, auch wenn ihre Geburt lange her ist', () => {
    expect(single({ birth: { date: exact(1939) }, death: { date: exact(2023) } }).reason).toBe('died-recently');
    expect(single({ birth: { date: exact(1920) }, death: { date: exact(2020) } }).reason).toBe('died-recently');
  });

  it('gibt Personen frei, die vor mindestens 30 Jahren gestorben sind', () => {
    expect(single({ birth: { date: exact(1930) }, death: { date: exact(1990) } })).toEqual({ protected: false });
  });

  it('schützt bei Tod ohne Datum, wenn die Geburt jung ist', () => {
    expect(single({ birth: { date: exact(1934) }, death: { verbatim: '†' } }).reason).toBe(
      'death-date-unknown-born-recently',
    );
  });

  it('schützt Personen ganz ohne Daten', () => {
    expect(single({})).toEqual({ protected: true, reason: 'birth-not-estimable' });
  });

  it('schätzt die Geburt aus einem Kind (minus 15 Jahre)', () => {
    const b = new DatasetBuilder();
    b.defaultSourceId = b.source({ kind: 'original', title: 'Test' });
    const parent = b.person('m', 'Ohne', 'Daten');
    const child = b.person('f', 'Kind', 'Daten', { birth: { date: exact(1810) } });
    b.child(b.partnership(parent, null), child);
    expect(protectionOf(indexDataset(b.build()), parent, today)).toEqual({ protected: false });
  });
});

describe('Datenbestand', () => {
  it('zeigt den heutigen Namen und bevorzugt markierte Angaben', () => {
    const b = new DatasetBuilder();
    const original = b.source({ kind: 'original', title: 'Test-Original' });
    const kirchenbuch = b.source({ kind: 'church-record', title: 'Test-Kirchenbuch' });
    b.defaultSourceId = original;
    const id = b.person('f', 'Marta', 'Ehemann', { birthSurname: 'Geborene', birth: { date: exact(1748) } });
    b.name(id, 'current', 'Marta', 'Heute');
    b.event(id, 'birth', { source: kirchenbuch, date: exact(1747), preferred: true, confidence: 'proven' });
    const person = indexDataset(b.build()).person(id)!;
    expect(formatName(displayName(person))).toBe('Marta Heute');
    expect(preferredEventClaim(person, 'birth')?.date).toEqual(exact(1747));
  });

  it('meldet kaputte Verweise', () => {
    const { index } = cousinFamily();
    const broken = structuredClone(index.dataset);
    broken.partnerships[0]!.children.push({ ...broken.partnerships[0]!.children[0]!, childId: 'gibt-es-nicht' });
    expect(findBrokenReferences(index.dataset)).toEqual([]);
    expect(findBrokenReferences(broken)).toEqual([expect.stringContaining('gibt-es-nicht')]);
  });
});
