#!/usr/bin/env node
// Datenschutz-Wächter (ADR 0001): bricht Commits ab, die persönliche Daten enthalten.
//
// Aufrufe:
//   node scripts/privacy-guard.mjs pre-commit          vorgemerkte Dateien und Absender prüfen
//   node scripts/privacy-guard.mjs commit-msg <datei>  Commit-Nachricht prüfen
//   node scripts/privacy-guard.mjs audit               alle Dateien im Repo prüfen

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  checkPath,
  createMatcher,
  isBinary,
  parseBlocklist,
  stripCommitComments,
} from './privacy-guard-lib.mjs';

function git(args, encoding = 'utf8') {
  return execFileSync('git', args, { encoding, maxBuffer: 256 * 1024 * 1024 });
}

const root = git(['rev-parse', '--show-toplevel']).trim();

function loadMatcher() {
  const privateDir = join(root, 'private');
  const blocklistFile = join(privateDir, 'sperrliste.txt');
  if (existsSync(blocklistFile)) {
    return createMatcher(parseBlocklist(readFileSync(blocklistFile, 'utf8')));
  }
  if (existsSync(privateDir)) {
    fail(['private/ ist vorhanden, aber private/sperrliste.txt fehlt. Ohne Sperrliste kann nicht geprüft werden.']);
  }
  console.warn('Datenschutz-Wächter: keine private/sperrliste.txt gefunden, Namensprüfung übersprungen.');
  return createMatcher([]);
}

function fail(problems) {
  console.error('\n✋ Datenschutz-Wächter: Commit abgebrochen (ADR 0001)\n');
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error('\nPersönliche Daten gehören nach private/. Begriffe pflegst du in private/sperrliste.txt.\n');
  process.exit(1);
}

function checkFiles(paths, readContent, matcher) {
  const problems = [];
  for (const path of paths) {
    for (const problem of checkPath(path)) problems.push(`${path}: ${problem}`);
    for (const hit of matcher.findHits(path)) problems.push(`${path}: Dateiname enthält „${hit.term}"`);

    const content = readContent(path);
    if (!content || isBinary(content)) continue;
    for (const hit of matcher.findHits(content.toString('utf8'))) {
      problems.push(`${path}:${hit.line}: enthält „${hit.term}"`);
    }
  }
  return problems;
}

function checkIdentities(matcher) {
  const identities = new Set(
    ['GIT_AUTHOR_IDENT', 'GIT_COMMITTER_IDENT'].map((variable) => git(['var', variable]).replace(/>.*$/, '>').trim()),
  );
  const terms = new Set([...identities].flatMap((ident) => matcher.findHits(ident).map((hit) => hit.term)));
  if (terms.size === 0) return [];
  return [
    `Git-Absender (Name oder E-Mail) enthält ${[...terms].map((term) => `„${term}"`).join(', ')}. ` +
      'Für dieses Repo eine anonyme Adresse setzen: git config user.email "<id>+<name>@users.noreply.github.com"',
  ];
}

function splitNul(output) {
  return output.split('\0').filter(Boolean);
}

const mode = process.argv[2];
const matcher = loadMatcher();
let problems = [];

if (mode === 'pre-commit') {
  const staged = splitNul(git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']));
  problems = [
    ...checkFiles(staged, (path) => git(['show', `:${path}`], 'buffer'), matcher),
    ...checkIdentities(matcher),
  ];
} else if (mode === 'commit-msg') {
  const messageFile = resolve(process.argv[3] ?? join(root, '.git', 'COMMIT_EDITMSG'));
  const message = stripCommitComments(readFileSync(messageFile, 'utf8'));
  problems = matcher.findHits(message).map((hit) => `Commit-Nachricht, Zeile ${hit.line}: enthält „${hit.term}"`);
} else if (mode === 'audit') {
  const tracked = splitNul(git(['ls-files', '-z']));
  problems = checkFiles(tracked, (path) => readFileSync(join(root, path)), matcher);
} else {
  console.error('Aufruf: privacy-guard.mjs pre-commit | commit-msg <datei> | audit');
  process.exit(2);
}

if (problems.length > 0) fail(problems);
console.log(`Datenschutz-Wächter (${mode}): keine Probleme gefunden.`);
