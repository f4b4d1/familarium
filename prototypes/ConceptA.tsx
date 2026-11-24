// Entwurf A „Gesamtplan": der ganze Stamm wie im Original, mit Generationsbändern, Zoom und Übersichtskarte.

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatGeneration } from '../src/domain/generations.ts';
import { kekule, KIND_LABEL, probandId, searchablePersons, summary } from './data.ts';
import { BOX_H, BOX_W, boxPath, layoutTree, ROW_H, type Box } from './layoutTree.ts';
import { usePanZoom } from './usePanZoom.ts';

const BAND_LABEL_W = 150;

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function PersonBox({ box, selected, mine, onSelect, onToggle, canCollapse, overview }: {
  box: Box;
  selected: boolean;
  mine: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  canCollapse: boolean;
  overview: boolean;
}) {
  // Übersicht (weit herausgezoomt): nur der Vorname, groß, damit man sich orientieren kann.
  if (overview) {
    const label = box.personId ? summary(box.personId).given.split(' ')[0]! : '?';
    const classes = ['box', box.kind, selected ? 'selected' : '', mine ? 'mine' : ''].filter(Boolean).join(' ');
    return (
      <g
        transform={`translate(${box.x},${box.y})`}
        className={classes}
        onClick={(event) => {
          event.stopPropagation();
          if (box.personId) onSelect(box.personId);
        }}
      >
        <path d={boxPath()} />
        <text x={BOX_W / 2} y={BOX_H / 2 + 12} textAnchor="middle" className="box-overview">
          {clip(label, 9)}
        </text>
      </g>
    );
  }
  if (!box.personId) {
    return (
      <g transform={`translate(${box.x},${box.y})`} className="box unknown">
        <path d={boxPath()} />
        <text x={BOX_W / 2} y={BOX_H / 2 + 5} textAnchor="middle" className="box-sub">
          Partner unbekannt
        </text>
      </g>
    );
  }
  const s = summary(box.personId);
  const classes = ['box', box.kind, selected ? 'selected' : '', mine ? 'mine' : '', s.suggested ? 'suggested' : '', s.mentioned ? 'mentioned' : '']
    .filter(Boolean)
    .join(' ');
  const third =
    box.kind === 'reference'
      ? '↗ steht in eigener Linie'
      : box.kind === 'ancestor'
        ? 'Vorschlag · vor I'
        : [KIND_LABEL[box.childKind ?? ''], s.occupation].filter(Boolean).join(' · ') || (s.died ? `† ${s.died}` : '');
  return (
    <g
      transform={`translate(${box.x},${box.y})`}
      className={classes}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(box.personId!);
      }}
    >
      <title>{`${s.name}${s.born ? `\n* ${s.born}` : ''}${s.died ? `\n† ${s.died}` : ''}`}</title>
      <path d={boxPath()} />
      {s.kekule.length ? (
        <text x={BOX_W - 8} y={15} textAnchor="end" className="box-kekule">
          {s.kekule.length > 1 ? `Nr. ${s.kekule[0]} +${s.kekule.length - 1}` : `Nr. ${s.kekule[0]}`}
        </text>
      ) : null}
      {s.protected ? (
        <text x={8} y={15} className="box-lock">
          🔒
        </text>
      ) : null}
      <text x={BOX_W / 2} y={30} textAnchor="middle" className="box-name">
        {clip(s.name, 24)}
      </text>
      <text x={BOX_W / 2} y={48} textAnchor="middle" className="box-sub">
        {clip(s.born ? `* ${s.born}` : s.birthSurname ? `geb. ${s.birthSurname}` : '', 30)}
      </text>
      <text x={BOX_W / 2} y={64} textAnchor="middle" className="box-sub">
        {clip(third || (s.died ? `† ${s.died}` : ''), 30)}
      </text>
      {s.needsReview ? <circle cx={BOX_W - 10} cy={BOX_H - 10} r={4} className="box-review" /> : null}
      {canCollapse ? (
        <g
          className="toggle"
          transform={`translate(${BOX_W / 2},${BOX_H + 22})`}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(box.personId!);
          }}
        >
          <circle r={9} />
          <text y={4} textAnchor="middle">
            {box.hiddenChildren ? '+' : '−'}
          </text>
        </g>
      ) : null}
      {box.hiddenChildren ? (
        <text x={BOX_W / 2 + 14} y={BOX_H + 26} className="box-sub">
          {box.hiddenChildren} Kinder
        </text>
      ) : null}
    </g>
  );
}

export function ConceptA({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showMine, setShowMine] = useState(true);
  const [query, setQuery] = useState('');
  const mine = useMemo(() => (showMine ? new Set(kekule.keys()) : new Set<string>()), [showMine]);
  const layout = useMemo(() => layoutTree(collapsed, mine), [collapsed, mine]);
  const svgRef = useRef<SVGSVGElement>(null);
  const bounds = useMemo(
    () => ({
      minX: layout.minX - BAND_LABEL_W - 40,
      minY: -40,
      maxX: layout.maxX + 40,
      maxY: layout.rowY(layout.maxGeneration) + ROW_H,
    }),
    [layout],
  );
  const { view, size, ready, handlers, fit, centerOn, showTop, zoomAt } = usePanZoom(svgRef, bounds);
  const started = useRef(false);
  const overview = view.k < 0.45;

  // Start oben beim Stammvater, lesbar groß, wie man das Original von oben liest.
  useEffect(() => {
    if (started.current || !ready) return;
    started.current = true;
    if (new URLSearchParams(location.search).get('ansicht') === 'ganz') return fit();
    const top = layout.boxes.find((box) => box.kind === 'ancestor') ?? layout.boxes.find((box) => box.kind === 'descendant')!;
    showTop(top.x + BOX_W / 2, top.y - 50, 0.85);
    started.current = true;
  }, [ready, layout, showTop]);

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const jumpTo = (id: string) => {
    const box = layout.boxes.find((candidate) => candidate.personId === id && candidate.kind !== 'reference');
    if (box) centerOn(box.x + BOX_W / 2, box.y + BOX_H / 2, 1);
    onSelect(id);
  };

  const persons = useMemo(() => searchablePersons(), []);
  const matches = query.length >= 2 ? persons.filter((s) => s.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8) : [];
  const generationsRange = Array.from({ length: layout.maxGeneration - layout.minGeneration + 1 }, (_, i) => layout.minGeneration + i);

  // Übersichtskarte
  const miniW = 220;
  const miniScale = miniW / (bounds.maxX - bounds.minX);
  const miniH = (bounds.maxY - bounds.minY) * miniScale;
  const viewport = {
    x: (-view.x / view.k - bounds.minX) * miniScale,
    y: (-view.y / view.k - bounds.minY) * miniScale,
    w: (size.width / view.k) * miniScale,
    h: (size.height / view.k) * miniScale,
  };

  return (
    <div className="concept-a">
      <div className="toolbar">
        <div className="search">
          <input placeholder="Person suchen …" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Person suchen" />
          {matches.length > 0 ? (
            <ul className="search-results">
              {matches.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => {
                      jumpTo(s.id);
                      setQuery('');
                    }}
                  >
                    {s.name} <span className="muted">{s.generationLabel ? `· ${s.generationLabel}` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <label className="check">
          <input type="checkbox" checked={showMine} onChange={(event) => setShowMine(event.target.checked)} /> Meine Linie hervorheben
        </label>
        <button className="tool" onClick={() => zoomAt(1.25, size.width / 2, size.height / 2)} aria-label="Hineinzoomen">
          +
        </button>
        <button className="tool" onClick={() => zoomAt(0.8, size.width / 2, size.height / 2)} aria-label="Herauszoomen">
          −
        </button>
        <button className="tool wide" onClick={fit}>
          Ganzer Baum
        </button>
        <button className="tool wide" onClick={() => jumpTo(probandId)}>
          Zu mir
        </button>
      </div>

      <svg ref={svgRef} className="tree" {...handlers}>
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {generationsRange.map((generation, i) => (
            <g key={generation}>
              <rect
                className={i % 2 === 0 ? 'band' : 'band alt'}
                x={bounds.minX}
                y={layout.rowY(generation) - 40}
                width={bounds.maxX - bounds.minX}
                height={ROW_H}
              />
              <text className="band-label" x={layout.minX - BAND_LABEL_W} y={layout.rowY(generation) + BOX_H / 2}>
                {generation >= 1 ? `${formatGeneration(generation)}. Generation` : formatGeneration(generation)}
              </text>
            </g>
          ))}
          {layout.connectors.map((connector) => (
            <path key={connector.key} d={connector.d} className={`connector${connector.mine ? ' mine' : ''}${connector.dashed ? ' dashed' : ''}`} />
          ))}
          {layout.dots.map((dot) => (
            <circle key={dot.key} cx={dot.x} cy={dot.y} r={5} className={`knot${dot.mine ? ' mine' : ''}`} />
          ))}
          {layout.labels.map((label) => (
            <text key={label.key} x={label.x} y={label.y} textAnchor="middle" className="knot-label">
              {label.text}
            </text>
          ))}
          {layout.boxes.map((box) => (
            <PersonBox
              key={box.key}
              box={box}
              selected={box.personId === selected}
              mine={!!box.personId && mine.has(box.personId)}
              onSelect={onSelect}
              onToggle={toggle}
              canCollapse={box.kind === 'descendant' && !!box.hasChildren}
              overview={overview}
            />
          ))}
        </g>
      </svg>

      <svg
        className="minimap"
        width={miniW}
        height={miniH}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          centerOn((event.clientX - rect.left) / miniScale + bounds.minX, (event.clientY - rect.top) / miniScale + bounds.minY, view.k);
        }}
        aria-label="Übersichtskarte"
      >
        {layout.boxes.map((box) => (
          <rect
            key={box.key}
            x={(box.x - bounds.minX) * miniScale}
            y={(box.y - bounds.minY) * miniScale}
            width={Math.max(1.5, BOX_W * miniScale)}
            height={Math.max(1.5, BOX_H * miniScale)}
            className={box.personId && mine.has(box.personId) ? 'mini mine' : 'mini'}
          />
        ))}
        <rect className="viewport" x={viewport.x} y={viewport.y} width={viewport.w} height={viewport.h} />
      </svg>
    </div>
  );
}
