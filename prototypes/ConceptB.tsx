// Entwurf B „Familien-Fokus": eine Person in der Mitte, Eltern darüber, Partner und Kinder darunter.

import { useState } from 'react';
import { formatFuzzyDate } from '../src/domain/dates.ts';
import { PersonCard, UnknownCard } from './Cards.tsx';
import {
  childrenOf,
  index,
  isDivorced,
  kekule,
  marriageText,
  ordinal,
  parentsOf,
  partnershipsSorted,
  pathFromProgenitor,
  probandId,
  summary,
} from './data.ts';

export function ConceptB({ onSelect }: { onSelect: (id: string) => void }) {
  const [focus, setFocus] = useState(probandId);
  const [history, setHistory] = useState<string[]>([]);
  const go = (id: string) => {
    if (id === focus) return onSelect(id);
    setHistory((h) => [...h, focus]);
    setFocus(id);
  };
  const back = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((h) => h.slice(0, -1));
    setFocus(previous);
  };

  const path = pathFromProgenitor(focus);
  const { father, mother, partnership: parentPartnership } = parentsOf(focus);
  const grandparents = [father, mother].map((parent) => (parent ? parentsOf(parent) : {}));
  const siblings = parentPartnership ? childrenOf(parentPartnership).filter((child) => child.id !== focus) : [];
  const partnerships = partnershipsSorted(focus);
  const parentMarriage = parentPartnership ? marriageText(parentPartnership)?.replace(/^⚭ ?/, "") : undefined;
  const isMine = (id?: string) => !!id && kekule.has(id);

  return (
    <div className="concept-b">
      <nav className="breadcrumb" aria-label="Weg vom Stammvater">
        <button className="tool" onClick={back} disabled={history.length === 0} aria-label="Zurück">
          ←
        </button>
        {path.map((id, i) => (
          <span key={id}>
            {i > 0 ? <span className="sep">›</span> : null}
            <button className={id === focus ? 'crumb current' : 'crumb'} onClick={() => go(id)}>
              <span className="muted">{summary(id).generationLabel}</span> {summary(id).given}
            </button>
          </span>
        ))}
        <span className="spacer" />
        <button className="tool wide" onClick={() => go(probandId)}>
          Zu mir
        </button>
      </nav>

      <div className="b-grid">
        <div className="b-grand">
          {grandparents.flatMap((gp, i) =>
            [gp.father, gp.mother].map((id, k) =>
              id ? <PersonCard key={`${i}-${k}`} id={id} onClick={go} compact mine={isMine(id)} /> : <UnknownCard key={`${i}-${k}`} />,
            ),
          )}
        </div>

        <div className="b-parents">
          {father ? <PersonCard id={father} onClick={go} mine={isMine(father)} /> : <UnknownCard label="Vater unbekannt" />}
          <div className="b-knot">
            <span className="ring">⚭</span>
            <span className="muted">{parentMarriage ?? ''}</span>
          </div>
          {mother ? <PersonCard id={mother} onClick={go} mine={isMine(mother)} /> : <UnknownCard label="Mutter unbekannt" />}
        </div>

        <div className="b-center">
          <div className="b-siblings">
            <h3>Geschwister ({siblings.length})</h3>
            {siblings.map((sibling) => (
              <PersonCard key={sibling.id} id={sibling.id} kind={sibling.kind} onClick={go} compact />
            ))}
          </div>
          <div className="b-focus">
            <PersonCard id={focus} focus mine={isMine(focus)} onClick={() => onSelect(focus)} />
            <button className="tool wide" onClick={() => onSelect(focus)}>
              Steckbrief öffnen
            </button>
          </div>
        </div>

        <div className="b-partners">
          {partnerships.length === 0 ? <p className="muted">Keine Partnerschaft bekannt.</p> : null}
          {partnerships.map((partnership, i) => {
            const partnerId = index.partnerOf(partnership, focus);
            const marriage = marriageText(partnership);
            const children = childrenOf(partnership);
            return (
              <section key={partnership.id} className="b-family">
                <h3>
                  {partnerships.length > 1 ? `${ordinal(i + 1)}. Ehe` : partnership.kind === 'marriage' ? 'Ehe' : 'Verbindung'}
                  {marriage ? <span className="muted"> · {marriage}</span> : null}
                  {isDivorced(partnership) ? <span className="muted"> · geschieden</span> : null}
                </h3>
                {partnerId ? <PersonCard id={partnerId} onClick={go} mine={isMine(partnerId)} /> : <UnknownCard label="Partner unbekannt" />}
                <div className="b-children">
                  {children.map((child) => (
                    <PersonCard key={child.id} id={child.id} kind={child.kind} onClick={go} mine={isMine(child.id)} />
                  ))}
                  {children.length === 0 ? <p className="muted">Keine Kinder bekannt.</p> : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
