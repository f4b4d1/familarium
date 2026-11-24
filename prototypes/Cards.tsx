// Personenkarte für die Entwürfe B und C.

import { KIND_LABEL, lifeSpan, summary } from './data.ts';

export function PersonCard({ id, onClick, focus, mine, kind, compact }: {
  id: string;
  onClick?: (id: string) => void;
  focus?: boolean;
  mine?: boolean;
  kind?: string;
  compact?: boolean;
}) {
  const s = summary(id);
  const classes = ['card', focus ? 'focus' : '', mine ? 'mine' : '', s.suggested ? 'suggested' : '', compact ? 'compact' : ''].filter(Boolean).join(' ');
  return (
    <button className={classes} onClick={() => onClick?.(id)} type="button">
      <div className="card-top">
        {s.generationLabel ? <span className="gen">{s.generationLabel}</span> : null}
        {s.kekule.length ? <span className="kek">Nr. {s.kekule.join(' / ')}</span> : null}
        {s.protected ? <span title="geschützt: wird nie extern recherchiert">🔒</span> : null}
      </div>
      <div className="name">{s.name}</div>
      {s.birthSurname ? <div className="dates">geb. {s.birthSurname}</div> : null}
      {!compact ? <div className="dates">{lifeSpan(s) || 'Lebensdaten unbekannt'}</div> : null}
      {!compact && s.occupation ? <div className="dates">{s.occupation}</div> : null}
      <div className="tags">
        {kind && KIND_LABEL[kind] ? <span className="badge">{KIND_LABEL[kind]}</span> : null}
        {s.suggested ? <span className="badge warn">Vorschlag</span> : null}
        {s.mentioned ? <span className="badge">nur erwähnt</span> : null}
        {s.needsReview ? <span className="badge warn">Lesung prüfen</span> : null}
      </div>
    </button>
  );
}

export function UnknownCard({ label = 'unbekannt' }: { label?: string }) {
  return (
    <div className="card ghost">
      <div className="name muted">{label}</div>
    </div>
  );
}
