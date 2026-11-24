"""Vergleicht zwei unabhängige Lesungen der Kästchen.

Aufruf:  .venv/Scripts/python -I scripts/original/vergleiche_lesungen.py <arbeitsordner>
Liest:   lesung-1/*.json, lesung-2/*.json
Schreibt lesungen.json: je Kästchen beide Lesungen und ob sie übereinstimmen.
"""

import json
import re
import sys
from pathlib import Path


def load(folder: Path) -> dict[str, list[dict]]:
    result: dict[str, list[dict]] = {}
    for file in sorted(folder.glob("blatt-*.json")):
        for entry in json.loads(file.read_text(encoding="utf-8")):
            result.setdefault(entry["id"], []).append(entry)
    return result


def normalize(lines: list[str]) -> str:
    """Vergleichsform: Leerraum vereinheitlicht, sonst unverändert (Wortlaut zählt)."""
    text = " ".join(lines)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*([.,;:/])\s*", r"\1", text)
    return text.strip()


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    work = Path(sys.argv[1])
    first, second = load(work / "lesung-1"), load(work / "lesung-2")
    result = {}
    stats = {"gleich": 0, "verschieden": 0, "nur_eine": 0, "kein_kaestchen": 0}
    for box_id in sorted(set(first) | set(second)):
        a, b = first.get(box_id, []), second.get(box_id, [])
        if not a or not b:
            stats["nur_eine"] += 1
            status = "nur_eine"
        elif all(e.get("typ") != "person" for e in a + b):
            stats["kein_kaestchen"] += 1
            status = "kein_kaestchen"
        else:
            same = [normalize(e.get("zeilen", [])) for e in a] == [normalize(e.get("zeilen", [])) for e in b]
            status = "gleich" if same else "verschieden"
            stats[status] += 1
        result[box_id] = {"status": status, "lesung_1": a, "lesung_2": b}
    (work / "lesungen.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(stats, ensure_ascii=False))


if __name__ == "__main__":
    main()
