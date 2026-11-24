import { describe, expect, it } from 'vitest';
import {
  checkPath,
  createMatcher,
  expandVariants,
  isBinary,
  parseBlocklist,
  stripCommitComments,
} from './privacy-guard-lib.mjs';

// Alle Namen hier sind erfunden. Echte Familiennamen dürfen auch in Tests nicht vorkommen.

describe('parseBlocklist', () => {
  it('ignoriert Leerzeilen und Kommentare und entfernt Doppelte', () => {
    const text = '# Nachnamen\nZwiebelmann\n\n  Quastbeck  # aus dem Original\nZwiebelmann\r\n';
    expect(parseBlocklist(text)).toEqual(['Zwiebelmann', 'Quastbeck']);
  });
});

describe('expandVariants', () => {
  it('löst Umlaute in alle üblichen Schreibweisen auf', () => {
    expect(expandVariants('Mühlbrück')).toEqual(
      expect.arrayContaining(['mühlbrück', 'muehlbrueck', 'muhlbruck', 'muehlbrück']),
    );
  });

  it('löst ß als ss auf', () => {
    expect(expandVariants('Großhausen')).toEqual(expect.arrayContaining(['großhausen', 'grosshausen']));
  });
});

describe('createMatcher', () => {
  const matcher = createMatcher(['Zwiebelmann', 'Mühlbrück', 'Ole']);

  it('findet Begriffe unabhängig von Groß- und Kleinschreibung, mit Zeilennummer', () => {
    expect(matcher.findHits('erste Zeile\nvon ZWIEBELMANN geschrieben')).toEqual([
      { line: 2, term: 'Zwiebelmann' },
    ]);
  });

  it('findet Namen in E-Mail-Adressen', () => {
    expect(matcher.findHits('Max Muster <max.zwiebelmann@example.org>')).toEqual([
      { line: 1, term: 'Zwiebelmann' },
    ]);
  });

  it('findet Umlaut-Umschreibungen und den Genitiv', () => {
    const hits = matcher.findHits('Muehlbrueck und Zwiebelmanns Hof');
    expect(hits.map((hit) => hit.term)).toEqual(['Mühlbrück', 'Zwiebelmann']);
  });

  it('schlägt nicht innerhalb längerer Wörter an', () => {
    expect(matcher.findHits('Der Oleander und die Zwiebelmannschaft')).toEqual([]);
  });

  it('findet nichts bei leerer Sperrliste', () => {
    expect(createMatcher([]).findHits('Zwiebelmann')).toEqual([]);
  });
});

describe('checkPath', () => {
  it('verbietet alles unter private/, unabhängig von der Schreibweise', () => {
    expect(checkPath('private/daten/familie.json')).not.toEqual([]);
    expect(checkPath('Private/notiz.md')).not.toEqual([]);
  });

  it('erlaubt Bilder nur in demo/, public/ und src/assets/', () => {
    expect(checkPath('demo/wappen.png')).toEqual([]);
    expect(checkPath('public/favicon.png')).toEqual([]);
    expect(checkPath('src/assets/papier.webp')).toEqual([]);
    expect(checkPath('docs/foto.JPG')).not.toEqual([]);
  });

  it('erlaubt GEDCOM, PDF und ZIP nur in demo/', () => {
    expect(checkPath('demo/beispiel.ged')).toEqual([]);
    expect(checkPath('public/export.ged')).not.toEqual([]);
    expect(checkPath('sicherung.zip')).not.toEqual([]);
  });

  it('lässt normale Quelltexte und Dokumente durch', () => {
    expect(checkPath('src/app.tsx')).toEqual([]);
    expect(checkPath('docs/adr/0001-beispiel.md')).toEqual([]);
  });
});

describe('isBinary', () => {
  it('erkennt Binärdateien am Null-Byte', () => {
    expect(isBinary(Buffer.from([0x89, 0x50, 0x00, 0x47]))).toBe(true);
    expect(isBinary(Buffer.from('reiner Text', 'utf8'))).toBe(false);
  });
});

describe('stripCommitComments', () => {
  it('entfernt die Kommentarzeilen von Git', () => {
    expect(stripCommitComments('Neue Ansicht\n# Bitte Nachricht eingeben\n')).toBe('Neue Ansicht\n');
  });
});
