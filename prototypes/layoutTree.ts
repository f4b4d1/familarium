// Anordnung des Gesamtplans: Nachkommen des Stammvaters in Generationsbändern, Partner daneben, Kinder darunter.
//
// Linienführung (damit sich keine Linien überdecken und keine Schrift unter einer Linie liegt):
// - Ehe: waagerechte Linie zwischen den benachbarten Kästchen, mit Ehe-Knoten in der Lücke (wie „●✕" im Original).
// - Vom Knoten senkrecht durch die Lücke nach unten zur Kinderleiste; jede Ehe einer Person hat eine eigene Leistenhöhe.
// - Beschriftung der Ehe steht unter dem Partner-Kästchen, wo keine Linie verläuft.

import type { Partnership } from '../src/domain/schema.ts';
import { childrenOf, descendants, generations, index, lineage, marriageText, ordinal, partnershipsSorted } from './data.ts';

export const BOX_W = 176;
export const BOX_H = 74;
export const NOTCH = 8;
const GAP = 22;
const PARTNER_GAP = 40;
export const ROW_H = 200;
const BAR_STEP = 12;

export type BoxKind = 'descendant' | 'partner' | 'reference' | 'unknown' | 'ancestor';

export interface Box {
  key: string;
  personId: string | null;
  kind: BoxKind;
  x: number;
  y: number;
  childKind?: string;
  hasChildren?: boolean;
  /** Anzahl ausgeblendeter Nachkommen, wenn eingeklappt. */
  hiddenDescendants?: number;
}

export interface Connector {
  key: string;
  d: string;
  mine: boolean;
  dashed?: boolean;
}

export interface Label {
  key: string;
  x: number;
  y: number;
  lines: string[];
}

export interface TreeLayout {
  boxes: Box[];
  connectors: Connector[];
  labels: Label[];
  dots: { key: string; x: number; y: number; mine: boolean }[];
  minGeneration: number;
  maxGeneration: number;
  minX: number;
  maxX: number;
  rowY: (generation: number) => number;
}

/** Jede Partnerschaft wird genau einmal gezeichnet: beim Nachkommen, bevorzugt beim Mann (wie im Original). */
function owners(): Map<string, string> {
  const result = new Map<string, string>();
  for (const partnership of index.dataset.partnerships) {
    const candidates = partnership.partners.filter((id): id is string => !!id && descendants.has(id));
    if (candidates.length === 0) continue;
    const male = candidates.find((id) => index.person(id)?.sex === 'm');
    result.set(partnership.id, male ?? candidates[0]!);
  }
  return result;
}

export function layoutTree(collapsed: ReadonlySet<string>, mine: ReadonlySet<string>): TreeLayout {
  const owner = owners();
  const owned = (personId: string): Partnership[] =>
    partnershipsSorted(personId).filter((partnership) => owner.get(partnership.id) === personId);

  const minGeneration = Math.min(...generations.values());
  const maxGeneration = Math.max(...generations.values());
  const rowY = (generation: number) => (generation - minGeneration) * ROW_H;

  const countDescendants = (personId: string): number =>
    owned(personId).reduce(
      (sum, partnership) => sum + childrenOf(partnership).reduce((inner, child) => inner + 1 + countDescendants(child.id), 0),
      0,
    );

  const widths = new Map<string, number>();
  const groupWidth = (partnership: Partnership): number => {
    const children = childrenOf(partnership);
    if (children.length === 0) return BOX_W;
    const total = children.reduce((sum, child) => sum + measure(child.id), 0) + GAP * (children.length - 1);
    return Math.max(BOX_W, total);
  };
  function measure(personId: string): number {
    const cached = widths.get(personId);
    if (cached !== undefined) return cached;
    const partnerships = owned(personId);
    const rowWidth = (partnerships.length + 1) * BOX_W + partnerships.length * PARTNER_GAP;
    const hasChildren = partnerships.some((partnership) => childrenOf(partnership).length > 0);
    let width = rowWidth;
    if (hasChildren && !collapsed.has(personId)) {
      const groups = partnerships.reduce((sum, partnership) => sum + groupWidth(partnership), 0) + GAP * (partnerships.length - 1);
      width = Math.max(rowWidth, groups);
    }
    widths.set(personId, width);
    return width;
  }

  const layout: TreeLayout = { boxes: [], connectors: [], labels: [], dots: [], minGeneration, maxGeneration, minX: 0, maxX: 0, rowY };

  function place(personId: string, left: number, generation: number, childKind?: string): Box {
    const width = measure(personId);
    const y = rowY(generation);
    const partnerships = owned(personId);
    const rowWidth = (partnerships.length + 1) * BOX_W + partnerships.length * PARTNER_GAP;
    const rowLeft = left + (width - rowWidth) / 2;

    // Bei zwei Ehen steht die Person in der Mitte (I. Ehe links, II. Ehe rechts), sonst links.
    const slots: (Partnership | 'self')[] = partnerships.length === 2 ? [partnerships[0]!, 'self', partnerships[1]!] : ['self', ...partnerships];
    const slotX = (slot: Partnership | 'self') => rowLeft + slots.indexOf(slot) * (BOX_W + PARTNER_GAP);
    const selfX = slotX('self');
    const hasChildren = partnerships.some((partnership) => childrenOf(partnership).length > 0);
    const isCollapsed = collapsed.has(personId) && hasChildren;
    const self: Box = {
      key: `d-${personId}`,
      personId,
      kind: 'descendant',
      x: selfX,
      y,
      childKind,
      hasChildren,
      hiddenDescendants: isCollapsed ? countDescendants(personId) : undefined,
    };
    layout.boxes.push(self);

    const groupsWidth = partnerships.reduce((sum, partnership) => sum + groupWidth(partnership), 0) + GAP * (partnerships.length - 1);
    let groupLeft = left + (width - groupsWidth) / 2;
    const midY = y + BOX_H / 2;

    partnerships.forEach((partnership, i) => {
      const partnerId = index.partnerOf(partnership, personId);
      const px = slotX(partnership);
      const kind: BoxKind = !partnerId ? 'unknown' : descendants.has(partnerId) ? 'reference' : 'partner';
      layout.boxes.push({ key: `p-${partnership.id}`, personId: partnerId, kind, x: px, y });

      const coupleMine = mine.has(personId) && !!partnerId && mine.has(partnerId);
      const adjacent = Math.abs(slots.indexOf('self') - slots.indexOf(partnership)) === 1;
      let knotX: number;
      let knotY: number;
      if (adjacent) {
        const leftX = Math.min(selfX, px);
        knotX = leftX + BOX_W + PARTNER_GAP / 2;
        knotY = midY;
        layout.connectors.push({
          key: `m-${partnership.id}`,
          d: `M${leftX + BOX_W},${midY} H${leftX + BOX_W + PARTNER_GAP}`,
          mine: coupleMine,
          dashed: partnership.kind !== 'marriage',
        });
      } else {
        // Ab drei Ehen: Verbindung unter den Kästchen, je Ehe auf eigener Höhe.
        knotX = px - PARTNER_GAP / 2;
        knotY = y + BOX_H + NOTCH + 8 + i * 8;
        layout.connectors.push({
          key: `m-${partnership.id}`,
          d: `M${selfX + BOX_W / 2 + i * 6},${y + BOX_H + NOTCH} V${knotY} H${knotX} V${midY} H${px}`,
          mine: coupleMine,
          dashed: partnership.kind !== 'marriage',
        });
      }
      layout.dots.push({ key: `k-${partnership.id}`, x: knotX, y: knotY, mine: coupleMine });

      const lines = [partnerships.length > 1 ? `${ordinal(i + 1)}. Ehe` : '', marriageText(partnership) ?? ''].filter(Boolean);
      if (lines.length > 0) layout.labels.push({ key: `l-${partnership.id}`, x: px + BOX_W / 2, y: y + BOX_H + NOTCH + 18, lines });

      const children = childrenOf(partnership);
      const gw = groupWidth(partnership);
      if (children.length > 0 && !collapsed.has(personId)) {
        const childrenWidth = children.reduce((sum, child) => sum + measure(child.id), 0) + GAP * (children.length - 1);
        let childLeft = groupLeft + (gw - childrenWidth) / 2;
        const barY = rowY(generation + 1) - 30 - i * BAR_STEP;
        const centers: number[] = [];
        for (const child of children) {
          const childWidth = measure(child.id);
          const childBox = place(child.id, childLeft, generation + 1, child.kind);
          const cx = childBox.x + BOX_W / 2;
          centers.push(cx);
          layout.connectors.push({
            key: `c-${partnership.id}-${child.id}`,
            d: `M${cx},${barY} V${rowY(generation + 1)}`,
            mine: mine.has(child.id) && coupleMine,
            dashed: child.kind !== 'biological' || child.suggested,
          });
          childLeft += childWidth + GAP;
        }
        const anyMine = children.some((child) => mine.has(child.id)) && coupleMine;
        layout.connectors.push({
          key: `b-${partnership.id}`,
          d: `M${knotX},${knotY} V${barY} M${Math.min(knotX, ...centers)},${barY} H${Math.max(knotX, ...centers)}`,
          mine: anyMine,
        });
      }
      groupLeft += gw + GAP;
    });
    return self;
  }

  place(lineage.progenitorId, 0, 1);

  // Vorfahren des Stammvaters („vor I") über ihm.
  let current = lineage.progenitorId;
  let generation = 1;
  for (;;) {
    const link = index.parentLinksOf(current)[0];
    const parentId = link?.partnership.partners.find((id): id is string => !!id);
    if (!parentId) break;
    const currentBox = layout.boxes.find((box) => box.personId === current && box.kind !== 'reference')!;
    generation -= 1;
    const y = rowY(generation);
    layout.boxes.push({ key: `a-${parentId}`, personId: parentId, kind: 'ancestor', x: currentBox.x, y });
    const cx = currentBox.x + BOX_W / 2;
    layout.connectors.push({ key: `a-${parentId}`, d: `M${cx},${y + BOX_H + NOTCH} V${currentBox.y}`, mine: false, dashed: true });
    current = parentId;
  }

  layout.minX = Math.min(...layout.boxes.map((box) => box.x));
  layout.maxX = Math.max(...layout.boxes.map((box) => box.x + BOX_W));
  return layout;
}

/** Kästchen mit Spitze unten, wie im Original. */
export function boxPath(w = BOX_W, h = BOX_H, notch = NOTCH, r = 10): string {
  const mid = w / 2;
  return [
    `M${r},0 H${w - r} Q${w},0 ${w},${r}`,
    `V${h - r} Q${w},${h} ${w - r},${h}`,
    `H${mid + notch} L${mid},${h + notch} L${mid - notch},${h}`,
    `H${r} Q0,${h} 0,${h - r} V${r} Q0,0 ${r},0 Z`,
  ].join(' ');
}
