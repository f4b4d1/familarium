// Baut aus dem geprüften Arbeitsstand der Übertragung den Datenbestand im App-Schema (ADR 0002, 0004).
// Enthält bewusst keine Namen: Familienname und Familienwissen kommen aus private/daten/familienwissen.json.
//
// Aufruf: node scripts/original/baue_datenbestand.ts
// Liest:  private/arbeit/beziehungen.json  (Personen-Kästchen, Ehen, Info-Kästchen – vom Nutzer geprüft)
//         private/arbeit/deutung/ergebnis-*.json  (Deutung der Kästchen: Vornamen, Nachname, Geschlecht, Herkunft …)
//         private/arbeit/orte.json  (Ortsverzeichnis: Schreibweise im Original → heutiger Ort)
//         private/arbeit/zwischenstand.json  (nur die Lesehinweise der ersten Übertragung)
//         private/arbeit/pruef-entscheidungen.json  (Entscheidungen des Nutzers aus der Prüf-Ansicht, falls vorhanden)
//         private/daten/familienwissen.json
// Schreibt: private/daten/stammbaum.json, private/arbeit/pruefliste.json

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { findBrokenReferences } from '../../src/domain/dataset.ts';
import {
  Dataset,
  type Confidence,
  type EventClaim,
  type NameClaim,
  type Parentage,
  type Partnership,
  type Person,
  type PersonEvent,
  type PersonEventType,
  type Place,
} from '../../src/domain/schema.ts';
import { guessSex, parseBox, parseEvent, type ParsedEvent } from '../../src/domain/wortlaut.ts';

const root = new URL('../../', import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

// ── Eingaben ─────────────────────────────────────────────────────────────────

interface Box { x: number; y: number; w: number; h: number }
interface BzPerson extends Box { id: string; alt: string | null; generation: string | null; zeilen: string[]; lesung_unsicher?: boolean; hinweise?: string[]; gleich_wie?: string; geschlecht_unbekannt?: boolean }
interface BzMarriage { id: string; partner: string[]; partner_text: string[]; kinder: string[] }
interface BzInfo extends Box { id: string; art: 'heirat' | 'beruf' | 'ort' | 'sonstiges'; wortlaut: string; gehoert_zu: string[] }
interface Bz { breite: number; hoehe: number; personen: BzPerson[]; ehen: BzMarriage[]; infos: BzInfo[]; zwillinge: string[][] }
interface Deutung { vornamen: string | null; rufname: string | null; nachname: string | null; nachname_quelle: string | null; geschlecht: 'm' | 'w' | 'u'; herkunft: string | null; ehepartner_erwaehnt: string | null; bemerkungen: string[]; unsicher: boolean; hinweis: string }
interface Ort { name: string; heute: string; schreibweisen: string[]; sicherheit: string }

const bz: Bz = read('private/arbeit/beziehungen.json');
const orte: { orte: Ort[]; offen: { schreibweise: string; stellen: string[]; bemerkung: string }[] } = read('private/arbeit/orte.json');
const fw = read('private/daten/familienwissen.json');
const deutung: Record<string, Deutung> = {};
const deutungDir = new URL('private/arbeit/deutung/', root);
for (const file of readdirSync(deutungDir).filter((f) => /^ergebnis-\d+\.json$/.test(f))) Object.assign(deutung, read(`private/arbeit/deutung/${file}`));
// Entscheidungen aus der Prüf-Ansicht. Schlüssel: person:P104, daten:P208, ort:<Schreibweise>, ehe:pa-E001.
interface Entscheidung { status: 'erledigt'; am?: string; zeilen?: string[]; deutung?: Partial<Deutung>; heutiger_ort?: string; bemerkung?: string; bevorzugt?: string }
const entscheidungen: Record<string, Entscheidung> = existsSync(new URL('private/arbeit/pruef-entscheidungen.json', root)) ? read('private/arbeit/pruef-entscheidungen.json') : {};
const geprueft = (key: string) => entscheidungen[key]?.status === 'erledigt';
for (const bp of bz.personen) {
  const e = entscheidungen[`person:${bp.id}`];
  if (e?.zeilen?.length) bp.zeilen = e.zeilen;
  if (e?.deutung && deutung[bp.id]) deutung[bp.id] = { ...deutung[bp.id]!, ...e.deutung, unsicher: false };
}
for (const [key, e] of Object.entries(entscheidungen)) {
  if (key.startsWith('ort:') && e.heutiger_ort) {
    orte.orte.push({ name: e.heutiger_ort, heute: e.bemerkung || 'vom Nutzer bestimmt', schreibweisen: key.slice(4).split(' / '), sicherheit: 'Nutzer' });
  }
}
const firstReading: Record<string, string[]> = {};
if (existsSync(new URL('private/arbeit/zwischenstand.json', root))) {
  for (const p of read('private/arbeit/zwischenstand.json').personen) firstReading[p.id] = (p.gruende ?? []).filter((g: string) => g.startsWith('Lesung prüfen'));
}

const ORIGINAL = 'src-original';
const FAMILIE = 'src-familienwissen';
const MEDIA = 'm-original';
let claimNo = 0;
const cid = () => `c-${String(++claimNo).padStart(5, '0')}`;
const canonical = (bzId: string) => bz.personen.find((p) => p.id === bzId)?.gleich_wie ?? bzId;
const pid = (bzId: string) => `o-${canonical(bzId)}`;
const bzPerson = new Map(bz.personen.map((p) => [p.id, p]));
const infosOf = (id: string) => bz.infos.filter((i) => i.gehoert_zu.includes(id));
const norm = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');

/** Prüfpunkt für die Prüf-Ansicht: gleicher Schlüssel = eine Karte; bilder = Kästchen, deren Ausschnitt gezeigt wird. */
type Pruefpunkt = { art: string; schluessel: string; person?: string; ehe?: string; text: string; bilder?: string[]; erledigt?: boolean };
const pruefliste: Pruefpunkt[] = [];

// ── Orte ─────────────────────────────────────────────────────────────────────

const places = new Map<string, Place>();
const slug = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const knownPlaces = orte.orte.flatMap((o) => [o.name, ...o.schreibweisen].map((s) => ({ key: norm(s), ort: o })));

/** Ort zu einem Text aus dem Original: bekannte Orte über das Ortsverzeichnis, sonst ein Ort je Schreibweise. */
function placeId(text?: string): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(/^(in|zu|aus|a\.|o\.)\s+/i, '').replace(/[.,;:]+$/, '').trim();
  if (!clean || !/[A-Za-zÄÖÜäöü]{3}/.test(clean) || /[←→]/.test(clean)) return undefined;
  const hit = knownPlaces.find((k) => k.key === norm(clean)) ?? knownPlaces.find((k) => k.key.length >= 5 && norm(clean).includes(k.key));
  const id = `ort-${slug(hit ? hit.ort.name : clean)}`;
  if (!places.has(id)) {
    places.set(id, hit
      ? { id, historicalName: hit.ort.schreibweisen[0] ?? hit.ort.name, modernName: `${hit.ort.name} (${hit.ort.heute})` }
      : { id, historicalName: clean });
  }
  return id;
}

/** Sucht einen bekannten Ort irgendwo in einem freien Text (z. B. „Bäckermeister Musterstadt"). */
function placeInText(text: string): string | undefined {
  const n = norm(text);
  const hit = knownPlaces.filter((k) => k.key.length >= 5 && n.includes(k.key)).sort((a, b) => b.key.length - a.key.length)[0];
  return hit ? placeId(hit.ort.name) : undefined;
}

// ── Belege ───────────────────────────────────────────────────────────────────

function region(box?: Box | null) {
  if (!box) return undefined;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { mediaId: MEDIA, x: clamp(box.x / bz.breite), y: clamp(box.y / bz.hoehe), width: clamp(box.w / bz.breite), height: clamp(box.h / bz.hoehe) };
}

function originalClaim(box: Box | null | undefined, verbatim: string, confidence: Confidence, needsReview: boolean, note?: string) {
  return {
    id: cid(),
    citation: { sourceId: ORIGINAL, ...(box ? { region: region(box) } : { location: 'nur erwähnt' }) },
    confidence,
    status: 'accepted' as const,
    verbatim,
    ...(needsReview ? { needsReview: true } : {}),
    ...(note ? { note } : {}),
  };
}

function eventClaim(box: Box | null | undefined, e: ParsedEvent, needsReview: boolean, note?: string): EventClaim {
  return {
    ...originalClaim(box, e.verbatim, e.confidence, needsReview, note),
    ...(e.date ? { date: e.date } : {}),
    ...(e.placeText ? { placeId: placeId(e.placeText) } : {}),
    ...(e.cause ? { cause: e.cause } : {}),
    ...(e.rest ? { value: e.rest } : {}),
  };
}

/** Ein vermeintlicher Ort, der in Wahrheit ein Name oder eine Bemerkung ist, wird zum Wert (z. B. „† Adoptiert"). */
function dropFalsePlace(e: ParsedEvent, notPlaces: (string | null | undefined)[]): ParsedEvent {
  if (!e.placeText) return e;
  const n = norm(e.placeText);
  const clash = notPlaces.filter(Boolean).map((x) => norm(x!)).some((x) => x.length > 2 && (x.includes(n) || n.includes(x)));
  if (clash) {
    e.rest = e.placeText;
    delete e.placeText;
  }
  return e;
}

/** Ort in Heiratsvermerken, die der Deuter nicht als Ort erkennt (z. B. „1. EHE 5.2.1611 in Musterdorf ⚭"). */
function withPlace(claim: EventClaim, text: string): EventClaim {
  if (claim.placeId) return claim;
  const found = placeInText(text) ?? placeId(/\b(?:in|zu)\s+([A-ZÄÖÜ][\wäöüß-]+(?:\/[A-ZÄÖÜ][\wäöüß-]+)?)/.exec(text)?.[1]);
  return found ? { ...claim, placeId: found } : claim;
}

/** Hängt eine Angabe an das Ereignis gleichen Typs an (mehrere Angaben zur selben Sache, ADR 0002). */
function addEvent(person: Person, type: PersonEventType, claim: EventClaim, merge = true) {
  if (type === 'note' && person.events.some((e) => e.type === 'note' && e.claims.some((c) => norm(c.value ?? '') === norm(claim.value ?? '')))) return;
  const existing = merge && type !== 'note' && type !== 'occupation' && type !== 'residence' ? person.events.find((e) => e.type === type) : undefined;
  if (existing) existing.claims.push(claim);
  else person.events.push({ id: `e-${claim.id}`, type, claims: [claim] });
}

// ── Personen aus dem Original ────────────────────────────────────────────────

const persons = new Map<string, Person>();
const pendingMarriageClaims: { personBz: string; claim: EventClaim }[] = [];
const sexOf = (g?: string) => (g === 'w' ? 'f' : g === 'm' ? 'm' : 'u') as 'm' | 'f' | 'u';

for (const bp of bz.personen) {
  const id = pid(bp.id);
  const d = deutung[canonical(bp.id)];
  const checked = geprueft(`person:${bp.id}`);
  const reasons = [...(bp.alt ? firstReading[bp.alt] ?? [] : []), ...(bp.lesung_unsicher ? ['zwei Lesungen weichen ab'] : [])];
  const review = !checked && (reasons.length > 0 || bp.zeilen.some((z) => z.includes('[')));
  const verbatim = bp.zeilen.join(' / ');
  const second = Boolean(bp.gleich_wie);
  if (!d && !second) pruefliste.push({ art: 'Deutung fehlt', schluessel: `person:${bp.id}`, person: id, text: verbatim, bilder: [bp.id] });

  let person = persons.get(id);
  if (!person) {
    const name: NameClaim = {
      ...originalClaim(bp, verbatim, review ? 'assumed' : 'probable', review, checked ? `Lesung vom Nutzer geprüft${entscheidungen[`person:${bp.id}`]?.am ? ` (${entscheidungen[`person:${bp.id}`]!.am})` : ''}` : undefined),
      type: 'birth',
      ...(d?.vornamen ? { given: d.vornamen } : {}),
      ...(d?.nachname ? { surname: d.nachname } : {}),
      ...(d?.rufname ? { callName: d.rufname } : {}),
    };
    person = { id, sex: d ? sexOf(d.geschlecht) : guessSex(bp.zeilen[0] ?? ''), names: [name], events: [], mentioned: false, status: 'accepted' };
    persons.set(id, person);
  } else {
    // Zweite Zeichnung derselben Person: ihr Wortlaut ist eine weitere Angabe.
    person.names.push({ ...originalClaim(bp, verbatim, review ? 'assumed' : 'probable', review, 'zweite Zeichnung im Original'), type: 'variant', ...(person.names[0]!.given ? { given: person.names[0]!.given } : {}), ...(person.names[0]!.surname ? { surname: person.names[0]!.surname } : {}) });
  }

  const notPlaces = [d?.ehepartner_erwaehnt, d?.vornamen, d?.nachname, ...(d?.bemerkungen ?? [])];
  for (const e of parseBox(bp.zeilen).events) {
    dropFalsePlace(e, notPlaces); // Ehepartner, Vornamen oder Bemerkungen sind keine Orte
    const claim = eventClaim(bp, e, review, second ? 'zweite Zeichnung im Original' : undefined);
    if (e.type === 'marriage') pendingMarriageClaims.push({ personBz: bp.id, claim });
    else addEvent(person, e.type, claim);
  }
  if (d?.herkunft && !second) {
    addEvent(person, 'residence', { ...originalClaim(bp, d.herkunft, 'probable', review, 'Herkunft laut Kästchen'), value: d.herkunft, ...(placeId(d.herkunft) ? { placeId: placeId(d.herkunft) } : {}) });
  }
  for (const b of second ? [] : d?.bemerkungen ?? []) addEvent(person, 'note', { ...originalClaim(bp, b, 'probable', review, 'Bemerkung im Kästchen'), value: b });
  const lesungFraglich = reasons.length > 0 || bp.zeilen.some((z) => z.includes('['));
  // Geprüfte Personen bleiben in der Liste (sonst verschwänden korrigierte Karten und der Fortschritt stimmte nicht).
  if ((lesungFraglich && (!second || reasons.length)) || checked) pruefliste.push({ art: 'Lesung', schluessel: `person:${bp.id}`, person: id, text: reasons.length ? reasons.join('; ') : lesungFraglich ? 'unsichere Zeichen im Wortlaut' : 'geprüft', bilder: [bp.id] });
  if (d?.unsicher || (checked && entscheidungen[`person:${bp.id}`]?.deutung)) pruefliste.push({ art: 'Deutung unsicher', schluessel: `person:${bp.id}`, person: id, text: d?.hinweis || 'Deutung geprüft', bilder: [bp.id] });
}

// Info-Kästchen an Personen: Beruf → Beruf, Ort → Wohnort/Ort, Sonstiges → Notiz, Heirat → zur Ehe (falls eindeutig).
const infoNote = { beruf: 'Beruf am Kästchen/Pfeil im Original', ort: 'Ortsangabe am Kästchen/Pfeil im Original', sonstiges: 'Vermerk im Original', heirat: 'Heiratsvermerk im Original' };
for (const info of bz.infos) {
  for (const ref of info.gehoert_zu.filter((r) => r.startsWith('P'))) {
    const person = persons.get(pid(ref))!;
    const review = info.wortlaut.includes('[');
    const base = { ...originalClaim(info, info.wortlaut, 'probable', review, infoNote[info.art]), value: info.wortlaut };
    if (info.art === 'beruf') addEvent(person, 'occupation', { ...base, ...(placeInText(info.wortlaut) ? { placeId: placeInText(info.wortlaut) } : {}) });
    else if (info.art === 'ort') addEvent(person, 'residence', { ...base, ...(placeId(info.wortlaut) ?? placeInText(info.wortlaut) ? { placeId: placeId(info.wortlaut) ?? placeInText(info.wortlaut) } : {}) });
    else if (info.art === 'heirat') pendingMarriageClaims.push({ personBz: ref, claim: withPlace(eventClaim(info, parseEvent('marriage', info.wortlaut, info.wortlaut.replace(/^⚭\s*/, '')), review, infoNote.heirat), info.wortlaut) });
    else addEvent(person, 'note', base);
  }
}
for (const [a, b] of bz.zwillinge) {
  for (const [x, y] of [[a!, b!], [b!, a!]] as const) {
    const person = persons.get(pid(x))!;
    const label = `Zwilling von ${persons.get(pid(y))?.names[0]?.given || y}`;
    addEvent(person, 'note', { ...originalClaim(bzPerson.get(x), 'Zwillinge', 'probable', false, 'Bogen im Original'), value: label });
  }
}

// ── Ehen ─────────────────────────────────────────────────────────────────────

const partnerships: Partnership[] = [];
const ownMarriages = (bzId: string) => bz.ehen.filter((m) => m.partner.some((p) => canonical(p) === canonical(bzId)));
const isAdopted = (bzId: string) => /adopt/i.test(bzPerson.get(bzId)!.zeilen.join(' ')) || infosOf(bzId).some((i) => /adopt/i.test(i.wortlaut));
const SPOUSE_NAME = (text: string) => !/\d|EHE|\?|getraut/i.test(text) && /[A-ZÄÖÜa-zäöü]{3}/.test(text);

for (const m of bz.ehen) {
  const partnerIds = [...new Set(m.partner.map(pid))];
  const heirat = infosOf(m.id).filter((i) => i.art === 'heirat');
  const claims: EventClaim[] = heirat
    .filter((i) => !SPOUSE_NAME(i.wortlaut.replace(/^⚭\s*/, '')))
    .map((i) => {
      const spouseTexts = [...m.partner_text, ...m.partner.map((p) => deutung[canonical(p)]?.ehepartner_erwaehnt)];
      const parsed = dropFalsePlace(parseEvent('marriage', i.wortlaut, i.wortlaut.replace(/^⚭\s*/, '')), spouseTexts);
      return withPlace(eventClaim(i, parsed, i.wortlaut.includes('['), 'Heiratsvermerk im Original'), parsed.placeText || parsed.rest ? i.wortlaut : '');
    });
  for (const pending of pendingMarriageClaims.filter((p) => ownMarriages(p.personBz).length === 1 && ownMarriages(p.personBz)[0] === m)) claims.push(pending.claim);
  const firstDated = claims.findIndex((c) => c.date);
  if (claims.length) claims[firstDated >= 0 ? firstDated : 0]!.preferred = true;

  // Partner, der nur als Text genannt ist (ohne eigenes Kästchen) → erwähnte Person.
  if (partnerIds.length < 2) {
    const known = partnerIds[0] ? persons.get(partnerIds[0]) : undefined;
    const fromInfo = heirat.map((i) => i.wortlaut.replace(/^⚭\s*/, '')).find(SPOUSE_NAME);
    const fromBox = m.partner.length === 1 ? deutung[canonical(m.partner[0]!)]?.ehepartner_erwaehnt : null;
    const nameText = m.partner_text[0] ?? fromInfo ?? fromBox ?? null;
    if (nameText) {
      const id = `o-${m.id}-partner`;
      const tokens = nameText.replace(/[,]/g, ' ').trim().split(/\s+/);
      persons.set(id, {
        id,
        sex: known?.sex === 'm' ? 'f' : known?.sex === 'f' ? 'm' : 'u',
        names: [{ ...originalClaim(known && m.partner[0] ? bzPerson.get(m.partner[0]) : undefined, nameText, 'probable', false, 'als Ehepartner erwähnt'), type: 'birth', ...(tokens.length > 1 ? { given: tokens.slice(0, -1).join(' '), surname: tokens.at(-1) } : { surname: tokens[0] }) }],
        events: [],
        mentioned: true,
        status: 'accepted',
      });
      partnerIds.push(id);
    }
  }
  const children: Parentage[] = [...new Set(m.kinder.map(pid))].map((childId) => {
    const bzChild = m.kinder.find((k) => pid(k) === childId)!;
    return { ...originalClaim(bzPerson.get(bzChild), 'Kinderlinie im Original', 'probable', false), childId, kind: isAdopted(bzChild) ? ('adopted' as const) : ('biological' as const) };
  });
  // Vermerke an der Ehe (z. B. „kinderlos") gehören zu beiden Partnern.
  for (const info of infosOf(m.id).filter((i) => i.art !== 'heirat')) {
    for (const p of partnerIds) {
      const person = persons.get(p);
      if (person) addEvent(person, info.art === 'beruf' ? 'occupation' : 'note', { ...originalClaim(info, info.wortlaut, 'probable', false, 'Vermerk an der Ehe im Original'), value: info.wortlaut });
    }
  }
  partnerships.push({
    id: `pa-${m.id}`,
    partners: [partnerIds[0] ?? null, partnerIds[1] ?? null],
    kind: claims.length || partnerIds.length === 2 ? 'marriage' : 'unknown',
    events: claims.length ? [{ id: `e-${m.id}`, type: 'marriage', claims }] : [],
    children,
  });
}
// Heiratsvermerk ohne gezeichnete Ehe: Ehe nur aus dem Kästchentext, Partner erwähnt oder unbekannt.
const withoutMarriage = new Map<string, typeof pendingMarriageClaims>();
for (const p of pendingMarriageClaims.filter((x) => ownMarriages(x.personBz).length === 0)) {
  withoutMarriage.set(canonical(p.personBz), [...(withoutMarriage.get(canonical(p.personBz)) ?? []), p]);
}
for (const [bzId, pendings] of withoutMarriage) {
  const person = persons.get(pid(bzId))!;
  const spouseText = deutung[bzId]?.ehepartner_erwaehnt;
  let spouseId: string | null = null;
  if (spouseText) {
    spouseId = `o-${bzId}-partner`;
    const tokens = spouseText.replace(/,/g, ' ').trim().split(/\s+/);
    persons.set(spouseId, {
      id: spouseId,
      sex: person.sex === 'm' ? 'f' : person.sex === 'f' ? 'm' : 'u',
      names: [{ ...originalClaim(bzPerson.get(bzId), spouseText, 'probable', false, 'als Ehepartner im Kästchen erwähnt'), type: 'birth', ...(tokens.length > 1 ? { given: tokens.slice(0, -1).join(' '), surname: tokens.at(-1) } : { surname: tokens[0] }) }],
      events: [],
      mentioned: true,
      status: 'accepted',
    });
  }
  pendings[0]!.claim.preferred = true;
  partnerships.push({ id: `pa-${bzId}-text`, partners: [person.id, spouseId], kind: 'marriage', events: [{ id: `e-${bzId}-text`, type: 'marriage', claims: pendings.map((p) => p.claim) }], children: [] });
}
// Heiratsvermerke von Personen mit mehreren Ehen lassen sich nicht sicher zuordnen → Notiz + Prüfliste.
for (const pending of pendingMarriageClaims.filter((p) => ownMarriages(p.personBz).length > 1)) {
  const person = persons.get(pid(pending.personBz))!;
  addEvent(person, 'note', { ...pending.claim, value: pending.claim.verbatim });
  pruefliste.push({ art: 'Heirat ohne eindeutige Ehe', schluessel: `person:${pending.personBz}`, person: person.id, text: `${pending.claim.verbatim} (${ownMarriages(pending.personBz).length} Ehen)`, bilder: [pending.personBz] });
}

// ── Nachnamen ableiten (Kinder ohne Nachnamen im Kästchen: vom Vater, sonst von der Mutter) ─────────

const generationNo = (p: BzPerson) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'].indexOf(p.generation ?? '');
for (const bp of [...bz.personen].sort((a, b) => generationNo(a) - generationNo(b))) {
  const person = persons.get(pid(bp.id))!;
  const name = person.names[0]!;
  if (name.surname) continue;
  const parents = partnerships.find((pa) => pa.children.some((c) => c.childId === person.id));
  const ps = (parents?.partners ?? []).filter(Boolean).map((p) => persons.get(p!)!);
  const father = ps.find((p) => p.sex === 'm') ?? (ps.length === 1 ? ps[0] : undefined);
  const surname = father?.names[0]?.surname;
  if (surname) {
    name.surname = surname;
    name.note = [name.note, father.sex === 'm' ? 'Nachname vom Vater abgeleitet' : 'Nachname vom Elternteil abgeleitet'].filter(Boolean).join('; ');
  }
}
for (const pa of partnerships) {
  const [a, b] = pa.partners.map((p) => (p ? persons.get(p) : undefined));
  if (a && b && a.sex !== 'u' && a.sex === b.sex) pruefliste.push({ art: 'Geschlecht prüfen', schluessel: `ehe:${pa.id}`, ehe: pa.id, text: `Beide Partner ${a.sex === 'm' ? 'männlich' : 'weiblich'}: ${a.names[0]!.verbatim} + ${b.names[0]!.verbatim}` });
}
// Geschlecht, das laut Nutzer niemand kennt, ist kein Prüfpunkt.
const sexKnownUnknown = new Set(bz.personen.filter((p) => p.geschlecht_unbekannt).map((p) => pid(p.id)));
for (const p of persons.values()) if (p.sex === 'u' && !p.mentioned && !sexKnownUnknown.has(p.id)) pruefliste.push({ art: 'Geschlecht prüfen', schluessel: `person:${p.id.slice(2)}`, person: p.id, text: p.names[0]!.verbatim ?? '', bilder: [p.id.slice(2)] });

// Mehrere Zeichnungen derselben Person mit verschiedenen Daten: alle Angaben bleiben, gelten aber als unsicher.
const dateKey = (c: EventClaim) => JSON.stringify(c.date ?? null);
for (const p of persons.values()) {
  for (const e of p.events.filter((x) => x.type === 'birth' || x.type === 'death')) {
    const dated = e.claims.filter((c) => c.date);
    if (new Set(dated.map(dateKey)).size < 2) continue;
    for (const c of dated) Object.assign(c, { confidence: 'assumed', needsReview: true, note: [c.note, 'widersprüchliche Angaben in mehreren Zeichnungen'].filter(Boolean).join('; ') });
    const choice = entscheidungen[`daten:${p.id.slice(2)}`]?.bevorzugt;
    const chosen = dated.find((c) => c.verbatim === choice);
    if (chosen) {
      for (const c of e.claims) delete c.preferred;
      chosen.preferred = true;
      chosen.note = `${chosen.note}; vom Nutzer bevorzugt`;
    }
    const drawings = bz.personen.filter((x) => pid(x.id) === p.id).map((x) => x.id);
    pruefliste.push({ art: 'Widersprüchliche Daten', schluessel: `daten:${p.id.slice(2)}`, person: p.id, text: `${e.type === 'birth' ? 'Geburt' : 'Tod'}: ${dated.map((c) => c.verbatim).join(' | ')}`, bilder: drawings });
  }
}
for (const o of orte.offen) pruefliste.push({ art: 'Ort unbestimmt', schluessel: `ort:${o.schreibweise}`, text: `${o.schreibweise}: ${o.bemerkung}`, bilder: o.stellen.filter((s) => /^[PI]/.test(s)) });

// ── Familienwissen: Anschluss bis heute ──────────────────────────────────────

const fwClaim = (verbatim: string) => ({ id: cid(), citation: { sourceId: FAMILIE }, confidence: 'probable' as const, status: 'accepted' as const, verbatim });
const anchorBz = bz.personen.find((p) => !p.gleich_wie && p.zeilen.join(' ').includes(fw.anschluss.person_im_original.suche) && p.zeilen.join(' ').replace(/\s/g, '').includes(fw.anschluss.person_im_original.geburt.replace(/\s/g, '')));
if (!anchorBz) pruefliste.push({ art: 'Anschluss', schluessel: 'anschluss', text: 'Anschlussperson im Original nicht gefunden – bitte zuordnen' });
const anchor = anchorBz ? pid(anchorBz.id) : undefined;
if (anchor && fw.anschluss.tod) {
  const [y, mo, d] = fw.anschluss.tod.datum;
  addEvent(persons.get(anchor)!, 'death', { ...fwClaim(`† ${d}.${mo}.${y}`), date: { kind: 'exact', date: { year: y, month: mo, day: d } } });
}
const fwId = (key: string) => (key === 'ANSCHLUSS' ? anchor ?? null : `fw-${key}`);
for (const p of fw.personen) {
  const names: NameClaim[] = [];
  if (p.geburtsname) names.push({ ...fwClaim(p.geburtsname), type: 'birth', given: p.vorname, surname: p.geburtsname });
  names.push({ ...fwClaim(`${p.vorname} ${p.nachname ?? ''}`.trim()), type: p.geburtsname ? 'married' : 'birth', given: p.vorname, ...(p.nachname ? { surname: p.nachname } : {}) });
  if (p.heute) names.push({ ...fwClaim(p.heute), type: 'current', given: p.vorname, surname: p.heute });
  const events: PersonEvent[] = p.geburt
    ? [{ id: `e-fw-${p.id}-geburt`, type: 'birth', claims: [{ ...fwClaim(p.geburt.join('-')), date: { kind: 'exact', date: { year: p.geburt[0], month: p.geburt[1], day: p.geburt[2] } } }] }]
    : [];
  persons.set(`fw-${p.id}`, { id: `fw-${p.id}`, sex: p.sex, names, events, mentioned: false, status: 'accepted' });
}
fw.ehen.forEach((e: { partner: string[]; kinder: string[]; stiefkinder?: string[]; geschieden?: boolean; heirat?: number[] }, i: number) => {
  const events: Partnership['events'] = [];
  if (e.heirat) events.push({ id: `e-fw-ehe-${i}`, type: 'marriage', claims: [{ ...fwClaim(`⚭ ${e.heirat.join('.')}`), date: { kind: 'exact', date: { year: e.heirat[0]! } } }] });
  if (e.geschieden) events.push({ id: `e-fw-scheidung-${i}`, type: 'divorce', claims: [{ ...fwClaim('geschieden') }] });
  partnerships.push({
    id: `pa-fw-${i}`,
    partners: [fwId(e.partner[0]!), fwId(e.partner[1]!)],
    kind: 'marriage',
    events,
    children: [
      ...e.kinder.map((k) => ({ ...fwClaim('Kind'), childId: `fw-${k}`, kind: 'biological' as const })),
      ...(e.stiefkinder ?? []).map((k) => ({ ...fwClaim('Stiefkind'), childId: `fw-${k}`, kind: 'step' as const })),
    ],
  });
});
const proband = fw.personen.find((p: { proband?: boolean }) => p.proband);

// ── Zusammenbau und Prüfung ──────────────────────────────────────────────────

const progenitor = [...bz.personen].sort((a, b) => generationNo(a) - generationNo(b))[0]!;
const dataset = Dataset.parse({
  schemaVersion: 1,
  probandId: proband ? `fw-${proband.id}` : null,
  persons: [...persons.values()],
  partnerships,
  places: [...places.values()],
  sources: [
    { id: ORIGINAL, kind: 'original', title: fw.original.titel, mediaId: MEDIA, note: 'Handgezeichnete Nachfahrentafel; übertragen 2026 (zwei unabhängige Lesungen, Beziehungen vom Nutzer geprüft)' },
    { id: FAMILIE, kind: 'family-knowledge', title: 'Familienwissen', enteredBy: fw.eingetragen_von, enteredAt: fw.eingetragen_am },
  ],
  media: [
    { id: MEDIA, kind: 'image', file: fw.original.foto, title: fw.original.titel, width: fw.original.breite, height: fw.original.hoehe },
    { id: 'm-wappen', kind: 'image', file: fw.wappen.datei, title: fw.wappen.titel },
  ],
  lineages: [{ id: 'stamm-1', name: fw.stamm.name, progenitorId: pid(progenitor.id), originalSourceId: ORIGINAL }],
  lines: [],
  researchQuestions: [],
});
const broken = findBrokenReferences(dataset);
if (broken.length) throw new Error(`Kaputte Verweise:\n${broken.slice(0, 20).join('\n')}`);

const target = new URL('private/daten/stammbaum.json', root);
if (existsSync(target)) writeFileSync(new URL(`private/daten/stammbaum.vorher-${Date.now()}.json`, root), readFileSync(target));
writeFileSync(target, `${JSON.stringify(dataset, null, 1)}\n`);
for (const punkt of pruefliste) punkt.erledigt = geprueft(punkt.schluessel);
writeFileSync(new URL('private/arbeit/pruefliste.json', root), `${JSON.stringify(pruefliste, null, 1)}\n`);
const arten = [...new Set(pruefliste.map((p) => p.art))].map((a) => `${a} ${pruefliste.filter((p) => p.art === a).length}`);
console.log(`Datenbestand: ${dataset.persons.length} Personen (davon erwähnt ${dataset.persons.filter((p) => p.mentioned).length}), ${dataset.partnerships.length} Partnerschaften, ${dataset.places.length} Orte`);
console.log(`Prüfliste: ${pruefliste.length} Punkte (${arten.join(', ')})`);
