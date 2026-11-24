# Ahnenforschung

Ein Werkzeug, um einen Familienstammbaum anzusehen, seine Angaben zu belegen und ihn durch Recherche zu erweitern.

## Personen und Verwandtschaft

**Person** (`person`):
Ein Mensch, der im Datenbestand erfasst ist, unabhängig davon, wie er mit dem Probanden verwandt ist.
_Avoid_: Ahn (für alle Personen), Eintrag, Mitglied

**Proband** (`proband`):
Die Bezugsperson, von der aus Ahnen und Ahnennummern bestimmt werden.
_Avoid_: Wurzel, Root, Ich

**Ahn** (`ancestor`):
Ein direkter Vorfahr des Probanden (Eltern, Großeltern, Urgroßeltern …). Geschwister, Onkel oder Cousins sind Verwandte, aber keine Ahnen.
_Avoid_: Vorfahre (für Verwandte allgemein), Verwandter

**Ahnennummer** (`kekuleNumber`):
Die Nummer eines Ahnen nach Kekulé: Der Proband hat die 1, der Vater einer Person mit Nummer n hat 2n, die Mutter 2n+1.
_Avoid_: ID, Generation

**Stamm** (`lineage`):
Die gesamte Nachkommenschaft eines Stammvaters samt eingeheirateten Partnern. Einen Stamm gibt es erst, wenn sein Stammvater festgelegt ist. Eine Person kann zu mehreren Stämmen gehören, etwa zum Stamm des Vaters und zum Stamm der Mutter.
_Avoid_: Familie, Sippe, Baum

**Stammvater** (`progenitor`):
Die Person an der Spitze eines Stammes, von der aus dessen Generationen gezählt werden.
_Avoid_: Urahn, Wurzel, Begründer

**Generation** (`generation`):
Die Stufe einer Person innerhalb eines Stammes, gezählt in römischen Ziffern mit dem Stammvater als I. Wer einheiratet, gehört zur Generation seines Partners; wer zu mehreren Stämmen gehört, hat in jedem eine eigene Generation. Vorfahren des Stammvaters werden rückwärts als „vor I (1)", „vor I (2)" usw. gezählt; der Stammvater bleibt auch dann Generation I.
_Avoid_: Ebene, Stufe, Ahnennummer

**Linie** (`line`):
Ein benannter Zweig innerhalb eines Stammes, etwa nach Wohnort oder Amt.
_Avoid_: Ast, Zweig, Stamm

**Erwähnte Person** (`mentionedPerson`):
Eine Person, die im Original keinen eigenen Kasten hat, sondern nur in einer Notiz genannt wird, etwa der frühere Ehemann einer Witwe.
_Avoid_: Nebenperson, Randfigur

**Ahnenschwund** (`pedigreeCollapse`):
Der Fall, dass dieselbe Person über mehrere Wege Ahn des Probanden ist und deshalb mehrere Ahnennummern trägt.
_Avoid_: Doppelperson, Duplikat

**Partnerschaft** (`partnership`):
Eine Verbindung zweier Personen, aus der Kinder hervorgehen können, ob als Ehe oder ohne Trauung. Sie endet durch Tod oder Scheidung. Eine Person kann nacheinander mehrere Partnerschaften haben; ein Partner kann unbekannt sein.
_Avoid_: Familie, Ehe (für nichteheliche Verbindungen)

**Elternschaft** (`parentage`):
Die Beziehung eines Kindes zu einer Partnerschaft, mit ihrer Art: leiblich, adoptiert, Stiefkind, Pflegekind oder unbekannt.
_Avoid_: Abstammung (für nicht-leibliche Kinder)

**Stammbaum** (`tree`):
Die grafische Darstellung von Personen und ihrer Verwandtschaft, gleich ob sie Vorfahren, Nachfahren oder beides zeigt.
_Avoid_: Ahnentafel, Nachfahrentafel (nur als Bezeichnung einer bestimmten Darstellungsform)

## Lebensdaten

**Ereignis** (`event`):
Etwas, das im Leben einer Person zu einer Zeit an einem Ort geschah, etwa Geburt, Taufe, Heirat, Tod, Begräbnis, Auswanderung oder Militärdienst. Taufe und Geburt sind verschiedene Ereignisse.
_Avoid_: Datum, Eintrag, Lebensdatum

**Unscharfes Datum** (`fuzzyDate`):
Eine Zeitangabe, die so ungenau sein darf, wie die Quelle es hergibt: genau, nur Jahr, „um", „vor", „nach" oder „zwischen … und …".
_Avoid_: ungefähres Datum, Schätzung

**Ort** (`place`):
Ein Schauplatz von Ereignissen, mit seinem historischen Namen, seinem heutigen Namen und Staat sowie seiner Pfarrei.
_Avoid_: Location, Adresse

**Pfarrei** (`parish`):
Der kirchliche Bezirk, dessen Kirchenbücher die Ereignisse an einem Ort verzeichnen.
_Avoid_: Gemeinde (mehrdeutig: politisch oder kirchlich), Kirchspiel

**Namensvariante** (`nameVariant`):
Eine andere Schreibweise oder Form des Namens einer Person, etwa eine abweichende Schreibung, der Geburts- oder Ehename oder der Rufname.
_Avoid_: Alias, Spitzname

## Belege

**Angabe** (`claim`):
Eine einzelne Aussage über eine Person, etwa ein Geburtsdatum oder ein Sterbeort, stets mit Quelle und Sicherheit. Zur selben Sache können mehrere, auch widersprüchliche Angaben bestehen.
_Avoid_: Fakt, Feld, Datum (für die Aussage als Ganzes)

**Wortlaut** (`verbatim`):
Der exakte Text einer Angabe, wie er in der Quelle steht, mit Abkürzungen, Fragezeichen und Anmerkungen. Die Deutung, etwa als unscharfes Datum, steht getrennt daneben.
_Avoid_: Transkript, Rohtext

**Bevorzugte Angabe** (`preferredClaim`):
Die Angabe, die angezeigt wird, wenn es zur selben Sache mehrere widersprüchliche Angaben gibt.
_Avoid_: richtige Angabe, Hauptangabe

**Quelle** (`source`):
Das Dokument, Medium oder Wissen, aus dem Angaben stammen, z. B. das Original, ein Kirchenbuch, ein Standesamtsregister, eine Webseite oder Familienwissen.
_Avoid_: Beleg, Referenz

**Familienwissen** (`familyKnowledge`):
Eine Quelle für Angaben aus Erinnerung oder mündlicher Überlieferung in der Familie, mit Nennung, wer sie wann eingetragen hat.
_Avoid_: mündliche Quelle, Hörensagen, eigene Angabe

**Fundstelle** (`citation`):
Die genaue Stelle innerhalb einer Quelle, z. B. Seite, Eintragsnummer oder Abschnitt einer Webseite, auf die sich eine Angabe stützt.
_Avoid_: Quelle (für die konkrete Stelle)

**Sicherheit** (`confidence`):
Wie gut eine Angabe gestützt ist: belegt, wahrscheinlich, vermutet oder unbekannt.
_Avoid_: Qualität, Wahrscheinlichkeit

**Original** (`original`):
Ein überliefertes Stammbaum-Dokument eines Stammes, mit dem die Forschung an diesem Stamm begann; es ist dessen erste Quelle. Nicht jeder Stamm hat ein Original.
_Avoid_: Scan, Vorlage, Foto

## Recherche

**Lücke** (`gap`):
Eine fehlende Information über eine Person, die sich aus dem Datenbestand selbst ergibt, etwa ein unbekannter Vater oder ein fehlendes Sterbedatum.
_Avoid_: Fehler, Loch, offener Punkt

**Forschungsfrage** (`researchQuestion`):
Eine konkrete Frage, an der recherchiert wird, z. B. „Wer waren die Eltern von Person X?". Sie entsteht aus einer Lücke oder wird von Hand gestellt.
_Avoid_: Aufgabe, Ticket, Rechercheauftrag

**Suchversuch** (`searchAttempt`):
Eine durchgeführte Suche zu einer Forschungsfrage, mit Portal, Suchbegriffen, Datum und Ergebnis, auch wenn sie nichts gefunden hat.
_Avoid_: Suche, Anfrage, Log

**Vorschlag** (`suggestion`):
Ein Rechercheergebnis, das noch nicht bestätigt ist. Erst nach Bestätigung wird es zur Angabe.
_Avoid_: Treffer, Fund, Hypothese

**Geschützte Person** (`protectedPerson`):
Eine Person, die noch leben könnte oder erst kürzlich gestorben ist: Entweder ist ihr Tod nicht bekannt und ihre Geburt liegt nachweislich oder geschätzt weniger als 100 Jahre zurück oder ist nicht schätzbar, oder ihr Tod liegt weniger als 30 Jahre zurück. Ihre Daten gehen nie in externe Suchanfragen.
_Avoid_: lebende Person (schließt Personen mit unbekanntem Status nicht ein), Privatperson
