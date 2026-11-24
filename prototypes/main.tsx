// Einstieg der Wegwerf-Entwürfe (Schritt 2): drei Bedienkonzepte, zwei Farbwelten, hell/dunkel.

import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/source-serif-4/600.css';
import '@fontsource/source-serif-4/400-italic.css';
import '@fontsource/unifrakturmaguntia/400.css';
import './styles.css';
import './concepts.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConceptA } from './ConceptA.tsx';
import { ConceptB } from './ConceptB.tsx';
import { ConceptC } from './ConceptC.tsx';
import { Profile } from './Profile.tsx';

type Concept = 'A' | 'B' | 'C';
type Theme = 'archiv' | 'wappen';
type Mode = 'auto' | 'light' | 'dark';

/** Startwert aus der Adresse (z. B. ?entwurf=B&farbwelt=wappen&modus=dunkel), sonst aus dem Browser-Speicher. */
function stored<T extends string>(key: string, fallback: T): T {
  const fromUrl = new URLSearchParams(location.search).get(key);
  if (fromUrl) return fromUrl as T;
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ohne Speicher geht es auch, die Wahl gilt dann nur bis zum Neuladen.
  }
}

/** Platzhalter-Wappen der Demo (das echte Wappen liegt nur in private/). */
function Crest() {
  return (
    <svg width="38" height="44" viewBox="0 0 38 44" aria-hidden>
      <path d="M3 3 H35 V20 C35 32 27 39 19 42 C11 39 3 32 3 20 Z" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.5" />
      <path d="M19 10 V34 M19 14 l-6 -3 M19 14 l6 -3 M19 20 l-7 -3 M19 20 l7 -3 M19 26 l-6 -3 M19 26 l6 -3" stroke="var(--highlight-soft)" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

const CONCEPTS: { id: Concept; label: string }[] = [
  { id: 'A', label: 'A · Gesamtplan' },
  { id: 'B', label: 'B · Familien-Fokus' },
  { id: 'C', label: 'C · Linien-Ansicht' },
];

function App() {
  const [concept, setConcept] = useState<Concept>(() => stored('entwurf', 'A'));
  const [theme, setTheme] = useState<Theme>(() => stored('farbwelt', 'archiv'));
  const [mode, setMode] = useState<Mode>(() => stored('modus', 'auto'));
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = mode;
    store('farbwelt', theme);
    store('modus', mode);
  }, [theme, mode]);
  useEffect(() => store('entwurf', concept), [concept]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Crest />
          <div>
            <h1>Familarium</h1>
            <small>Entwürfe · erfundener Demo-Stammbaum</small>
          </div>
        </div>
        <div className="segmented" role="group" aria-label="Entwurf">
          {CONCEPTS.map((c) => (
            <button key={c.id} aria-pressed={concept === c.id} onClick={() => setConcept(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <div className="segmented" role="group" aria-label="Farbwelt">
          <button aria-pressed={theme === 'archiv'} onClick={() => setTheme('archiv')}>
            Archiv
          </button>
          <button aria-pressed={theme === 'wappen'} onClick={() => setTheme('wappen')}>
            Wappen
          </button>
        </div>
        <div className="segmented" role="group" aria-label="Hell oder dunkel">
          <button aria-pressed={mode === 'auto'} onClick={() => setMode('auto')}>
            Auto
          </button>
          <button aria-pressed={mode === 'light'} onClick={() => setMode('light')}>
            Hell
          </button>
          <button aria-pressed={mode === 'dark'} onClick={() => setMode('dark')}>
            Dunkel
          </button>
        </div>
      </header>
      <div className="workspace">
        <main className="stage">
          {concept === 'A' ? <ConceptA selected={selected} onSelect={setSelected} /> : null}
          {concept === 'B' ? <ConceptB onSelect={setSelected} /> : null}
          {concept === 'C' ? <ConceptC onSelect={setSelected} /> : null}
        </main>
        {selected ? <Profile personId={selected} onSelect={setSelected} onClose={() => setSelected(null)} /> : null}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
