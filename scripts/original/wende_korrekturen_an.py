"""Wendet Wortlaut-Korrekturen (z. B. falsch gelesene Ortsnamen) auf den Arbeitsstand an.

Aufruf:  .venv/Scripts/python -I scripts/original/wende_korrekturen_an.py <arbeitsordner> <korrekturdatei.json>
Korrekturdatei: {"korrekturen": [{"ziel": "I059", "von": "Musterhaim", "nach": "Musterheim", "grund": "…"}]}
  ziel = Kennung einer Person (Zeilen), Info (Wortlaut) oder Ehe (Wortlaut der ersten Auswertung).

Nur Lesefehler werden im Wortlaut korrigiert; alte Schreibweisen des Originals bleiben (ADR 0004).
Jede Änderung wird am Objekt unter "korrekturen" vermerkt (alt, neu, Grund), damit sie nachvollziehbar bleibt.
Bereits angewandte Korrekturen werden übersprungen, das Skript kann also mehrfach laufen.
"""

import json
import sys
from pathlib import Path


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    work, rules_file = Path(sys.argv[1]), Path(sys.argv[2])
    target = work / "beziehungen.json"
    original = target.read_text(encoding="utf-8")
    data = json.loads(original)
    rules = json.loads(rules_file.read_text(encoding="utf-8"))["korrekturen"]
    objects = {o["id"]: o for key in ("personen", "infos", "ehen") for o in data[key]}

    done = missing = skipped = 0
    for rule in rules:
        obj = objects.get(rule["ziel"])
        if obj is None:
            print(f"!! {rule['ziel']} gibt es nicht")
            missing += 1
            continue
        log = obj.setdefault("korrekturen", [])
        if any(k["von"] == rule["von"] and k["nach"] == rule["nach"] for k in log):
            skipped += 1
            continue
        field = {"P": "zeilen", "I": "wortlaut", "E": "alt_wortlaut"}[rule["ziel"][0]]
        value = obj.get(field)
        lines = value if isinstance(value, list) else [value]
        hits = [i for i, line in enumerate(lines) if rule["von"] in (line or "")]
        if not hits:
            print(f"!! {rule['ziel']}: '{rule['von']}' nicht im Wortlaut gefunden")
            missing += 1
            continue
        for i in hits:
            lines[i] = lines[i].replace(rule["von"], rule["nach"])
        obj[field] = lines if isinstance(value, list) else lines[0]
        log.append({"von": rule["von"], "nach": rule["nach"], "grund": rule.get("grund", "")})
        done += 1
    if done:
        (work / "beziehungen-vor-korrekturen.json").write_text(original, encoding="utf-8")
        target.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{done} Korrekturen angewandt, {skipped} schon vorhanden, {missing} nicht anwendbar")


if __name__ == "__main__":
    main()
