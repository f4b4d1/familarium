// Baut aus dem Zwischenstand der Übertragung den Datenbestand im App-Schema (ADR 0002, 0004).
// Enthält bewusst keine Namen: Familienname und Familienwissen kommen aus private/daten/familienwissen.json.
//
// Aufruf: node scripts/original/baue_datenbestand.ts
// Liest:  private/arbeit/zwischenstand.json, private/daten/familienwissen.json
// Schreibt: private/daten/stammbaum.json, private/arbeit/pruefliste.json

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
  type Place,
} from '../../src/domain/schema.ts';
import { guessSex, parseBox, parseEvent, type ParsedEvent } from '../../src/domain/wortlaut.ts';

const root = new URL('../../', import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

interface Box { x: number; y: number; w: number; h: number }
interface StagePerson { id: string; quelle: 'kaestchen' | 'unnummeriert' | 'erwaehnt'; zeilen: string[]; aussen?: { wortlaut: string; lage?: string }[]; gruende: string[]; bild?: Box | null; weitere_bilder?: (Box | null)[] }
interface StageMarriage { id: string; partner: (string | null)[]; wortlaut: string[]; ehe_nr: string; kinder: string[]; unsicher: boolean; hinweise: string[] }
interface Stage { personen: StagePerson[]; ehen: StageMarriage[]; zwillinge: string[][]; freie_texte: { wortlaut: string; gehoert_zu: string | null; lage: string }[]; verweise: { von: string | null; nach: string | null; beschriftung: string }[]; probleme: string[] }

const stage: Stage = read('private/arbeit/zwischenstand.json');
const fw = read('private/daten/familienwissen.json');

const ORIGINAL = 'src-original';
const FAMILIE = 'src-familienwissen';
const MEDIA = 'm-original';
let claimNo = 0;
const cid = () => `c-${String(++claimNo).padStart(5, '0')}`;
const pid = (stageId: string) => `o-${stageId}`;

const places = new Map<string, Place>();
function placeId(text?: string): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(/[.,;:]+$/, '').trim();
  const slug = clean.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) return undefined;
  const id = `ort-${slug}`;
  if (!places.has(id)) places.set(id, { id, historicalName: clean });
  return id;
}

const pruefliste: { art: string; person?: string; ehe?: string; text: string; bild?: Box | null }[] = [];

function region(box?: Box | null) {
  if (!box) return undefined;
  const { breite, hoehe } = fw.original;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { mediaId: MEDIA, x: clamp(box.x / breite), y: clamp(box.y / hoehe), width: clamp(box.w / breite), height: clamp(box.h / hoehe) };
}

function originalClaim(sp: StagePerson | undefined, verbatim: string, confidence: Confidence, needsReview: boolean) {
  return {
    id: cid(),
    citation: { sourceId: ORIGINAL, ...(sp?.bild ? { region: region(sp.bild) } : { location: 'nur erwähnt' }) },
    confidence,
    status: 'accepted' as const,
    verbatim,
    ...(needsReview ? { needsReview: true } : {}),
  };
}

function eventClaim(sp: StagePerson | undefined, e: ParsedEvent, needsReview: boolean): EventClaim {
  return {
    ...originalClaim(sp, e.verbatim, e.confidence, needsReview),
    ...(e.date ? { date: e.date } : {}),
    ...(e.placeText ? { placeId: placeId(e.placeText) } : {}),
    ...(e.cause ? { cause: e.cause } : {}),
    ...(e.rest ? { value: e.rest } : {}),
  };
}

// ── Personen aus dem Original ────────────────────────────────────────────────

const childIds = new Set(stage.ehen.flatMap((m) => m.kinder));
const persons = new Map<string, Person>();
const stamm: { nachname: string; kuerzel: string[] } = fw.stamm;

function splitName(nameText: string, isChild: boolean): { given?: string; surname?: string } {
  let text = nameText.replace(/\s+/g, ' ').trim();
  const stammHit = [stamm.nachname, ...stamm.kuerzel].find((k) => text.toLowerCase().includes(k.toLowerCase()));
  if (stammHit) {
    const given = text.replace(new RegExp(stammHit.replace('.', '\\.'), 'i'), '').replace(/[,\s]+$/, '').replace(/\s+/g, ' ').trim();
    return { given: given || undefined, surname: stamm.nachname };
  }
  if (isChild) return { given: text || undefined, surname: stamm.nachname };
  text = text.split(/,| aus | von /)[0]!.trim();
  const tokens = text.split(' ');
  return { given: tokens[0], surname: tokens.slice(1).join(' ') || undefined };
}

for (const sp of stage.personen) {
  const parsed = parseBox(sp.zeilen);
  const review = sp.gruende.some((g) => g.startsWith('Lesung prüfen'));
  const isChild = childIds.has(sp.id);
  const { given, surname } = splitName(parsed.nameText || sp.zeilen[0] || '', isChild);
  const name: NameClaim = {
    ...originalClaim(sp, sp.zeilen.join(' / '), review ? 'assumed' : 'probable', review),
    type: 'birth',
    ...(given ? { given } : {}),
    ...(surname ? { surname } : {}),
  };
  const events: PersonEvent[] = [];
  for (const e of parsed.events) {
    const claim = eventClaim(sp, e, review);
    if (e.type === 'marriage') {
      events.push({ id: `e-${claim.id}`, type: 'note', claims: [{ ...claim, value: e.verbatim }] });
    } else {
      events.push({ id: `e-${claim.id}`, type: e.type, claims: [claim] });
    }
  }
  for (const a of sp.aussen ?? []) {
    const c = originalClaim(sp, a.wortlaut, 'probable', review);
    events.push({ id: `e-${c.id}`, type: 'note', claims: [{ ...c, value: a.wortlaut, note: `außerhalb des Kästchens${a.lage ? `: ${a.lage}` : ''}` }] });
  }
  persons.set(pid(sp.id), {
    id: pid(sp.id),
    sex: /adopt/i.test(sp.zeilen.join(' ')) ? guessSex(parsed.nameText) : guessSex(parsed.nameText),
    names: [name],
    events,
    mentioned: sp.quelle === 'erwaehnt',
    status: 'accepted',
  });
  for (const g of sp.gruende) pruefliste.push({ art: 'Lesung', person: pid(sp.id), text: `${sp.zeilen.join(' / ')} – ${g}`, bild: sp.bild });
}

function addNote(personStageId: string | null | undefined, text: string, note: string) {
  if (!personStageId) return false;
  const person = persons.get(pid(personStageId));
  if (!person) return false;
  const sp = stage.personen.find((p) => p.id === personStageId);
  const c = originalClaim(sp, text, 'probable', false);
  person.events.push({ id: `e-${c.id}`, type: 'note', claims: [{ ...c, value: text, note }] });
  return true;
}

for (const t of stage.freie_texte) {
  if (!addNote(t.gehoert_zu, t.wortlaut, 'freier Text im Original')) pruefliste.push({ art: 'Freier Text ohne Zuordnung', text: `${t.wortlaut} (Lage ${t.lage})` });
}
for (const v of stage.verweise) {
  if (v.beschriftung) addNote(v.von, v.beschriftung, 'Beschriftung am Pfeil im Original');
}
for (const [a, b] of stage.zwillinge) {
  addNote(a!, 'Zwillinge', 'Bogen im Original');
  addNote(b!, 'Zwillinge', 'Bogen im Original');
}

// ── Ehen aus dem Original ────────────────────────────────────────────────────

const partnerships: Partnership[] = [];
for (const m of stage.ehen) {
  const partners = m.partner.map((p) => (p && persons.has(pid(p)) ? pid(p) : null)) as [string | null, string | null];
  const events = m.wortlaut.length
    ? [{
        id: `e-${m.id}`,
        type: 'marriage' as const,
        claims: m.wortlaut.map((w, i) => {
          const parsed = parseEvent('marriage', w, w.replace(/^⚭\s*/, ''));
          return { ...eventClaim(undefined, parsed, m.unsicher), citation: { sourceId: ORIGINAL, location: m.ehe_nr ? `${m.ehe_nr} Ehe` : 'Ehe-Beschriftung' }, ...(i === 0 ? { preferred: true } : {}) };
        }),
      }]
    : [];
  const children: Parentage[] = m.kinder
    .filter((k) => persons.has(pid(k)))
    .map((k) => ({
      ...originalClaim(stage.personen.find((p) => p.id === k), 'Kinderlinie im Original', m.unsicher ? 'assumed' : 'probable', m.unsicher),
      childId: pid(k),
      kind: /adopt/i.test(stage.personen.find((p) => p.id === k)?.zeilen.join(' ') ?? '') ? ('adopted' as const) : ('biological' as const),
    }));
  partnerships.push({ id: `pa-${m.id}`, partners, kind: m.wortlaut.length ? 'marriage' : 'unknown', events, children });
  if (m.unsicher) pruefliste.push({ art: 'Ehe/Kinder unsicher', ehe: `pa-${m.id}`, text: `${m.partner.join(' + ')} ⚭ ${m.wortlaut.join(' | ')} – ${m.hinweise.slice(0, 2).join(' · ')}` });
}
for (const p of stage.probleme) pruefliste.push({ art: 'Zuordnung offen', text: p });

// ── Familienwissen: Anschluss bis heute ──────────────────────────────────────

const fwClaim = (verbatim: string) => ({ id: cid(), citation: { sourceId: FAMILIE }, confidence: 'probable' as const, status: 'accepted' as const, verbatim });
const anchorStage = stage.personen.find((p) => p.zeilen.join(' ').includes(fw.anschluss.person_im_original.suche) && p.zeilen.join(' ').replace(/\s/g, '').includes(fw.anschluss.person_im_original.geburt.replace(/\s/g, '')));
if (!anchorStage) pruefliste.push({ art: 'Anschluss', text: 'Anschlussperson im Original nicht gefunden – bitte zuordnen' });
const anchor = anchorStage ? pid(anchorStage.id) : undefined;
if (anchor && fw.anschluss.tod) {
  const [y, mo, d] = fw.anschluss.tod.datum;
  persons.get(anchor)!.events.push({ id: `e-fw-tod`, type: 'death', claims: [{ ...fwClaim(`† ${d}.${mo}.${y}`), date: { kind: 'exact', date: { year: y, month: mo, day: d } } }] });
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

const dataset = Dataset.parse({
  schemaVersion: 1,
  probandId: proband ? `fw-${proband.id}` : null,
  persons: [...persons.values()],
  partnerships,
  places: [...places.values()],
  sources: [
    { id: ORIGINAL, kind: 'original', title: fw.original.titel, mediaId: MEDIA, note: 'Handgezeichnete Nachfahrentafel; übertragen 2026 (zwei unabhängige Lesungen)' },
    { id: FAMILIE, kind: 'family-knowledge', title: 'Familienwissen', enteredBy: fw.eingetragen_von, enteredAt: fw.eingetragen_am },
  ],
  media: [
    { id: MEDIA, kind: 'image', file: fw.original.foto, title: fw.original.titel, width: fw.original.breite, height: fw.original.hoehe },
    { id: 'm-wappen', kind: 'image', file: fw.wappen.datei, title: fw.wappen.titel },
  ],
  lineages: [{ id: 'stamm-1', name: fw.stamm.name, progenitorId: pid('K001'), originalSourceId: ORIGINAL }],
  lines: [],
  researchQuestions: [],
});
const broken = findBrokenReferences(dataset);
if (broken.length) throw new Error(`Kaputte Verweise:\n${broken.slice(0, 20).join('\n')}`);

const target = new URL('private/daten/stammbaum.json', root);
if (existsSync(target)) writeFileSync(new URL(`private/daten/stammbaum.vorher-${Date.now()}.json`, root), readFileSync(target));
writeFileSync(target, `${JSON.stringify(dataset, null, 1)}\n`);
writeFileSync(new URL('private/arbeit/pruefliste.json', root), `${JSON.stringify(pruefliste, null, 1)}\n`);
const count = (art: string) => pruefliste.filter((p) => p.art === art).length;
console.log(`Datenbestand: ${dataset.persons.length} Personen, ${dataset.partnerships.length} Partnerschaften, ${dataset.places.length} Orte`);
console.log(`Prüfliste: ${pruefliste.length} Punkte (Lesung ${count('Lesung')}, Ehe/Kinder ${count('Ehe/Kinder unsicher')}, offen ${count('Zuordnung offen')}, freie Texte ${count('Freier Text ohne Zuordnung')}, Anschluss ${count('Anschluss')})`);
