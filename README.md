# Familarium

*Agentic coded app to explore and research my family tree.*

Eine lokale Web-App zur Ahnenforschung: Stammbaum ansehen, Angaben mit Quellen belegen, Lücken recherchieren. Sie läuft nur auf dem eigenen Rechner.

> **Status:** im Aufbau. Bisher steht der Datenschutz-Wächter.

## Datenschutz zuerst

Persönliche Daten kommen nie in dieses Repository ([ADR 0001](docs/adr/0001-persoenliche-daten-nie-im-repo.md)).

- Alles Persönliche liegt in `private/`: Bilder, Personendaten, Medien und Sicherungen. Der Ordner ist per `.gitignore` ausgeschlossen.
- Beispiele, Tests und Doku verwenden ausschließlich erfundene Daten.
- Der **Datenschutz-Wächter** (`.githooks/`, `scripts/privacy-guard.mjs`) bricht jeden Commit ab, der
  - Dateien aus `private/` enthält,
  - Bilder, PDFs, GEDCOM- oder ZIP-Dateien außerhalb der erlaubten Ordner enthält,
  - Begriffe aus der Sperrliste `private/sperrliste.txt` enthält, ob in Dateien, Dateinamen, der Commit-Nachricht oder der Git-Absenderadresse.
- `git commit --no-verify` ist in diesem Repo tabu, denn damit würde der Wächter umgangen.

## Einrichtung

```sh
npm install        # aktiviert auch die Git-Hooks (core.hooksPath = .githooks)
npm test           # Tests
npm run privacy:audit   # prüft alle Dateien im Repo gegen die Sperrliste
```

Für Commits eine anonyme GitHub-Adresse verwenden, die nur für dieses Repo gilt:

```sh
git config user.email "<id>+<benutzername>@users.noreply.github.com"
```

## Dokumentation

- [GLOSSARY.md](GLOSSARY.md): die Fachbegriffe der Ahnenforschung, wie sie hier verwendet werden
- [docs/adr/](docs/adr/): getroffene Architekturentscheidungen
