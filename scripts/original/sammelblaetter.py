"""Schneidet die gefundenen Kästchen aus dem Foto und setzt sie nummeriert auf Sammelblätter.

Aufruf:  .venv/Scripts/python -I scripts/original/sammelblaetter.py <foto> <arbeitsordner>
Liest:   <arbeitsordner>/kaesten.json
Schreibt <arbeitsordner>/blaetter/blatt-NN.jpg und blaetter.json (welches Kästchen auf welchem Blatt)
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

Image.MAX_IMAGE_PIXELS = None

COLS, ROWS = 3, 5
CELL_W, CELL_H = 520, 300
LABEL_H = 34
MARGIN = 0.18  # Rand um jedes Kästchen, damit Schrift an der Kante und die Spitze sichtbar bleiben


def font(size: int):
    for name in ("arialbd.ttf", "arial.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    photo, work = Path(sys.argv[1]), Path(sys.argv[2])
    data = json.loads((work / "kaesten.json").read_text(encoding="utf-8"))
    width, height = data["breite"], data["hoehe"]

    # Fehltreffer außerhalb des Papiers (z. B. Teppich am Rand) verwerfen.
    boxes = [b for b in data["kaesten"] if 0.06 * width < b["x"] and b["x"] + b["w"] < 0.94 * width]
    print(f"{len(data['kaesten']) - len(boxes)} Fehltreffer am Rand verworfen, {len(boxes)} Kästchen bleiben")

    image = ImageOps.exif_transpose(Image.open(photo)).convert("L")
    out = work / "blaetter"
    out.mkdir(parents=True, exist_ok=True)
    label_font = font(26)
    per_sheet = COLS * ROWS
    index = {}
    for sheet_no in range(0, len(boxes), per_sheet):
        chunk = boxes[sheet_no : sheet_no + per_sheet]
        sheet = Image.new("L", (COLS * CELL_W, ROWS * (CELL_H + LABEL_H)), 255)
        draw = ImageDraw.Draw(sheet)
        for i, box in enumerate(chunk):
            mx, my = int(box["w"] * MARGIN), int(box["h"] * MARGIN)
            crop = image.crop((max(0, box["x"] - mx), max(0, box["y"] - my), min(width, box["x"] + box["w"] + mx), min(height, box["y"] + box["h"] + 2 * my)))
            crop.thumbnail((CELL_W - 10, CELL_H - 6), Image.LANCZOS)
            col, row = i % COLS, i // COLS
            x0, y0 = col * CELL_W, row * (CELL_H + LABEL_H)
            draw.rectangle((x0, y0, x0 + CELL_W - 1, y0 + LABEL_H - 2), fill=0)
            draw.text((x0 + 8, y0 + 3), box["id"], fill=255, font=label_font)
            sheet.paste(crop, (x0 + 5, y0 + LABEL_H))
            draw.rectangle((x0, y0, x0 + CELL_W - 1, y0 + LABEL_H + CELL_H - 1), outline=0, width=2)
        name = f"blatt-{sheet_no // per_sheet + 1:02d}.jpg"
        sheet.save(out / name, quality=92)
        index[name] = [box["id"] for box in chunk]
    (work / "blaetter.json").write_text(json.dumps(index, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"{len(index)} Sammelblätter geschrieben → {out}")


if __name__ == "__main__":
    main()
