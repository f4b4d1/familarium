# Der Gesamtplan wird selbst als SVG gezeichnet

Die Hauptansicht ist der Gesamtplan, also der ganze Stamm in Generationsbändern wie im Original; die beiden anderen Entwürfe wurden dafür verworfen. Gezeichnet wird er ohne Stammbaum-Bibliothek: Die Anordnung berechnen wir selbst und zeichnen Kästchen und Linien als SVG. Nur das Zoomen und Verschieben ist eine kleine eigene Hilfsfunktion. Fertige Bibliotheken können die Eigenheiten des Originals nicht abbilden: Kästchen mit Spitze, Ehe-Knoten zwischen den Partnern mit „I./II. Ehe", Ahnenschwund als Verweis-Kästchen, Vorfahren „vor I", Stiefkinder und Adoptierte an gestrichelten Linien.

## Considered Options

- **Stammbaum-Bibliothek (z. B. family-chart)**: schneller zu einem ersten Bild, aber Aussehen und Anordnung lassen sich kaum anpassen.
- **Entwurf B (Familien-Fokus) oder C (Linien-Ansicht) als Hauptansicht**: einfacher anzuordnen, zeigen aber nicht den ganzen Stamm auf einen Blick wie das Original.

## Consequences

Für die Lesbarkeit der Anordnung sind wir selbst verantwortlich. Ein Geometrie-Test sichert ab, dass sich keine Linien überdecken, keine Linie durch ein Kästchen oder eine Beschriftung läuft und keine Kästchen überlappen. Bei Änderungen an der Anordnung muss dieser Test grün bleiben.
