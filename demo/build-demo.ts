// Erzeugt den erfundenen Demo-Stammbaum demo/demo-stammbaum.json.
// Alle Personen, Orte und Quellen sind frei erfunden (bis auf große Städte als Wohnorte).
// Aufruf: node demo/build-demo.ts

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findBrokenReferences } from '../src/domain/dataset.ts';
import { formatPartialDate } from '../src/domain/dates.ts';
import type { Dataset, FuzzyDate } from '../src/domain/schema.ts';
import { about, before, DatasetBuilder, exact, type EventOptions } from './builder.ts';

const b = new DatasetBuilder();

// ── Quellen ───────────────────────────────────────────────────────────────────

const original = b.source({
  kind: 'original',
  title: 'Stammbaum der Familie Haferkamp (Demo)',
  created: 'um 1955, Nachträge bis 1968',
  note: 'Handgezeichnete Nachfahrentafel in 13 Generationen.',
});
const kirchenbuch = b.source({ kind: 'church-record', title: 'Kirchenbuch Eschenbrück, Taufen 1720–1800 (Demo)' });
const ofb = b.source({ kind: 'website', title: 'Ortsfamilienbuch Tannwiesen (Demo)', url: 'https://example.org/ofb-tannwiesen' });
const graeber = b.source({ kind: 'website', title: 'Gräbersuche Gefallene 1914–1918 (Demo)', url: 'https://example.org/graeber' });
const familie = b.source({
  kind: 'family-knowledge',
  title: 'Familienwissen',
  enteredBy: 'Demo-Proband',
  enteredAt: '2026-11-24',
});
b.defaultSourceId = original;

// ── Orte ──────────────────────────────────────────────────────────────────────

const esch = b.place({ id: 'ort-eschenbrueck', historicalName: 'Eschenbrück', modernName: 'Eschenbrück (Gemeinde Talheim)', country: 'Deutschland', parish: 'Ev. Pfarrei Eschenbrück', coordinates: { lat: 51.21, lng: 12.31 } });
const raben = b.place({ id: 'ort-rabenmoor', historicalName: 'Rabenmoor', modernName: 'Rabenmoor (Gemeinde Talheim)', country: 'Deutschland', parish: 'Ev. Pfarrei Eschenbrück', coordinates: { lat: 51.18, lng: 12.36 } });
const tann = b.place({ id: 'ort-tannwiesen', historicalName: 'Tannwiesen', modernName: 'Tannwiesen', country: 'Deutschland', parish: 'Ev. Pfarrei Tannwiesen', coordinates: { lat: 51.25, lng: 12.22 } });
const hollern = b.place({ id: 'ort-klein-hollern', historicalName: 'Klein-Hollern', modernName: 'Hollern', country: 'Deutschland', parish: 'Ev. Pfarrei Tannwiesen', coordinates: { lat: 51.27, lng: 12.18 } });
const hannover = b.place({ id: 'ort-hannover', historicalName: 'Hannover', modernName: 'Hannover', country: 'Deutschland', coordinates: { lat: 52.37, lng: 9.73 } });
const breslau = b.place({ id: 'ort-breslau', historicalName: 'Breslau', modernName: 'Wrocław', country: 'Polen', coordinates: { lat: 51.11, lng: 17.03 } });
const hamburg = b.place({ id: 'ort-hamburg', historicalName: 'Hamburg', modernName: 'Hamburg', country: 'Deutschland', coordinates: { lat: 53.55, lng: 9.99 } });
const bremen = b.place({ id: 'ort-bremen', historicalName: 'Bremen', modernName: 'Bremen', country: 'Deutschland', coordinates: { lat: 53.08, lng: 8.8 } });
const verdun = b.place({ id: 'ort-verdun', historicalName: 'Verdun', modernName: 'Verdun', country: 'Frankreich', coordinates: { lat: 49.16, lng: 5.38 } });

// ── Hilfen für Wortlaut wie im Original ──────────────────────────────────────

function text(date: FuzzyDate): string {
  switch (date.kind) {
    case 'exact': return formatPartialDate(date.date);
    case 'about': return `ca ${formatPartialDate(date.date)}`;
    case 'before': return `? ${formatPartialDate(date.date)}`;
    case 'after': return `nach ${formatPartialDate(date.date)}`;
    case 'between': return `${formatPartialDate(date.from)}/${formatPartialDate(date.to)}`;
  }
}
const born = (date: FuzzyDate, place?: string, extra: EventOptions = {}): EventOptions => ({ date, place, verbatim: `* ${text(date)}`, confidence: 'probable', ...extra });
const died = (date: FuzzyDate, place?: string, extra: EventOptions = {}): EventOptions => ({ date, place, verbatim: `† ${text(date)}`, confidence: 'probable', ...extra });
const wed = (date: FuzzyDate, place?: string, extra: EventOptions = {}): EventOptions => ({ date, place, verbatim: `⚭ ${text(date)}`, confidence: 'probable', ...extra });
const known = (extra: EventOptions): EventOptions => ({ source: familie, confidence: 'probable', ...extra });

// ── Zufällige, aber reproduzierbare Geschwister ──────────────────────────────

let seed = 1955;
function random(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;

const MALE = ['Johann', 'Hans', 'Heinrich', 'Friedrich', 'Christian', 'Georg', 'Wilhelm', 'Ernst', 'Carl', 'Otto', 'Hermann', 'Gustav', 'Martin', 'Peter', 'Jacob', 'Andreas', 'Konrad', 'Michael'];
const FEMALE = ['Anna', 'Maria', 'Catharina', 'Elisabeth', 'Margaretha', 'Dorothea', 'Sophie', 'Christine', 'Luise', 'Wilhelmine', 'Johanna', 'Auguste', 'Emma', 'Frieda', 'Martha', 'Gertrud', 'Hedwig'];
const SPOUSE_SURNAMES = ['Behrens', 'Kuhlmann', 'Strube', 'Hesse', 'Vogt', 'Ahrens', 'Bode', 'Wendt', 'Wolters', 'Lüders'];

/** Fügt einer Partnerschaft 1–3 erfundene Geschwister hinzu (manche früh gestorben, manche verheiratet). */
function addSiblings(partnershipId: string, surname: string, centerYear: number, place: string, count = 1 + Math.floor(random() * 3)) {
  for (let i = 0; i < count; i++) {
    const sex = random() < 0.5 ? 'm' : 'f';
    const year = centerYear + Math.round((random() - 0.5) * 12);
    const birth = exact(year, 1 + Math.floor(random() * 12), 1 + Math.floor(random() * 28));
    const diedYoung = year < 1900 && random() < 0.3;
    const deathYear = diedYoung ? year + Math.floor(random() * 3) : year + 45 + Math.floor(random() * 30);
    const showDeath = deathYear < 1955;
    const id = b.person(sex, pick(sex === 'm' ? MALE : FEMALE), surname, {
      birth: born(birth, place),
      ...(showDeath ? { death: died(exact(deathYear, 1 + Math.floor(random() * 12), 1 + Math.floor(random() * 28)), place) } : {}),
    });
    b.child(partnershipId, id);
    if (!diedYoung && random() < 0.4 && year < 1930) {
      const spouse = b.person(sex === 'm' ? 'f' : 'm', pick(sex === 'm' ? FEMALE : MALE), pick(SPOUSE_SURNAMES));
      b.partnership(sex === 'm' ? id : spouse, sex === 'm' ? spouse : id, { marriage: wed(exact(year + 24 + Math.floor(random() * 5)), place) });
    }
  }
}

// ── Generation I bis III ──────────────────────────────────────────────────────

const jost = b.person('m', 'Jost', 'Haferkamp', {
  birth: born(about(1585), esch),
  death: died(before(1640), undefined, { verbatim: '† ? 1640 wird wohl schon tot sein', confidence: 'assumed' }),
});
const josts = b.partnership(jost, null, { kind: 'unknown' });

const hans = b.person('m', 'Hans', 'Haferkamp', {
  birth: born(exact(1612), esch),
  death: died(exact(1671, 4, 12), esch),
  occupation: 'Schulze zu Eschenbrück',
});
b.child(josts, hans);
addSiblings(josts, 'Haferkamp', 1614, esch, 2);

const margaretha = b.person('f', 'Margaretha', 'Voss', {
  birth: born(about(1615), tann),
  death: died(exact(1650, 7, 16), esch, { verbatim: '† 16.7.1650 an Pest', cause: 'Pest' }),
});
const ehe1 = b.partnership(hans, margaretha, { marriage: wed(exact(1636, 2, 3), esch, { verbatim: 'I. EHE ⚭ 3.2.1636 in Eschenbrück' }) });
const anna = b.person('f', 'Anna', 'Haferkamp', { birth: born(exact(1640, 6, 14), esch), death: died(exact(1640, 6, 20), esch) });
const maria = b.person('f', 'Maria', 'Haferkamp', { birth: born(exact(1640, 6, 14), esch), note: 'Zwillinge' });
const matthias = b.person('m', 'Matthias', 'Haferkamp', { birth: born(exact(1643, 9, 2), esch), death: died(exact(1702), esch), occupation: 'Schulze' });
b.children(ehe1, [anna, maria, matthias]);

const claus = b.person('m', 'Claus', 'Ebeling', { mentioned: true, occupation: 'Schmied', verbatim: 'Wwe. des Schmieds Claus Ebeling' });
const dorothea = b.person('f', 'Dorothea', 'Ebeling', { verbatim: 'Dorothea, Wwe. des Schmieds Claus Ebeling aus Rabenmoor', residence: { place: raben, value: 'Rabenmoor' } });
b.partnership(claus, dorothea, { marriage: { date: before(1651), confidence: 'assumed', verbatim: 'Wwe. des Schmieds Claus Ebeling' } });
const ehe2 = b.partnership(hans, dorothea, { marriage: wed(exact(1651, 10, 23), raben, { verbatim: 'II. EHE ⚭ 23.10.1651 in Rabenmoor' }) });
const christoph = b.person('m', 'Christoph', 'Haferkamp', { birth: born(exact(1653, 3, 1), raben), death: died(exact(1718, 1, 9), raben), occupation: 'Müller zu Rabenmoor' });
b.child(ehe2, christoph);
addSiblings(ehe2, 'Haferkamp', 1656, raben, 1);

// ── Linie „Müller zu Rabenmoor" (Hauptlinie zum Probanden) ───────────────────

type Step = { given: string; birth: FuzzyDate; death?: FuzzyDate; place: string; occupation?: string; spouse: [string, string, FuzzyDate?]; marriage: FuzzyDate; marriagePlace?: string };

/** Baut eine Kette Vater → Sohn; liefert die Person der letzten Stufe und ihre Partnerschaften. */
function chain(start: string, steps: Step[]): { last: string; partnerships: string[]; persons: string[] } {
  let parent = start;
  const partnerships: string[] = [];
  const persons: string[] = [];
  for (const step of steps) {
    const [spouseGiven, spouseSurname, spouseBirth] = step.spouse;
    const spouse = b.person('f', spouseGiven, 'Haferkamp', {
      birthSurname: spouseSurname,
      ...(spouseBirth ? { birth: born(spouseBirth) } : {}),
    });
    const pa = b.partnership(parent, spouse, { marriage: wed(step.marriage, step.marriagePlace ?? step.place) });
    partnerships.push(pa);
    const child = b.person('m', step.given, 'Haferkamp', {
      birth: born(step.birth, step.place),
      ...(step.death ? { death: died(step.death, step.place) } : {}),
      ...(step.occupation ? { occupation: step.occupation } : {}),
    });
    b.child(pa, child);
    addSiblings(pa, 'Haferkamp', step.birth.kind === 'between' ? step.birth.from.year : step.birth.date.year, step.place);
    persons.push(child);
    parent = child;
  }
  return { last: parent, partnerships, persons };
}

const muellerLinie = chain(christoph, [
  { given: 'Johann Christoph', birth: exact(1684, 5, 11), death: exact(1749, 2, 2), place: raben, occupation: 'Müller', spouse: ['Elisabeth', 'Brandes', about(1660)], marriage: exact(1680, 11, 3) },
  { given: 'Georg Heinrich', birth: exact(1712, 8, 30), death: exact(1777, 12, 1), place: raben, occupation: 'Müllermeister', spouse: ['Anna Sophie', 'Meyer'], marriage: exact(1709, 4, 21) },
]);
const georgHeinrich = muellerLinie.last;

// Generation VI: widersprüchliche Angaben zur Geburt und eine unsichere Lesung bei der Heirat.
const vi_mutter = b.person('f', 'Catharina', 'Haferkamp', { birthSurname: 'Wolters' });
const vi_eltern = b.partnership(georgHeinrich, vi_mutter, { marriage: wed(exact(1744, 6, 2), raben) });
const johannFriedrich = b.person('m', 'Johann Friedrich', 'Haferkamp', { birth: born(exact(1748), raben), occupation: 'Müller, später Ackermann in Tannwiesen' });
b.event(johannFriedrich, 'birth', { source: kirchenbuch, location: 'Taufen 1747, Nr. 12', date: exact(1747, 3, 1), confidence: 'proven', preferred: true, verbatim: 'geb. 1. Martii 1747' });
b.event(johannFriedrich, 'baptism', { source: kirchenbuch, location: 'Taufen 1747, Nr. 12', date: exact(1747, 3, 3), place: esch, confidence: 'proven', verbatim: 'get. 3. Martii' });
b.event(johannFriedrich, 'death', died(exact(1809, 11, 17), tann));
b.child(vi_eltern, johannFriedrich);
addSiblings(vi_eltern, 'Haferkamp', 1750, raben, 2);

const vii_mutter = b.person('f', 'Johanna', 'Haferkamp', { birthSurname: 'Strube', birth: born(about(1752), hollern) });
const vii_eltern = b.partnership(johannFriedrich, vii_mutter, {
  marriage: wed(exact(1772, 6, 23), tann, { verbatim: '⚭ 23.6.177?', alternatives: ['23.6.1772', '23.6.1777'], needsReview: true, confidence: 'assumed' }),
});
const heinrichChristian = b.person('m', 'Heinrich Christian', 'Haferkamp', { birth: born(exact(1775, 1, 8), tann), death: died(exact(1838, 3, 3), tann), occupation: 'Ackermann' });
b.child(vii_eltern, heinrichChristian);
addSiblings(vii_eltern, 'Haferkamp', 1778, tann);

const viii = chain(heinrichChristian, [
  { given: 'Carl August', birth: exact(1803, 7, 19), death: exact(1871, 5, 5), place: tann, occupation: 'Ackermann', spouse: ['Dorothea', 'Hesse', exact(1781)], marriage: exact(1800, 10, 12) },
]);
const carlAugust = viii.last;

// Uneheliches Kind einer Schwester von Carl August (Vater unbekannt).
const schwester = b.person('f', 'Christine', 'Haferkamp', { birth: born(exact(1806, 2, 2), tann), death: died(exact(1859), tann) });
b.child(viii.partnerships[0]!, schwester);
const unehelich = b.person('m', 'Friedrich', 'Haferkamp', { birth: born(exact(1829, 9, 9), tann), note: 'unehelich' });
b.child(b.partnership(schwester, null, { kind: 'union' }), unehelich);

// ── Linie „Schulzen zu Eschenbrück" (für den Ahnenschwund) ──────────────────

const schulzenLinie = chain(matthias, [
  { given: 'Hans Jürgen', birth: exact(1670, 2, 14), death: exact(1731), place: esch, occupation: 'Schulze', spouse: ['Catharina', 'Lüders'], marriage: exact(1667, 5, 1) },
  { given: 'Jürgen', birth: exact(1700, 4, 4), death: exact(1764), place: esch, spouse: ['Ilse', 'Ahrens'], marriage: exact(1697, 6, 6) },
  { given: 'Andreas', birth: exact(1735, 12, 24), death: exact(1799), place: esch, spouse: ['Margaretha', 'Bode'], marriage: exact(1732, 9, 9) },
  { given: 'Friedrich', birth: exact(1768, 3, 3), death: exact(1830), place: hollern, spouse: ['Luise', 'Wendt'], marriage: exact(1765, 2, 2), marriagePlace: esch },
  { given: 'Ludwig', birth: exact(1800, 8, 8), death: exact(1866), place: hollern, spouse: ['Wilhelmine', 'Vogt'], marriage: exact(1797, 4, 4) },
]);
const ludwig = schulzenLinie.last;
const sophieMutter = b.person('f', 'Auguste', 'Haferkamp', { birthSurname: 'Kuhlmann' });
const sophieEltern = b.partnership(ludwig, sophieMutter, { marriage: wed(exact(1831, 5, 15), hollern) });
const sophie = b.person('f', 'Sophie', 'Haferkamp', { birth: born(exact(1835, 11, 30), hollern), death: died(exact(1901, 1, 2), hannover) });
b.child(sophieEltern, sophie);
addSiblings(sophieEltern, 'Haferkamp', 1838, hollern, 2);

// ── Generation IX bis XIII ───────────────────────────────────────────────────

const ixMutter = b.person('f', 'Martha', 'Haferkamp', { birthSurname: 'Behrens' });
const ixEltern = b.partnership(carlAugust, ixMutter, { marriage: wed(exact(1829, 11, 1), tann) });
const wilhelm = b.person('m', 'Wilhelm', 'Haferkamp', { birth: born(exact(1832, 4, 2), tann), death: died(exact(1899, 8, 20), hannover), occupation: 'Bäckermeister in Hannover' });
b.child(ixEltern, wilhelm);
addSiblings(ixEltern, 'Haferkamp', 1834, tann, 2);

// Ahnenschwund: Wilhelm (Müller-Linie) heiratet Sophie (Schulzen-Linie).
const collapse = b.partnership(wilhelm, sophie, { marriage: wed(exact(1857, 5, 9), hannover, { verbatim: '⚭ 9.5.1857 Hannover (beide Haferkamp!)' }) });
const augustWilhelm = b.person('m', 'August Wilhelm', 'Haferkamp', { birth: born(exact(1860, 2, 16), hannover), death: died(exact(1926, 8, 20), hannover), occupation: 'Bäckermeister' });
const emil = b.person('m', 'Emil', 'Haferkamp', { birth: born(exact(1866, 1, 1), hannover), note: 'Adoptiert' });
b.child(collapse, augustWilhelm);
b.child(collapse, emil, 'adopted');
addSiblings(collapse, 'Haferkamp', 1862, hannover, 2);

const xi = chain(augustWilhelm, [
  { given: 'Karl Wilhelm', birth: exact(1889, 9, 25), place: hannover, spouse: ['Frieda', 'Kühn', exact(1865, 4, 4)], marriage: exact(1887, 6, 6) },
]);
const karl = xi.last;
b.event(karl, 'death', died(exact(1916, 7, 3), verdun, { verbatim: '† 3.7.1916 gefallen bei Verdun', cause: 'gefallen' }));
b.event(karl, 'military', { source: graeber, value: 'Infanterie-Regiment (Demo)', confidence: 'probable', status: 'accepted' });

const xiiMutter = b.person('f', 'Martha', 'Haferkamp', { birthSurname: 'Ritter', birth: born(exact(1892, 3, 30), hannover), death: died(exact(1970, 10, 10), hamburg) });
const xiiEltern = b.partnership(karl, xiiMutter, { marriage: wed(exact(1913, 4, 12), hannover) });
const walter = b.person('m', 'Walter', 'Haferkamp', { birth: born(exact(1914, 8, 1), hannover), death: died(exact(1987, 2, 14), hamburg), occupation: 'Drechslermeister in Hamburg' });
b.child(xiiEltern, walter);

const ilse = b.person('f', 'Ilse', 'Haferkamp', { birthSurname: 'Brandt', birth: born(exact(1916, 9, 16), breslau), death: died(exact(1999, 5, 1), hamburg) });
const xiiiEltern = b.partnership(walter, ilse, { marriage: wed(exact(1937, 12, 23), hamburg) });
const gerd = b.person('m', 'Gerd', 'Haferkamp', { birth: born(exact(1940, 5, 9), hamburg) });
b.event(gerd, 'death', known({ date: exact(2022, 6, 21), place: hamburg }));
const brigitte = b.person('f', 'Brigitte', 'Haferkamp', { birth: born(exact(1938, 3, 10), hamburg) });
b.children(xiiiEltern, [brigitte, gerd]);

// ── Ab Generation XIV: Familienwissen (lebende und geschützte Personen) ──────

b.defaultSourceId = familie;
const ursula = b.person('f', 'Ursula', 'Haferkamp', { birthSurname: 'Lange', birth: known({ date: exact(1942, 1, 20) }) });
const xivEltern = b.partnership(gerd, ursula, { marriage: known({ date: exact(1964, 8, 1), place: hamburg }) });
const thomas = b.person('m', 'Thomas', 'Haferkamp', { birth: known({ date: exact(1966, 4, 3), place: hamburg }) });
const onkel = b.person('m', 'Michael', 'Haferkamp', { birth: known({ date: exact(1969, 9, 9), place: hamburg }) });
b.children(xivEltern, [thomas, onkel]);

// Mutterseite (kein eigener Stamm).
const hinrich = b.person('m', 'Hinrich', 'Lorenzen', { birth: known({ date: exact(1910, 2, 2), place: bremen }), death: known({ date: exact(1980, 3, 3), place: bremen }) });
const annaJ = b.person('f', 'Anna', 'Lorenzen', { birthSurname: 'Jensen', birth: known({ date: exact(1912, 7, 7) }), death: known({ date: exact(1999, 9, 9) }) });
const uwe = b.person('m', 'Uwe', 'Lorenzen', { birth: known({ date: exact(1941, 4, 4), place: bremen }) });
b.child(b.partnership(hinrich, annaJ, { marriage: known({ date: exact(1938) }) }), uwe);
const helga = b.person('f', 'Helga', 'Lorenzen', { birthSurname: 'Petersen', birth: known({ date: exact(1944, 12, 1) }) });
const kerstin = b.person('f', 'Kerstin', 'Haferkamp', { birthSurname: 'Lorenzen', birth: known({ date: exact(1968, 6, 30), place: bremen }) });
b.name(kerstin, 'current', 'Kerstin', 'Albers');
b.child(b.partnership(uwe, helga, { marriage: known({ date: exact(1966) }) }), kerstin);

// Erste Ehe von Thomas: geschieden. Zweite Ehe: mit Stieftochter.
const xvEltern = b.partnership(thomas, kerstin, { marriage: known({ date: exact(1993, 5, 22), place: hamburg }) });
b.partnershipEvent(xvEltern, 'divorce', known({ date: exact(2009) }));
const proband = b.person('m', 'Jonas', 'Haferkamp', { birth: known({ date: exact(1995, 10, 5), place: hamburg }) });
const lukas = b.person('m', 'Lukas', 'Haferkamp', { birth: known({ date: exact(1997, 1, 5), place: hamburg }) });
const mia = b.person('f', 'Mia', 'Haferkamp', { birth: known({ date: exact(1999, 2, 5), place: hamburg }) });
b.children(xvEltern, [proband, lukas, mia]);

const petra = b.person('f', 'Petra', 'Haferkamp', { birthSurname: 'Schmid', birth: known({ date: exact(1972) }) });
const zweiteEhe = b.partnership(thomas, petra, { marriage: known({ date: exact(2026, 4, 18), place: hamburg }) });
const lea = b.person('f', 'Lea', 'Schmid', { birth: known({ date: exact(2004) }) });
b.child(zweiteEhe, lea, 'step');

const lena = b.person('f', 'Lena', 'Haferkamp', { birthSurname: 'Novak', birth: known({ date: exact(1996, 3, 15) }) });
const xviEltern = b.partnership(proband, lena, { marriage: known({ date: exact(2019, 7, 6) }) });
const paul = b.person('m', 'Paul', 'Haferkamp', { birth: known({ date: exact(2021, 6, 10) }) });
b.child(xviEltern, paul);
b.proband(proband);

// ── Stamm, Linien ─────────────────────────────────────────────────────────────

const stamm = b.lineage('Stamm Haferkamp', jost, original);
b.line(stamm, 'Schulzen zu Eschenbrück', matthias, 'Schulzen a. Eschenbrück');
b.line(stamm, 'Müller zu Rabenmoor', christoph, 'Müller a. Rabenmoor');

// ── Recherche ─────────────────────────────────────────────────────────────────

const frageVater = b.researchQuestion({
  question: 'Wer war der Vater des Stammvaters Jost Haferkamp?',
  personIds: [jost],
  origin: 'manual',
  status: 'answered',
  createdAt: '2026-11-20',
  attempts: [
    { id: 'sv-001', date: '2026-11-21', portal: 'Kirchenbuch Eschenbrück (Demo)', query: 'Haferkamp, Taufen vor 1600', result: 'nothing', note: 'Kirchenbuch beginnt erst 1601.' },
    { id: 'sv-002', date: '2026-11-21', portal: 'Ortsfamilienbuch Tannwiesen (Demo)', query: 'Haferkamp OR Haverkamp, 1550–1600', url: 'https://example.org/ofb-tannwiesen?q=haferkamp', result: 'found', note: 'Eintrag „Veit Haverkamp, Hüfner in Eschenbrück, † 1619"; Sohn Jost genannt.' },
  ],
});
b.researchQuestion({
  question: 'Woher stammte Elisabeth Brandes (⚭ 1680)?',
  personIds: [],
  origin: 'gap',
  status: 'queued',
  createdAt: '2026-11-22',
  attempts: [],
});
b.researchQuestion({
  question: 'Wo ist Karl Wilhelm Haferkamp († 1916) begraben?',
  personIds: [karl],
  origin: 'manual',
  status: 'unsuccessful',
  createdAt: '2026-11-22',
  attempts: [
    { id: 'sv-003', date: '2026-11-23', portal: 'Gräbersuche (Demo)', query: 'Haferkamp Karl 1889', result: 'nothing' },
  ],
});

// Vorschlag aus der Recherche: Vater des Stammvaters (noch nicht bestätigt).
const veit = b.person('m', 'Veit', 'Haverkamp', {
  source: ofb,
  status: 'suggested',
  confidence: 'assumed',
  question: frageVater,
  death: { source: ofb, date: exact(1619), confidence: 'assumed', status: 'suggested', question: frageVater, verbatim: '† 1619' },
  occupation: { source: ofb, value: 'Hüfner in Eschenbrück', confidence: 'assumed', status: 'suggested', question: frageVater },
});
b.name(veit, 'variant', 'Veit', 'Haferkamp', { source: ofb, status: 'suggested', confidence: 'assumed', question: frageVater });
b.child(b.partnership(veit, null, { kind: 'unknown' }), jost, 'biological', { source: ofb, status: 'suggested', confidence: 'assumed', question: frageVater });

// ── Ausgabe ───────────────────────────────────────────────────────────────────

const dataset: Dataset = b.build();
const broken = findBrokenReferences(dataset);
if (broken.length > 0) throw new Error(`Demo-Daten fehlerhaft:\n${broken.join('\n')}`);

const target = fileURLToPath(new URL('./demo-stammbaum.json', import.meta.url));
writeFileSync(target, `${JSON.stringify(dataset, null, 2)}\n`);
console.log(`Demo-Stammbaum geschrieben: ${dataset.persons.length} Personen, ${dataset.partnerships.length} Partnerschaften → ${target}`);
