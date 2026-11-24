// Steckbrief einer Person: Lebensdaten mit allen Angaben, Namen, Familie, Recherche.

import { useState } from 'react';
import { formatFuzzyDate } from '../src/domain/dates.ts';
import type { EventClaim } from '../src/domain/schema.ts';
import {
  childrenOf,
  CONFIDENCE_LABEL,
  dataset,
  EVENT_LABEL,
  index,
  isDivorced,
  KIND_LABEL,
  marriageClaim,
  ordinal,
  parentsOf,
  partnershipsSorted,
  placeName,
  sourceOf,
  summary,
} from './data.ts';

const STATUS_LABEL: Record<string, string> = { suggested: 'Vorschlag', rejected: 'verworfen' };

function ClaimList({ claims }: { claims: EventClaim[] }) {
  return (
    <ul className="claims">
      {claims.map((claim) => (
        <li key={claim.id}>
          {claim.date ? formatFuzzyDate(claim.date) : claim.value ?? '–'}
          {claim.placeId ? ` in ${placeName(claim.placeId)}` : ''}
          {claim.cause ? ` (${claim.cause})` : ''}
          {' · '}
          <span className="muted">{sourceOf(claim.citation.sourceId)?.title}</span>
          {claim.citation.location ? <span className="muted">, {claim.citation.location}</span> : null}
          {' · '}
          {CONFIDENCE_LABEL[claim.confidence]}
          {claim.preferred ? ' · bevorzugt' : ''}
          {STATUS_LABEL[claim.status] ? ` · ${STATUS_LABEL[claim.status]}` : ''}
          {claim.verbatim ? (
            <div>
              Wortlaut: <span className="verbatim">„{claim.verbatim}"</span>
              {claim.verbatimAlternatives?.length ? (
                <span className="muted"> – andere Lesarten: {claim.verbatimAlternatives.join(', ')}</span>
              ) : null}
            </div>
          ) : null}
          {claim.needsReview ? <span className="badge warn">Lesung prüfen</span> : null}
        </li>
      ))}
    </ul>
  );
}

function Fact({ label, claims }: { label: string; claims: EventClaim[] }) {
  const [open, setOpen] = useState(false);
  const accepted = claims.filter((claim) => claim.status === 'accepted');
  const main = accepted.find((claim) => claim.preferred) ?? accepted[0] ?? claims[0]!;
  const text =
    [main.date ? formatFuzzyDate(main.date) : undefined, placeName(main.placeId), main.value, main.cause ? `(${main.cause})` : undefined]
      .filter(Boolean)
      .join(' · ') || 'ohne Datum';
  return (
    <div className="fact">
      <span className="label">{label}</span>
      <span>
        {text}{' '}
        <button className="linklike" onClick={() => setOpen(!open)}>
          {claims.length > 1 ? `${claims.length} Angaben` : 'Beleg'}
        </button>
        {claims.some((claim) => claim.needsReview) ? <span className="badge warn"> prüfen</span> : null}
        {main.status === 'suggested' ? <span className="badge warn"> Vorschlag</span> : null}
      </span>
      {open ? <ClaimList claims={claims} /> : null}
    </div>
  );
}

function PersonLink({ id, onSelect }: { id: string; onSelect: (id: string) => void }) {
  const s = summary(id);
  return (
    <button className="linklike" onClick={() => onSelect(id)}>
      {s.name}
    </button>
  );
}

export function Profile({ personId, onSelect, onClose }: { personId: string; onSelect: (id: string) => void; onClose: () => void }) {
  const person = index.person(personId)!;
  const s = summary(personId);
  const { father, mother } = parentsOf(personId);
  const partnerships = partnershipsSorted(personId);
  const questions = dataset.researchQuestions.filter((question) => question.personIds.includes(personId));
  const otherNames = person.names.filter((name) => `${name.given ?? ''} ${name.surname ?? ''}`.trim() !== s.name);

  return (
    <aside className="profile" aria-label="Steckbrief">
      <header>
        <div>
          <h2>{s.name}</h2>
          {s.birthSurname ? <div className="sub">geb. {s.birthSurname}</div> : null}
        </div>
        <button className="close" onClick={onClose} aria-label="Steckbrief schließen">
          ✕
        </button>
      </header>
      <div className="badges">
        {s.generationLabel ? <span className="badge">Generation {s.generationLabel}</span> : null}
        {s.kekule.length ? <span className="badge accent">Ahnennummer {s.kekule.join(' und ')}</span> : null}
        {s.kekule.length > 1 ? <span className="badge accent">Ahnenschwund</span> : null}
        {s.protected ? <span className="badge">🔒 geschützt</span> : null}
        {s.mentioned ? <span className="badge">nur erwähnt</span> : null}
        {s.suggested ? <span className="badge warn">Vorschlag aus Recherche</span> : null}
      </div>

      <section>
        <h3>Lebensdaten</h3>
        {person.events.length === 0 ? <p className="muted">Keine Angaben.</p> : null}
        {person.events.map((event) => (
          <Fact key={event.id} label={EVENT_LABEL[event.type] ?? event.type} claims={event.claims} />
        ))}
      </section>

      {otherNames.length > 0 ? (
        <section>
          <h3>Namen</h3>
          {person.names.map((name) => (
            <div key={name.id} className="fact">
              <span className="label">{{ birth: 'Geburtsname', married: 'Ehename', current: 'heute', variant: 'Variante' }[name.type]}</span>
              <span>
                {[name.given, name.surname].filter(Boolean).join(' ')}
                {name.status === 'suggested' ? <span className="badge warn"> Vorschlag</span> : null}
              </span>
            </div>
          ))}
        </section>
      ) : null}

      <section>
        <h3>Familie</h3>
        <div className="fact">
          <span className="label">Eltern</span>
          <span>
            {father ? <PersonLink id={father} onSelect={onSelect} /> : 'unbekannt'}
            {' & '}
            {mother ? <PersonLink id={mother} onSelect={onSelect} /> : 'unbekannt'}
          </span>
        </div>
        {partnerships.map((partnership, i) => {
          const partnerId = index.partnerOf(partnership, personId);
          const marriage = marriageClaim(partnership);
          return (
            <div key={partnership.id} className="fact">
              <span className="label">{partnerships.length > 1 ? `${ordinal(i + 1)}. Ehe` : partnership.kind === 'marriage' ? 'Ehe' : 'Verbindung'}</span>
              <span>
                {partnerId ? <PersonLink id={partnerId} onSelect={onSelect} /> : 'Partner unbekannt'}
                {marriage?.date ? <span className="muted"> · ⚭ {formatFuzzyDate(marriage.date)}</span> : null}
                {isDivorced(partnership) ? <span className="muted"> · geschieden</span> : null}
                <br />
                {childrenOf(partnership).map((child, k) => (
                  <span key={child.id}>
                    {k > 0 ? ', ' : 'Kinder: '}
                    <PersonLink id={child.id} onSelect={onSelect} />
                    {KIND_LABEL[child.kind] ? <span className="muted"> ({KIND_LABEL[child.kind]})</span> : null}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </section>

      {questions.length > 0 ? (
        <section>
          <h3>Recherche</h3>
          {questions.map((question) => (
            <div key={question.id} className="fact">
              <span className="label">{{ open: 'offen', queued: 'vorgemerkt', 'in-progress': 'in Arbeit', answered: 'beantwortet', unsuccessful: 'erfolglos' }[question.status]}</span>
              <span>
                {question.question}
                <br />
                <span className="muted">{question.attempts.length} Suchversuch(e)</span>
              </span>
            </div>
          ))}
        </section>
      ) : null}
    </aside>
  );
}
