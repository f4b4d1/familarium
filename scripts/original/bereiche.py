"""Zerlegt das Foto in überlappende Bereiche mit eingezeichneten Kästchen-Nummern und Koordinatengitter.

Damit können Zusammenhänge (Ehen, Kinder, Verweise), freie Texte und übersehene Kästchen bestimmt werden.

Aufruf:  .venv/Scripts/python -I scripts/original/bereiche.py <foto> <arbeitsordner> [links oben rechts unten]
         (Papierbereich in Pixeln des aufrechten Fotos; ohne Angabe das ganze Bild)
Schreibt <arbeitsordner>/bereiche/bereich-RR-SS.jpg und bereiche.json
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

Image.MAX_IMAGE_PIXELS = None

TILE_W, TILE_H = 2600, 2400
STEP_X, STEP_Y = 2100, 1500
GRID = 500
OUT_MAX = 1568


def font(size: int):
    for name in ("arialbd.ttf", "arial.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def starts(lo: int, hi: int, size: int, step: int) -> list[int]:
    result = list(range(lo, max(lo + 1, hi - size + 1), step))
    if not result or result[-1] + size < hi:
        result.append(max(lo, hi - size))
    return result


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    photo, work = Path(sys.argv[1]), Path(sys.argv[2])
    boxes = json.loads((work / "kaesten.json").read_text(encoding="utf-8"))
    image = ImageOps.exif_transpose(Image.open(photo)).convert("RGB")
    left, top, right, bottom = (int(v) for v in sys.argv[3:7]) if len(sys.argv) >= 7 else (0, 0, image.width, image.height)

    # Nummern und Gitter einmal auf das ganze Bild zeichnen.
    draw = ImageDraw.Draw(image)
    grid_font, id_font = font(46), font(54)
    for x in range(0, image.width, GRID):
        draw.line((x, 0, x, image.height), fill=(120, 170, 255), width=3)
    for y in range(0, image.height, GRID):
        draw.line((0, y, image.width, y), fill=(120, 170, 255), width=3)
    for box in boxes["kaesten"]:
        x, y, w, h = box["x"], box["y"], box["w"], box["h"]
        draw.rectangle((x - 6, y - 6, x + w + 6, y + h + 6), outline=(220, 0, 0), width=8)
        label = box["id"]
        tw = draw.textlength(label, font=id_font)
        draw.rectangle((x - 6, y - 70, x - 6 + tw + 16, y - 8), fill=(220, 0, 0))
        draw.text((x + 2, y - 68), label, fill=(255, 255, 255), font=id_font)

    out = work / "bereiche"
    out.mkdir(parents=True, exist_ok=True)
    index = {}
    for r, y0 in enumerate(starts(top, bottom, TILE_H, STEP_Y), start=1):
        for c, x0 in enumerate(starts(left, right, TILE_W, STEP_X), start=1):
            tile = image.crop((x0, y0, x0 + TILE_W, y0 + TILE_H)).copy()
            tdraw = ImageDraw.Draw(tile)
            # Gitterbeschriftung am Rand des Ausschnitts: absolute Koordinate in Hundert Pixeln.
            for gx in range((x0 // GRID + 1) * GRID, x0 + TILE_W, GRID):
                tdraw.rectangle((gx - x0 + 4, 4, gx - x0 + 150, 56), fill=(30, 80, 200))
                tdraw.text((gx - x0 + 10, 6), f"x{gx // 100}", fill=(255, 255, 255), font=grid_font)
            for gy in range((y0 // GRID + 1) * GRID, y0 + TILE_H, GRID):
                tdraw.rectangle((4, gy - y0 + 4, 150, gy - y0 + 56), fill=(30, 80, 200))
                tdraw.text((10, gy - y0 + 6), f"y{gy // 100}", fill=(255, 255, 255), font=grid_font)
            tile.thumbnail((OUT_MAX, OUT_MAX), Image.LANCZOS)
            name = f"bereich-{r:02d}-{c:02d}.jpg"
            tile.save(out / name, quality=90)
            inside = [b["id"] for b in boxes["kaesten"] if x0 <= b["x"] + b["w"] / 2 <= x0 + TILE_W and y0 <= b["y"] + b["h"] / 2 <= y0 + TILE_H]
            index[name] = {"x": x0, "y": y0, "w": TILE_W, "h": TILE_H, "kaesten": inside}
    (work / "bereiche.json").write_text(json.dumps(index, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"{len(index)} Bereiche geschrieben → {out}")


if __name__ == "__main__":
    main()
