// Deutung des Wortlauts eines Stammbaum-Kästchens (ADR 0004): Der Wortlaut bleibt unverändert,
// daneben entsteht eine Deutung als Ereignisse mit unscharfem Datum, Ort und Ursache.
//
// Zeichen: * Geburt, † Tod, ⚭ Heirat. „ca"/„um" = ungefähr, „?" vor einer Jahreszahl = unsicher,
// „schon tot" / „vor" = spätestens, ein alleinstehendes „?" = unbekannt.

import type { Confidence, FuzzyDate, PartialDate } from './schema.ts';

export type MarkerType = 'birth' | 'death' | 'marriage';

export interface ParsedEvent {
  type: MarkerType;
  verbatim: string;
  date?: FuzzyDate;
  placeText?: string;
  /** Freitext nach Datum/Ort, der kein Ort ist (z. B. „an Pest", Ehepartner bei ⚭). */
  rest?: string;
  cause?: string;
  confidence: Confidence;
}

export interface ParsedBox {
  /** Text vor dem ersten Zeichen: Name und ggf. Zusätze. */
  nameText: string;
  events: ParsedEvent[];
}

const MARKERS: Record<string, MarkerType> = { '*': 'birth', '†': 'death', '⚭': 'marriage' };
const CAUSES = [/\ban\s+(der\s+)?pest\b/i, /\bgefallen\b/i, /\bkrieg\b/i, /\btotgeboren\b/i, /\bertrunken\b/i];

/** Zerlegt Text an den Zeichen *, †, ⚭ (Wortlaut je Abschnitt bleibt erhalten). */
export function parseBox(lines: readonly string[]): ParsedBox {
  const text = lines.join('\n');
  const parts = text.split(/([*†⚭])/);
  const nameText = (parts[0] ?? '').replace(/\s+/g, ' ').trim();
  const events: ParsedEvent[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const type = MARKERS[parts[i]!]!;
    const content = (parts[i + 1] ?? '').trim();
    events.push(parseEvent(type, `${parts[i]} ${content}`.replace(/\s+/g, ' ').trim(), content));
  }
  return { nameText, events };
}

const DATE = /(\d{1,2})\s*[.\s]\s*(\d{1,2})\s*[.\s]\s*(\d{4}|\d{2}(?!\d))/;
const YEAR = /\b(1[0-9]{3}|20[0-9]{2})\b/;

function partial(year: number, month?: number, day?: number): PartialDate {
  return { year, ...(month ? { month } : {}), ...(day ? { day } : {}) };
}

/** Deutet den Inhalt nach einem Zeichen. Zweistellige Jahre (z. B. „23.2.39") werden aufs 20. Jh. bezogen. */
export function parseEvent(type: MarkerType, verbatim: string, content: string): ParsedEvent {
  let body = content.replace(/^[\s:;,.]+/, '');
  const qualifierBefore = /^(ca\.?|um|vor|nach|\?)\s*/i.exec(body)?.[1]?.toLowerCase();
  const lateHint = /schon\s+tot|spätestens/i.test(body);
  let date: FuzzyDate | undefined;
  let confidence: Confidence = 'probable';

  const full = DATE.exec(body);
  const yearOnly = full ? null : YEAR.exec(body);
  if (full) {
    const year = full[3]!.length === 2 ? 1900 + Number(full[3]) : Number(full[3]);
    const month = Number(full[2]);
    const day = Number(full[1]);
    const valid = month >= 1 && month <= 12 && day >= 1 && day <= 31;
    date = { kind: 'exact', date: valid ? partial(year, month, day) : partial(year) };
    if (!valid) confidence = 'assumed';
    body = body.replace(full[0], ' ');
  } else if (yearOnly) {
    date = { kind: 'exact', date: partial(Number(yearOnly[1])) };
    body = body.replace(yearOnly[0], ' ');
  }

  if (date && date.kind === 'exact') {
    if (qualifierBefore === 'ca' || qualifierBefore === 'ca.' || qualifierBefore === 'um') date = { kind: 'about', date: date.date };
    else if (qualifierBefore === 'vor' || (lateHint && type === 'death')) date = { kind: 'before', date: date.date };
    else if (qualifierBefore === 'nach') date = { kind: 'after', date: date.date };
    if (qualifierBefore === '?' || qualifierBefore === 'ca' || qualifierBefore === 'ca.' || lateHint) confidence = 'assumed';
  }
  if (!date) confidence = 'unknown';

  body = body.replace(/^\s*(ca\.?|um|vor|nach|\?)\s*/i, ' ');
  const cause = CAUSES.map((pattern) => pattern.exec(body)?.[0]).find(Boolean);
  if (cause) body = body.replace(cause, ' ');

  // Was übrig bleibt: Ort (nach „in", „/" oder direkt) oder sonstiger Text.
  const rest = body
    .replace(/schon\s+tot\s+sein|muss\s+er|muß\s+er|schon\s+tot/gi, ' ')
    .replace(/^[\s/,;:.?]+|[\s/,;:.]+$/g, '')
    .replace(/^in\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const placeShaped = rest.length > 1 && /^[A-ZÄÖÜ]/.test(rest) && rest.split(' ').length <= 3;
  const looksLikePlace = placeShaped && type !== 'marriage';
  // Bei einer Heirat ist der Text ein Ort, wenn er mit „in" oder „/" angeschlossen ist oder hinter einem Datum steht;
  // ohne Datum (z. B. „⚭ Hans …") ist er der Name des Ehepartners.
  const marriagePlace =
    type === 'marriage' && placeShaped && (/\bin\s+[A-ZÄÖÜ]/.test(content) || /\/\s*[A-ZÄÖÜ]/.test(content) || date !== undefined) ? rest : undefined;

  return {
    type,
    verbatim,
    ...(date ? { date } : {}),
    ...(looksLikePlace || marriagePlace ? { placeText: rest } : rest && rest !== '?' ? { rest } : {}),
    ...(cause ? { cause: cause.replace(/^an\s+(der\s+)?/i, '').replace(/^\w/, (c) => c.toUpperCase()) } : {}),
    confidence,
  };
}

const FEMALE_WORDS = /\b(tochter|witwe|wwe|frau|jungfer)\b/i;
const MALE_WORDS = /\b(sohn|witwer|meister|jungges)\b/i;
const MALE_ENDING_E = new Set(['uwe', 'kurt', 'ernste', 'lebrecht', 'gottlobe', 'ehe']);

/** Schätzt das Geschlecht aus dem Namenstext (nur Vorschlag; „u", wenn unklar). */
export function guessSex(nameText: string): 'm' | 'f' | 'u' {
  if (FEMALE_WORDS.test(nameText)) return 'f';
  if (MALE_WORDS.test(nameText) && !/witwe des/i.test(nameText)) return 'm';
  const first = nameText.replace(/^[\d.\s]+/, '').split(/[\s,;-]+/)[0]?.toLowerCase() ?? '';
  if (!first || first.length < 2) return 'u';
  if (MALE_ENDING_E.has(first)) return 'm';
  return /(a|e|ie|ine|ina|ette|elle|ilde|ud|run|rid|rot|aut)$/.test(first) ? 'f' : 'm';
}
