// Datenmodell der Ahnenforschung. Die Begriffe folgen GLOSSARY.md; der deutsche Begriff steht jeweils im Kommentar.
// Jede Aussage ist eine Angabe (Claim) mit Quelle und Sicherheit (ADR 0002), der Wortlaut bleibt erhalten (ADR 0004).

import { z } from 'zod';

export const Id = z.string().min(1);

// ── Unscharfes Datum ──────────────────────────────────────────────────────────

/** Ein Datum, das nur so genau ist wie die Quelle: Jahr, Monat oder Tag. */
export const PartialDate = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12).optional(),
  day: z.number().int().min(1).max(31).optional(),
});

/** Unscharfes Datum: genau, „um", „vor", „nach" oder „zwischen … und …". */
export const FuzzyDate = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('exact'), date: PartialDate }),
  z.object({ kind: z.literal('about'), date: PartialDate }),
  z.object({ kind: z.literal('before'), date: PartialDate }),
  z.object({ kind: z.literal('after'), date: PartialDate }),
  z.object({ kind: z.literal('between'), from: PartialDate, to: PartialDate }),
]);

// ── Belege ────────────────────────────────────────────────────────────────────

/** Sicherheit: belegt, wahrscheinlich, vermutet, unbekannt. */
export const Confidence = z.enum(['proven', 'probable', 'assumed', 'unknown']);

/** Stand einer Angabe: übernommen, Vorschlag (noch nicht bestätigt) oder verworfen. */
export const ClaimStatus = z.enum(['accepted', 'suggested', 'rejected']);

/** Bildausschnitt in einem Medium, relativ zur Bildgröße (0 bis 1). */
export const ImageRegion = z.object({
  mediaId: Id,
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

/** Fundstelle: die genaue Stelle in einer Quelle. */
export const Citation = z.object({
  sourceId: Id,
  location: z.string().optional(),
  region: ImageRegion.optional(),
});

/** Gemeinsame Felder jeder Angabe. */
const claimFields = {
  id: Id,
  citation: Citation,
  confidence: Confidence,
  status: ClaimStatus.default('accepted'),
  /** Bevorzugte Angabe, wenn es mehrere zur selben Sache gibt. */
  preferred: z.boolean().optional(),
  /** Wortlaut genau wie in der Quelle. */
  verbatim: z.string().optional(),
  /** Weitere mögliche Lesarten bei unklarer Schrift. */
  verbatimAlternatives: z.array(z.string()).optional(),
  /** „Lesung prüfen": die Übertragung ist unsicher. */
  needsReview: z.boolean().optional(),
  /** Forschungsfrage, aus der ein Vorschlag stammt. */
  researchQuestionId: Id.optional(),
  note: z.string().optional(),
};

// ── Ereignisse und Namen ──────────────────────────────────────────────────────

export const PersonEventType = z.enum([
  'birth',
  'baptism',
  'death',
  'burial',
  'occupation',
  'residence',
  'emigration',
  'military',
  'note',
]);

export const PartnershipEventType = z.enum(['marriage', 'engagement', 'divorce', 'separation']);

/** Angabe zu einem Ereignis: wann, wo, und ggf. ein Wert (Beruf, Wohnort, Notiz) oder eine Todesursache. */
export const EventClaim = z.object({
  ...claimFields,
  date: FuzzyDate.optional(),
  placeId: Id.optional(),
  value: z.string().optional(),
  cause: z.string().optional(),
});

export const PersonEvent = z.object({ id: Id, type: PersonEventType, claims: z.array(EventClaim).min(1) });
export const PartnershipEvent = z.object({ id: Id, type: PartnershipEventType, claims: z.array(EventClaim).min(1) });

/** Namensvariante: Geburtsname, Ehename, heutiger Name oder Schreibvariante. */
export const NameClaim = z.object({
  ...claimFields,
  type: z.enum(['birth', 'married', 'current', 'variant']),
  given: z.string().optional(),
  surname: z.string().optional(),
  callName: z.string().optional(),
});

// ── Personen und Verwandtschaft ───────────────────────────────────────────────

export const Sex = z.enum(['m', 'f', 'u']);

export const Person = z.object({
  id: Id,
  sex: Sex,
  names: z.array(NameClaim).min(1),
  events: z.array(PersonEvent).default([]),
  /** Erwähnte Person: hat im Original keinen eigenen Kasten. */
  mentioned: z.boolean().default(false),
  /** Vorgeschlagene Person aus der Recherche, noch nicht bestätigt. */
  status: ClaimStatus.default('accepted'),
});

/** Elternschaft: Beziehung eines Kindes zu einer Partnerschaft, mit ihrer Art. */
export const Parentage = z.object({
  ...claimFields,
  childId: Id,
  kind: z.enum(['biological', 'adopted', 'step', 'foster', 'unknown']),
});

/** Partnerschaft: Ehe oder nichteheliche Verbindung; ein Partner kann unbekannt sein (null). */
export const Partnership = z.object({
  id: Id,
  partners: z.tuple([Id.nullable(), Id.nullable()]),
  kind: z.enum(['marriage', 'union', 'unknown']),
  events: z.array(PartnershipEvent).default([]),
  children: z.array(Parentage).default([]),
});

// ── Orte, Quellen, Medien ─────────────────────────────────────────────────────

export const Place = z.object({
  id: Id,
  historicalName: z.string(),
  modernName: z.string().optional(),
  country: z.string().optional(),
  parish: z.string().optional(),
  coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

export const SourceKind = z.enum([
  'original',
  'church-record',
  'civil-record',
  'document',
  'website',
  'literature',
  'family-knowledge',
  'other',
]);

export const Source = z.object({
  id: Id,
  kind: SourceKind,
  title: z.string(),
  author: z.string().optional(),
  created: z.string().optional(),
  url: z.string().optional(),
  mediaId: Id.optional(),
  /** Bei Familienwissen: wer es wann eingetragen hat. */
  enteredBy: z.string().optional(),
  enteredAt: z.string().optional(),
  note: z.string().optional(),
});

export const Media = z.object({
  id: Id,
  kind: z.enum(['image', 'scan', 'photo', 'document']),
  /** Pfad relativ zum Medienordner. */
  file: z.string(),
  title: z.string(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

// ── Stämme und Linien ─────────────────────────────────────────────────────────

/** Stamm: Nachkommenschaft eines Stammvaters. */
export const Lineage = z.object({
  id: Id,
  name: z.string(),
  progenitorId: Id,
  originalSourceId: Id.optional(),
});

/** Linie: benannter Zweig innerhalb eines Stammes, beginnend bei einer Person. */
export const Line = z.object({
  id: Id,
  lineageId: Id,
  name: z.string(),
  founderId: Id,
  verbatim: z.string().optional(),
});

// ── Recherche ─────────────────────────────────────────────────────────────────

/** Suchversuch: eine durchgeführte Suche, auch wenn sie nichts fand. */
export const SearchAttempt = z.object({
  id: Id,
  date: z.string(),
  portal: z.string(),
  query: z.string(),
  url: z.string().optional(),
  result: z.enum(['found', 'nothing', 'unclear']),
  note: z.string().optional(),
});

export const ResearchQuestion = z.object({
  id: Id,
  question: z.string(),
  personIds: z.array(Id),
  origin: z.enum(['gap', 'manual']),
  /** offen, für Claude vorgemerkt, in Arbeit, beantwortet, erfolglos */
  status: z.enum(['open', 'queued', 'in-progress', 'answered', 'unsuccessful']),
  createdAt: z.string(),
  attempts: z.array(SearchAttempt).default([]),
  note: z.string().optional(),
});

// ── Datenbestand ──────────────────────────────────────────────────────────────

export const Dataset = z.object({
  schemaVersion: z.literal(1),
  probandId: Id.nullable(),
  persons: z.array(Person),
  partnerships: z.array(Partnership),
  places: z.array(Place),
  sources: z.array(Source),
  media: z.array(Media),
  lineages: z.array(Lineage),
  lines: z.array(Line),
  researchQuestions: z.array(ResearchQuestion),
});

export type PartialDate = z.infer<typeof PartialDate>;
export type FuzzyDate = z.infer<typeof FuzzyDate>;
export type Confidence = z.infer<typeof Confidence>;
export type ClaimStatus = z.infer<typeof ClaimStatus>;
export type Citation = z.infer<typeof Citation>;
export type EventClaim = z.infer<typeof EventClaim>;
export type PersonEventType = z.infer<typeof PersonEventType>;
export type PersonEvent = z.infer<typeof PersonEvent>;
export type PartnershipEvent = z.infer<typeof PartnershipEvent>;
export type NameClaim = z.infer<typeof NameClaim>;
export type Person = z.infer<typeof Person>;
export type Parentage = z.infer<typeof Parentage>;
export type Partnership = z.infer<typeof Partnership>;
export type Place = z.infer<typeof Place>;
export type Source = z.infer<typeof Source>;
export type Media = z.infer<typeof Media>;
export type Lineage = z.infer<typeof Lineage>;
export type Line = z.infer<typeof Line>;
export type SearchAttempt = z.infer<typeof SearchAttempt>;
export type ResearchQuestion = z.infer<typeof ResearchQuestion>;
export type Dataset = z.infer<typeof Dataset>;
