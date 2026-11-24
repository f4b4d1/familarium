"""Baut den Arbeitsstand für Schritt 2 (Beziehungen und Info-Kästchen) aus der Kästchen-Korrektur des Nutzers.

Aufruf:  .venv/Scripts/python -I scripts/original/baue_beziehungen.py <arbeitsordner>
Liest:   kaesten-korrektur.json (Personen-Kästchen und Generationslinien, vom Nutzer geprüft),
         kaesten.json (alle ursprünglich erkannten Kästchen), zwischenstand.json (Lesungen, Ehen, Zwillinge)
Schreibt beziehungen.json (wird vom Kästchen-Werkzeug weiterbearbeitet; vorhandene Datei wird nie überschrieben)

- Personen werden neu nummeriert: P001 … nach Generation, innerhalb der Generation von links nach rechts.
- Generation = Zahl der Generationslinien oberhalb der Kästchenmitte (Linien sind die Grenzen der Bänder).
- Ehen der ersten Auswertung werden übertragen (herkunft "alt", alle unsicher, bis Agenten oder Nutzer sie bestätigen).
"""

import json
import sys
from pathlib import Path

ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI"]


def line_y(points: list, x: float) -> float:
    """Höhe einer Generationslinie an der Stelle x (lineare Interpolation, an den Enden verlängert)."""
    pts = sorted(points)
    if len(pts) == 1:
        return pts[0][1]
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        if x <= x2 or (x2, y2) == pts[-1]:
            return y1 + (y2 - y1) * (x - x1) / ((x2 - x1) or 1)
    return pts[-1][1]


def generation(box: dict, lines: list) -> int:
    cx, cy = box["x"] + box["w"] / 2, box["y"] + box["h"] / 2
    return sum(1 for line in lines if line_y(line["punkte"], cx) < cy)


def overlap(a: dict, b: dict) -> float:
    """Anteil der Fläche von a, der in b liegt."""
    w = min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"])
    h = min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"])
    return max(0, w) * max(0, h) / (a["w"] * a["h"])


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    work = Path(sys.argv[1])
    target = work / "beziehungen.json"
    if target.exists():
        sys.exit(f"{target} gibt es schon – wird nicht überschrieben (Nutzerarbeit!).")
    corrected = json.loads((work / "kaesten-korrektur.json").read_text(encoding="utf-8"))
    detected = json.loads((work / "kaesten.json").read_text(encoding="utf-8"))["kaesten"]
    state = json.loads((work / "zwischenstand.json").read_text(encoding="utf-8"))
    old_persons = {p["id"]: p for p in state["personen"]}
    lines = corrected["generationslinien"]

    boxes = corrected["kaesten"]
    for b in boxes:
        b["_gen"] = generation(b, lines)
    boxes.sort(key=lambda b: (b["_gen"], b["x"] + b["w"] / 2))

    persons, to_p, need_reading = [], {}, []
    for n, b in enumerate(boxes, start=1):
        pid = f"P{n:03d}"
        old_id = b.get("id")
        if not old_id:  # vom Nutzer neu gezogen: liegt es auf einem früher erkannten, gelesenen Kästchen?
            best = max(detected, key=lambda d: overlap(b, d))
            if overlap(b, best) > 0.6 and overlap(best, b) > 0.6 and best["id"] in old_persons:
                old_id = best["id"]
        old = old_persons.get(old_id or "", {})
        person = {"id": pid, "alt": old_id, "x": b["x"], "y": b["y"], "w": b["w"], "h": b["h"],
                  "generation": ROMAN[b["_gen"]] if 0 < b["_gen"] < len(ROMAN) else None,
                  "zeilen": old.get("zeilen", [])}
        if not person["zeilen"]:
            need_reading.append(pid)
        persons.append(person)
        for alias in [old_id, *old.get("alias", [])]:
            if alias:
                to_p[alias] = pid

    by_id = {p["id"]: p for p in persons}
    marriages = []
    for old in state["ehen"]:
        partners, partner_texts = [], []
        for ref in old["partner"]:
            if not ref:
                continue
            if ref in to_p:
                partners.append(to_p[ref])
            elif ref in old_persons and old_persons[ref].get("quelle") == "erwaehnt":
                partner_texts.append(" ".join(old_persons[ref]["zeilen"]))
        children = [to_p[c] for c in old["kinder"] if c in to_p]
        lost = [r for r in [*old["partner"], *old["kinder"]] if r and r not in to_p and old_persons.get(r, {}).get("quelle") != "erwaehnt"]
        if not partners and not children:
            continue
        anchors = [by_id[p] for p in partners]
        if len(anchors) == 2:
            a, b = anchors
            px, py = (a["x"] + a["w"] / 2 + b["x"] + b["w"] / 2) / 2, (a["y"] + a["h"] + b["y"] + b["h"]) / 2 + 60
        elif anchors:
            a = anchors[0]
            px, py = a["x"] + a["w"] + 120, a["y"] + a["h"] / 2
        else:
            c = by_id[children[0]]
            px, py = c["x"] + c["w"] / 2, c["y"] - 250
        hints = list(old.get("hinweise", []))
        if lost:
            hints.append(f"Verweise auf entfernte Kästchen: {', '.join(lost)}")
        marriages.append({"id": f"E{len(marriages) + 1:03d}", "x": round(px), "y": round(py), "partner": partners,
                          "partner_text": partner_texts, "kinder": children, "herkunft": "alt", "unsicher": True,
                          "alt_wortlaut": old.get("wortlaut", []), "alt_ehe_nr": old.get("ehe_nr", ""), "hinweise": hints})

    twins = [[to_p[c] for c in pair if c in to_p] for pair in state.get("zwillinge", [])]
    twins = [sorted(set(t)) for t in twins if len(set(t)) == 2]
    data = {"foto": corrected["foto"], "breite": corrected["breite"], "hoehe": corrected["hoehe"],
            "personen": persons, "ehen": marriages, "infos": [], "zwillinge": twins, "generationslinien": lines}
    target.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    per_gen = {}
    for p in persons:
        per_gen[p["generation"]] = per_gen.get(p["generation"], 0) + 1
    print(f"{len(persons)} Personen, {len(marriages)} Ehen, {len(twins)} Zwillingspaare → {target}")
    print("je Generation:", per_gen)
    print("ohne Lesung:", need_reading)


if __name__ == "__main__":
    main()
