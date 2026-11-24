// Ahnennummern nach Kekulé: Proband = 1, Vater = 2n, Mutter = 2n + 1.
// Bei Ahnenschwund bekommt dieselbe Person mehrere Nummern.

import type { DatasetIndex } from './dataset.ts';

/** Nur leibliche (oder ungeklärte) Elternschaft begründet Ahnen. */
const ANCESTRAL_KINDS = new Set(['biological', 'unknown']);

/** Schutz gegen fehlerhafte Daten mit Kreisen. */
const MAX_GENERATIONS = 40;

export function computeKekuleNumbers(index: DatasetIndex, probandId: string): Map<string, number[]> {
  const numbers = new Map<string, number[]>();

  const visit = (personId: string, number: number, depth: number) => {
    numbers.set(personId, [...(numbers.get(personId) ?? []), number]);
    if (depth >= MAX_GENERATIONS) return;

    const link = index
      .parentLinksOf(personId)
      .find(({ parentage }) => parentage.status === 'accepted' && ANCESTRAL_KINDS.has(parentage.kind));
    if (!link) return;

    const [first, second] = link.partnership.partners;
    const firstPerson = first ? index.person(first) : undefined;
    const secondPerson = second ? index.person(second) : undefined;
    // Vater bekommt 2n, Mutter 2n + 1. Bei unbekanntem Geschlecht zählt die Reihenfolge.
    const firstIsMother = firstPerson?.sex === 'f' || secondPerson?.sex === 'm';
    const father = firstIsMother ? second : first;
    const mother = firstIsMother ? first : second;
    if (father) visit(father, number * 2, depth + 1);
    if (mother) visit(mother, number * 2 + 1, depth + 1);
  };

  visit(probandId, 1, 0);
  for (const list of numbers.values()) list.sort((a, b) => a - b);
  return numbers;
}

/** Generation relativ zum Probanden: Nummer 1 → 1, 2–3 → 2, 4–7 → 3 … */
export function kekuleGeneration(number: number): number {
  return Math.floor(Math.log2(number)) + 1;
}
