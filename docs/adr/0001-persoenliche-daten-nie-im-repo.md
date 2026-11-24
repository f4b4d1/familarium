# Persönliche Daten kommen nie ins Repository

Der Code kann öffentlich auf GitHub liegen, Familiendaten dürfen dort nie landen. Deshalb liegt alles Persönliche in `private/`: das Original, die Personendaten, Medien, Recherche-Notizen und Sicherungskopien. Der Ordner ist per `.gitignore` ausgeschlossen. Ein Pre-Commit-Hook bricht Commits ab, die Dateien aus `private/`, Bild- oder GEDCOM-Dateien an unerlaubten Stellen oder Wörter aus einer Sperrliste enthalten. Die Sperrliste wird aus den privaten Daten erzeugt und liegt selbst in `private/`. Dokumentation, Tests und Beispiele verwenden nur einen erfundenen Demo-Stammbaum, und auch der Repo-Name nennt keinen Familiennamen.

## Considered Options

- **Privates GitHub-Repo für alles**: verworfen, weil persönliche Daten grundsätzlich nicht zu GitHub sollen, auch nicht in ein privates Repo.
- **Lokales Git-Repo für `private/`**: verworfen. Die Versionsgeschichte übernehmen automatische Sicherungskopien, und ein versehentlich eingerichteter Remote wäre ein vermeidbares Risiko.

## Consequences

Für `private/` gibt es keine Git-Historie. Gesichert wird über automatische Kopien in `private/sicherungen/` und regelmäßig von Hand auf eine externe Festplatte; die App erinnert daran.
