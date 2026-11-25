"""Schneidet für die Prüf-Ansicht jedes Personen- und Info-Kästchen aus dem hochaufgelösten Original aus.

Aufruf:  .venv/Scripts/python -I scripts/original/pruef_bilder.py <arbeitsordner> <foto>
Liest:   beziehungen.json
Schreibt <arbeitsordner>/pruef-bilder/<Kennung>.jpg (mit etwas Umgebung, damit Linien und Nachbartexte sichtbar sind)
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

Image.MAX_IMAGE_PIXELS = None
MARGIN_X, MARGIN_Y = 260, 160  # Umgebung in Originalpixeln
MAX_WIDTH = 1400


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    work, photo = Path(sys.argv[1]), Path(sys.argv[2])
    data = json.loads((work / "beziehungen.json").read_text(encoding="utf-8"))
    out = work / "pruef-bilder"
    out.mkdir(exist_ok=True)
    image = ImageOps.exif_transpose(Image.open(photo)).convert("RGB")
    boxes = data["personen"] + data["infos"]
    for n, box in enumerate(boxes, start=1):
        x0, y0 = max(0, box["x"] - MARGIN_X), max(0, box["y"] - MARGIN_Y)
        x1, y1 = min(image.width, box["x"] + box["w"] + MARGIN_X), min(image.height, box["y"] + box["h"] + MARGIN_Y)
        crop = image.crop((x0, y0, x1, y1))
        # Das betroffene Kästchen dezent markieren, damit klar ist, welches gemeint ist.
        ImageDraw.Draw(crop).rectangle((box["x"] - x0 - 12, box["y"] - y0 - 12, box["x"] - x0 + box["w"] + 12, box["y"] - y0 + box["h"] + 12), outline=(29, 78, 216), width=5)
        if crop.width > MAX_WIDTH:
            crop = crop.resize((MAX_WIDTH, round(crop.height * MAX_WIDTH / crop.width)), Image.LANCZOS)
        crop.save(out / f"{box['id']}.jpg", quality=88)
        if n % 100 == 0:
            print(f"{n}/{len(boxes)}", flush=True)
    print(f"{len(boxes)} Ausschnitte → {out}")


if __name__ == "__main__":
    main()
