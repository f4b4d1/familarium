// Generationen eines Stammes: Stammvater = I, Nachkommen fortlaufend,
// Eingeheiratete in der Generation ihres Partners, Vorfahren des Stammvaters „vor I (n)".

import type { DatasetIndex } from './dataset.ts';

/** Generation als Zahl: 1 = I, 2 = II …; 0 = „vor I (1)", −1 = „vor I (2)" … */
export type GenerationNumber = number;

export function computeGenerations(index: DatasetIndex, lineageId: string): Map<string, GenerationNumber> {
  const lineage = index.dataset.lineages.find((candidate) => candidate.id === lineageId);
  if (!lineage) throw new Error(`Unbekannter Stamm: ${lineageId}`);

  const generations = new Map<string, GenerationNumber>();
  const queue: string[] = [lineage.progenitorId];
  generations.set(lineage.progenitorId, 1);

  // Nachkommen: Breitensuche, damit jede Person die kleinste Generation bekommt.
  while (queue.length > 0) {
    const personId = queue.shift()!;
    const generation = generations.get(personId)!;
    for (const partnership of index.partnershipsOf(personId)) {
      const partnerId = index.partnerOf(partnership, personId);
      if (partnerId && !generations.has(partnerId)) generations.set(partnerId, generation);
      for (const child of partnership.children) {
        if (child.status === 'rejected' || generations.has(child.childId)) continue;
        generations.set(child.childId, generation + 1);
        queue.push(child.childId);
      }
    }
  }

  // Vorfahren des Stammvaters: rückwärts zählen.
  const ancestorQueue: string[] = [lineage.progenitorId];
  while (ancestorQueue.length > 0) {
    const personId = ancestorQueue.shift()!;
    const generation = generations.get(personId)!;
    for (const { partnership } of index.parentLinksOf(personId)) {
      for (const parentId of partnership.partners) {
        if (!parentId || generations.has(parentId)) continue;
        generations.set(parentId, generation - 1);
        ancestorQueue.push(parentId);
      }
    }
  }

  return generations;
}

const ROMAN: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

export function toRoman(value: number): string {
  let rest = value;
  let result = '';
  for (const [amount, symbol] of ROMAN) {
    while (rest >= amount) {
      result += symbol;
      rest -= amount;
    }
  }
  return result;
}

export function formatGeneration(generation: GenerationNumber): string {
  return generation >= 1 ? toRoman(generation) : `vor I (${1 - generation})`;
}
