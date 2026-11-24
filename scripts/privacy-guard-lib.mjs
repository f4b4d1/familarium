// Prüfregeln des Datenschutz-Wächters (ADR 0001).
// Reine Funktionen ohne Git- oder Dateizugriff, damit sie testbar sind.

const UMLAUT_VARIANTS = {
  ä: ['ä', 'ae', 'a'],
  ö: ['ö', 'oe', 'o'],
  ü: ['ü', 'ue', 'u'],
  ß: ['ß', 'ss'],
};

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tif', '.tiff', '.heic', '.heif', '.bmp'];
const DOCUMENT_EXTENSIONS = ['.pdf', '.ged', '.gedcom', '.zip'];

const MEDIA_RULES = [
  { label: 'Bilddatei', extensions: IMAGE_EXTENSIONS, allowedDirs: ['demo/', 'public/', 'src/assets/'] },
  { label: 'Dokument oder Archiv', extensions: DOCUMENT_EXTENSIONS, allowedDirs: ['demo/'] },
];

/** Liest die Sperrliste: ein Begriff pro Zeile, `#` leitet einen Kommentar ein. */
export function parseBlocklist(text) {
  const terms = text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean);
  return [...new Set(terms)];
}

/** Alle Schreibweisen eines Begriffs mit aufgelösten Umlauten, z. B. „Mühle" → mühle, muehle, muhle. */
export function expandVariants(term) {
  let variants = [''];
  for (const char of term.toLowerCase()) {
    const options = UMLAUT_VARIANTS[char] ?? [char];
    variants = variants.flatMap((prefix) => options.map((option) => prefix + option));
  }
  return [...new Set(variants)];
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Baut einen Sucher für die Sperrliste. Ein Begriff trifft nur als ganzes Wort
 * (optional mit Genitiv-s), damit z. B. „Ole" nicht in „Oleander" anschlägt.
 */
export function createMatcher(terms) {
  const variantToTerm = new Map();
  for (const term of terms) {
    for (const variant of expandVariants(term)) {
      if (!variantToTerm.has(variant)) variantToTerm.set(variant, term);
    }
  }
  if (variantToTerm.size === 0) return { findHits: () => [] };

  const alternation = [...variantToTerm.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
  const pattern = new RegExp(`(?<!\\p{L})(${alternation})s?(?!\\p{L})`, 'giu');

  /** Liefert alle Treffer mit Zeilennummer (ab 1) und dem Begriff aus der Sperrliste. */
  function findHits(text) {
    const hits = [];
    text.split(/\r?\n/).forEach((line, index) => {
      pattern.lastIndex = 0;
      for (const match of line.matchAll(pattern)) {
        hits.push({ line: index + 1, term: variantToTerm.get(match[1].toLowerCase()) ?? match[1] });
      }
    });
    return hits;
  }

  return { findHits };
}

/** Prüft einen Dateipfad (mit `/` getrennt, relativ zum Repo) und liefert gefundene Probleme. */
export function checkPath(path) {
  const normalized = path.replace(/\\/g, '/');
  const lower = normalized.toLowerCase();
  const problems = [];

  if (lower === 'private' || lower.startsWith('private/')) {
    problems.push('liegt in private/ und gehört nie ins Repo');
  }

  for (const rule of MEDIA_RULES) {
    if (rule.extensions.some((ext) => lower.endsWith(ext))) {
      const allowed = rule.allowedDirs.some((dir) => lower.startsWith(dir));
      if (!allowed) {
        problems.push(`${rule.label} außerhalb von ${rule.allowedDirs.join(', ')}`);
      }
    }
  }

  return problems;
}

/** Binärdateien erkennt man an einem Null-Byte am Anfang; ihr Inhalt wird nicht durchsucht. */
export function isBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0);
}

/** Entfernt Kommentarzeilen, die Git in die Commit-Nachricht schreibt. */
export function stripCommitComments(message) {
  return message
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('#'))
    .join('\n');
}
