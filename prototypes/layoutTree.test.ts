// Geometrische Prüfung des Gesamtplans: keine Linien übereinander, keine Linie durch Kästchen oder Beschriftungen.

import { describe, expect, it } from 'vitest';
import { kekule } from './data.ts';
import { BOX_H, BOX_W, layoutTree, NOTCH, type TreeLayout } from './layoutTree.ts';

interface Segment {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface Rect {
  key: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Zerlegt einen Pfad aus M/H/V-Befehlen in waagerechte und senkrechte Stücke. */
function segments(key: string, d: string): Segment[] {
  const result: Segment[] = [];
  let x = 0;
  let y = 0;
  for (const [, command, args] of d.matchAll(/([MHV])\s*([-\d.,\s]+)/g)) {
    const numbers = args!.trim().split(/[\s,]+/).map(Number);
    if (command === 'M') [x, y] = numbers as [number, number];
    if (command === 'H') {
      result.push({ key, x1: Math.min(x, numbers[0]!), x2: Math.max(x, numbers[0]!), y1: y, y2: y });
      x = numbers[0]!;
    }
    if (command === 'V') {
      result.push({ key, x1: x, x2: x, y1: Math.min(y, numbers[0]!), y2: Math.max(y, numbers[0]!) });
      y = numbers[0]!;
    }
  }
  return result.filter((s) => s.x1 !== s.x2 || s.y1 !== s.y2);
}

const EPS = 0.5;

function collinearOverlap(a: Segment, b: Segment): boolean {
  if (a.y1 === a.y2 && b.y1 === b.y2 && Math.abs(a.y1 - b.y1) < EPS) return Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > EPS;
  if (a.x1 === a.x2 && b.x1 === b.x2 && Math.abs(a.x1 - b.x1) < EPS) return Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) > EPS;
  return false;
}

/** Läuft das Stück durch das Innere des Rechtecks (Berühren der Kante zählt nicht)? */
function crosses(s: Segment, r: Rect): boolean {
  const inner = { left: r.left + 1, right: r.right - 1, top: r.top + 1, bottom: r.bottom - 1 };
  return s.x2 > inner.left && s.x1 < inner.right && s.y2 > inner.top && s.y1 < inner.bottom;
}

function check(layout: TreeLayout) {
  const all = layout.connectors.flatMap((connector) => segments(connector.key, connector.d));
  const boxes: Rect[] = layout.boxes.map((box) => ({ key: box.key, left: box.x, top: box.y, right: box.x + BOX_W, bottom: box.y + BOX_H + NOTCH }));
  const labels: Rect[] = layout.labels.map((label) => {
    const width = Math.max(...label.lines.map((line) => Math.min(line.length, 30))) * 6.4;
    return { key: label.key, left: label.x - width / 2, right: label.x + width / 2, top: label.y - 11, bottom: label.y - 11 + label.lines.length * 14 };
  });

  const overlaps: string[] = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (all[i]!.key !== all[j]!.key && collinearOverlap(all[i]!, all[j]!)) overlaps.push(`${all[i]!.key} ↔ ${all[j]!.key}`);
    }
  }
  const throughBoxes = all.flatMap((s) => boxes.filter((r) => crosses(s, r)).map((r) => `${s.key} durch ${r.key}`));
  const throughLabels = all.flatMap((s) => labels.filter((r) => crosses(s, r)).map((r) => `${s.key} durch ${r.key}`));
  const boxCollisions: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) boxCollisions.push(`${a.key} ↔ ${b.key}`);
    }
  }
  return { overlaps, throughBoxes, throughLabels, boxCollisions };
}

describe('Gesamtplan-Anordnung', () => {
  const mine = new Set(kekule.keys());

  it('hat keine überdeckten Linien, keine Linie durch Kästchen oder Beschriftung, keine überlappenden Kästchen', () => {
    expect(check(layoutTree(new Set(), mine))).toEqual({ overlaps: [], throughBoxes: [], throughLabels: [], boxCollisions: [] });
  });

  it('bleibt sauber, wenn Äste eingeklappt sind', () => {
    const layout = layoutTree(new Set(), mine);
    const someWithChildren = layout.boxes.filter((box) => box.hasChildren).slice(0, 5).map((box) => box.personId!);
    expect(check(layoutTree(new Set(someWithChildren), mine))).toEqual({ overlaps: [], throughBoxes: [], throughLabels: [], boxCollisions: [] });
  });

  it('zählt beim Einklappen alle ausgeblendeten Nachkommen', () => {
    const layout = layoutTree(new Set(), mine);
    const progenitor = layout.boxes.find((box) => box.kind === 'descendant')!;
    const collapsed = layoutTree(new Set([progenitor.personId!]), mine);
    const descendantBoxes = layout.boxes.filter((box) => box.kind === 'descendant').length;
    expect(collapsed.boxes.find((box) => box.key === progenitor.key)!.hiddenDescendants).toBe(descendantBoxes - 1);
  });
});
