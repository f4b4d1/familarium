import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { displayName, findBrokenReferences, formatName, indexDataset } from '../src/domain/dataset.ts';
import { computeGenerations, formatGeneration } from '../src/domain/generations.ts';
import { computeKekuleNumbers } from '../src/domain/kekule.ts';
import { protectionOf } from '../src/domain/protection.ts';
import { Dataset } from '../src/domain/schema.ts';

const dataset = Dataset.parse(JSON.parse(readFileSync(new URL('./demo-stammbaum.json', import.meta.url), 'utf8')));
const index = indexDataset(dataset);
const today = new Date('2026-11-24');

function find(fullName: string): string {
  const matches = dataset.persons.filter((person) => formatName(displayName(person)) === fullName);
  if (matches.length !== 1) throw new Error(`${fullName}: ${matches.length} Treffer`);
  return matches[0]!.id;
}

describe('Demo-Stammbaum', () => {
  it('ist gültig und hat keine kaputten Verweise', () => {
    expect(findBrokenReferences(dataset)).toEqual([]);
    expect(dataset.persons.length).toBeGreaterThan(80);
  });

  it('reicht vom Stammvater (I) bis Generation XVI, mit „vor I" für den Vorschlag', () => {
    const generations = computeGenerations(index, dataset.lineages[0]!.id);
    expect(formatGeneration(generations.get(find('Jost Haferkamp'))!)).toBe('I');
    expect(formatGeneration(generations.get(dataset.probandId!)!)).toBe('XV');
    expect(formatGeneration(generations.get(find('Paul Haferkamp'))!)).toBe('XVI');
    expect(formatGeneration(generations.get(find('Veit Haverkamp'))!)).toBe('vor I (1)');
  });

  it('enthält Ahnenschwund: der Sohn des Stammvaters hat zwei Ahnennummern', () => {
    const numbers = computeKekuleNumbers(index, dataset.probandId!);
    expect(numbers.get(find('Hans Haferkamp'))).toEqual([8192, 8320]);
    expect(numbers.get(find('Kerstin Albers'))).toEqual([3]);
    expect(numbers.get(find('Hinrich Lorenzen'))).toEqual([12]);
  });

  it('macht Stiefkinder, Adoptierte und unbestätigte Vorschläge nicht zu Ahnen', () => {
    const numbers = computeKekuleNumbers(index, dataset.probandId!);
    expect(numbers.has(find('Lea Schmid'))).toBe(false);
    expect(numbers.has(find('Veit Haverkamp'))).toBe(false);
  });

  it('schützt Lebende und kürzlich Verstorbene, gibt alte Ahnen frei', () => {
    expect(protectionOf(index, dataset.probandId!, today).protected).toBe(true);
    expect(protectionOf(index, find('Gerd Haferkamp'), today).reason).toBe('died-recently');
    expect(protectionOf(index, find('Walter Haferkamp'), today).protected).toBe(false);
    expect(protectionOf(index, find('Jost Haferkamp'), today).protected).toBe(false);
  });

  it('enthält eine unsichere Lesung und widersprüchliche Angaben', () => {
    const claims = dataset.partnerships.flatMap((p) => p.events.flatMap((e) => e.claims));
    expect(claims.some((claim) => claim.needsReview && claim.verbatimAlternatives?.length)).toBe(true);
    const johannFriedrich = index.person(find('Johann Friedrich Haferkamp'))!;
    expect(johannFriedrich.events.find((e) => e.type === 'birth')!.claims).toHaveLength(2);
  });
});
