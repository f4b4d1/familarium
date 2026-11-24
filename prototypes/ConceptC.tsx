// Entwurf C „Linien-Ansicht": die eigene Linie vom Stammvater bis heute als senkrechte Zeitachse.

import { Fragment, useState } from 'react';
import { formatFuzzyDate } from '../src/domain/dates.ts';
import { PersonCard } from './Cards.tsx';
import {
  childrenOf,
  descendants,
  index,
  isDivorced,
  kekule,
  lineage,
  marriageClaim,
  ordinal,
  parentsOf,
  partnershipsSorted,
  pathFromProgenitor,
  probandId,
  summary,
} from './data.ts';

const HISTORY = [
  { year: 1618, text: 'Dreißigjähriger Krieg (1618–1648)' },
  { year: 1756, text: 'Siebenjähriger Krieg (1756–1763)' },
  { year: 1806, text: 'Napoleonische Kriege, Ende des Alten Reichs' },
  { year: 1871, text: 'Gründung des Deutschen Reichs' },
  { year: 1914, text: 'Erster Weltkrieg (1914–1918)' },
  { year: 1939, text: 'Zweiter Weltkrieg (1939–1945)' },
  { year: 1989, text: 'Mauerfall, 1990 Wiedervereinigung' },
];

const birthYear = (id: string) => {
  const key = summary(id).birthKey;
  return Number.isFinite(key) ? Math.floor(key / 10000) : undefined;
};

/** Die eigene Linie: Stammvater → … → Proband → dessen Kinder. */
function myLine(): string[] {
  const path = pathFromProgenitor(probandId);
  const children = partnershipsSorted(probandId).flatMap((partnership) =>
    childrenOf(partnership).filter((child) => child.kind === 'biological').map((child) => child.id),
  );
  return [...path, ...children.slice(0, 1)];
}

function Generation({ id, nextId, onSelect }: { id: string; nextId?: string; onSelect: (id: string) => void }) {
  const [showSiblings, setShowSiblings] = useState(false);
  const [showCollapse, setShowCollapse] = useState(false);
  const { partnership: parentPartnership } = parentsOf(id);
  const siblings = parentPartnership ? childrenOf(parentPartnership).filter((child) => child.id !== id) : [];
  const partnerships = partnershipsSorted(id);
  const lineIndex = partnerships.findIndex((partnership) => nextId && childrenOf(partnership).some((child) => child.id === nextId));
  const s = summary(id);

  return (
    <div className="c-gen">
      <div className="c-year">{birthYear(id) ?? '?'}</div>
      <div className="c-dot" aria-hidden />
      <div className="c-body">
        <div className="c-row">
          <PersonCard id={id} onClick={onSelect} mine={kekule.has(id)} />
          {partnerships.map((partnership, i) => {
            const partnerId = index.partnerOf(partnership, id);
            const marriage = marriageClaim(partnership);
            const onLine = i === lineIndex;
            return (
              <div key={partnership.id} className={onLine ? 'c-partner on-line' : 'c-partner'}>
                <div className="c-marriage">
                  {partnerships.length > 1 ? `${ordinal(i + 1)}. Ehe ` : ''}⚭ {marriage?.date ? formatFuzzyDate(marriage.date) : 'Datum unbekannt'}
                  {isDivorced(partnership) ? ' · geschieden' : ''}
                </div>
                {partnerId ? <PersonCard id={partnerId} onClick={onSelect} mine={kekule.has(partnerId)} compact={!onLine} /> : <div className="card ghost">Partner unbekannt</div>}
                {onLine && partnerId && descendants.has(partnerId) ? (
                  <button className="linklike" onClick={() => setShowCollapse(!showCollapse)}>
                    Ahnenschwund: {summary(partnerId).given} stammt ebenfalls vom Stammvater ab – {showCollapse ? 'Linie ausblenden' : 'Linie zeigen'}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {showCollapse && lineIndex >= 0 ? (
          <div className="c-collapse">
            {pathFromProgenitor(index.partnerOf(partnerships[lineIndex]!, id)!).map((ancestor) => (
              <PersonCard key={ancestor} id={ancestor} onClick={onSelect} compact mine />
            ))}
          </div>
        ) : null}
        <div className="c-meta">
          <span className="gen-label">{s.generationLabel ? `${s.generationLabel}. Generation` : ''}</span>
          {siblings.length > 0 ? (
            <button className="linklike" onClick={() => setShowSiblings(!showSiblings)}>
              {showSiblings ? 'Geschwister ausblenden' : `${siblings.length} Geschwister zeigen`}
            </button>
          ) : null}
        </div>
        {showSiblings ? (
          <div className="c-siblings">
            {siblings.map((sibling) => (
              <PersonCard key={sibling.id} id={sibling.id} kind={sibling.kind} onClick={onSelect} compact />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ConceptC({ onSelect }: { onSelect: (id: string) => void }) {
  const line = myLine();
  const progenitorParents = index.parentLinksOf(lineage.progenitorId);
  const items: ({ kind: 'person'; id: string; next?: string } | { kind: 'history'; year: number; text: string })[] = [];
  const pending = [...HISTORY];
  line.forEach((id, i) => {
    const year = birthYear(id) ?? 0;
    while (pending.length && pending[0]!.year < year) items.push({ kind: 'history', ...pending.shift()! });
    items.push({ kind: 'person', id, next: line[i + 1] });
  });
  for (const rest of pending) items.push({ kind: 'history', ...rest });

  return (
    <div className="concept-c">
      <div className="c-intro">
        <h2>Meine Linie</h2>
        <p className="muted">
          {line.length} Generationen vom Stammvater {summary(lineage.progenitorId).name} bis heute. Klick auf eine Person öffnet den Steckbrief.
        </p>
      </div>
      <div className="c-timeline">
        {progenitorParents.map(({ partnership }) =>
          partnership.partners.filter((p): p is string => !!p).map((parent) => (
            <div key={parent} className="c-gen suggested-gen">
              <div className="c-year">vor I</div>
              <div className="c-dot" aria-hidden />
              <div className="c-body">
                <PersonCard id={parent} onClick={onSelect} />
                <p className="muted small">Vorschlag aus der Recherche, noch nicht bestätigt.</p>
              </div>
            </div>
          )),
        )}
        {items.map((item) =>
          item.kind === 'history' ? (
            <div key={`h-${item.year}`} className="c-history">
              <div className="c-year">{item.year}</div>
              <div className="c-hdot" aria-hidden />
              <div className="c-htext">{item.text}</div>
            </div>
          ) : (
            <Fragment key={item.id}>
              <Generation id={item.id} nextId={item.next} onSelect={onSelect} />
            </Fragment>
          ),
        )}
      </div>
    </div>
  );
}
