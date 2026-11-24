"""Erzeugt Bildausschnitte zu Konflikten im Zwischenstand (Kind in mehreren Ehen, Kästchen ohne Verbindung).

Aufruf:  .venv/Scripts/python -I scripts/original/konflikte.py <foto> <arbeitsordner>
Schreibt <arbeitsordner>/konflikte/konflikt-NN.jpg und konflikte.json
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

Image.MAX_IMAGE_PIXELS = None
MARGIN = 500


def font(size: int):
    for name in ("arialbd.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    photo, work = Path(sys.argv[1]), Path(sys.argv[2])
    state = json.loads((work / "zwischenstand.json").read_text(encoding="utf-8"))
    persons = {p["id"]: p for p in state["personen"]}
    marriages = {m["id"]: m for m in state["ehen"]}

    image = ImageOps.exif_transpose(Image.open(photo)).convert("RGB")
    draw = ImageDraw.Draw(image)
    label_font = font(54)
    for p in persons.values():
        for box in [p.get("bild")] + p.get("weitere_bilder", []):
            if not box:
                continue
            x, y, w, h = box["x"], box["y"], box["w"], box["h"]
            draw.rectangle((x - 6, y - 6, x + w + 6, y + h + 6), outline=(220, 0, 0), width=8)
            tw = draw.textlength(p["id"], font=label_font)
            draw.rectangle((x - 6, y - 70, x + tw + 10, y - 8), fill=(220, 0, 0))
            draw.text((x + 2, y - 68), p["id"], fill=(255, 255, 255), font=label_font)

    parents_of = defaultdict(list)
    for m in marriages.values():
        for c in m["kinder"]:
            parents_of[c].append(m["id"])
    groups = defaultdict(list)
    for child, ids in parents_of.items():
        if len(ids) > 1:
            groups[tuple(sorted(ids))].append(child)
    cases = [{"art": "kind_in_mehreren_ehen", "kinder": kids, "ehen": [marriages[i] for i in key]} for key, kids in groups.items()]
    for problem in state["probleme"]:
        m = re.match(r"^(\S+): weder Kind noch Partner", problem)
        if m:
            cases.append({"art": "ohne_verbindung", "person": m[1]})

    out = work / "konflikte"
    out.mkdir(exist_ok=True)
    result = {}
    for n, case in enumerate(cases, start=1):
        ids = set(case.get("kinder", [])) | {case.get("person")} if case["art"] == "ohne_verbindung" else set(case["kinder"])
        for m in case.get("ehen", []):
            ids |= {p for p in m["partner"] if p}
        boxes = [persons[i]["bild"] for i in ids if i in persons and persons[i].get("bild")]
        if not boxes:
            continue
        left = max(0, min(b["x"] for b in boxes) - MARGIN)
        top = max(0, min(b["y"] for b in boxes) - MARGIN)
        right = min(image.width, max(b["x"] + b["w"] for b in boxes) + MARGIN)
        bottom = min(image.height, max(b["y"] + b["h"] for b in boxes) + MARGIN)
        crop = image.crop((left, top, right, bottom))
        crop.thumbnail((1568, 1568), Image.LANCZOS)
        name = f"konflikt-{n:02d}"
        crop.save(out / f"{name}.jpg", quality=90)
        summary = {"art": case["art"]}
        if case["art"] == "kind_in_mehreren_ehen":
            summary["kinder"] = case["kinder"]
            summary["moegliche_ehen"] = [{"id": m["id"], "partner": m["partner"], "wortlaut": m["wortlaut"]} for m in case["ehen"]]
        else:
            summary["person"] = case["person"]
            summary["zeilen"] = persons.get(case["person"], {}).get("zeilen", [])
        result[name] = summary
    (work / "konflikte.json").write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{len(result)} Konfliktfälle → {out}")


if __name__ == "__main__":
    main()
