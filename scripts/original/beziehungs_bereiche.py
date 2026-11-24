"""Bildausschnitte für Schritt 2: Personen-Kästchen mit P-Nummern und Koordinatengitter, dazu Einzelbilder ungelesener Kästchen.

Aufruf:  .venv/Scripts/python -I scripts/original/beziehungs_bereiche.py <foto> <arbeitsordner> links oben rechts unten
Liest:   beziehungen.json
Schreibt <arbeitsordner>/bereiche-p/bereich-RR-SS.jpg, bereiche-p.json und p-neu/<Pxxx>.jpg (Personen ohne Lesung)
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

sys.path.insert(0, str(Path(__file__).parent))  # -I nimmt den Skriptordner nicht in den Suchpfad
from bereiche import GRID, OUT_MAX, STEP_X, STEP_Y, TILE_H, TILE_W, font, starts

Image.MAX_IMAGE_PIXELS = None


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    photo, work = Path(sys.argv[1]), Path(sys.argv[2])
    left, top, right, bottom = (int(v) for v in sys.argv[3:7])
    data = json.loads((work / "beziehungen.json").read_text(encoding="utf-8"))
    image = ImageOps.exif_transpose(Image.open(photo)).convert("RGB")

    single = work / "p-neu"
    single.mkdir(exist_ok=True)
    for p in data["personen"]:
        if not p["zeilen"]:
            m = 80
            image.crop((p["x"] - m, p["y"] - m, p["x"] + p["w"] + m, p["y"] + p["h"] + m)).save(single / f"{p['id']}.jpg", quality=92)

    draw = ImageDraw.Draw(image)
    grid_font, id_font = font(46), font(50)
    for x in range(0, image.width, GRID):
        draw.line((x, 0, x, image.height), fill=(120, 170, 255), width=3)
    for y in range(0, image.height, GRID):
        draw.line((0, y, image.width, y), fill=(120, 170, 255), width=3)
    for p in data["personen"]:
        x, y, w, h = p["x"], p["y"], p["w"], p["h"]
        draw.rectangle((x - 4, y - 4, x + w + 4, y + h + 4), outline=(220, 0, 0), width=6)
        tw = draw.textlength(p["id"], font=id_font)
        draw.rectangle((x - 4, y - 62, x - 4 + tw + 14, y - 6), fill=(220, 0, 0))
        draw.text((x + 3, y - 60), p["id"], fill=(255, 255, 255), font=id_font)

    out = work / "bereiche-p"
    out.mkdir(exist_ok=True)
    index = {}
    for r, y0 in enumerate(starts(top, bottom, TILE_H, STEP_Y), start=1):
        for c, x0 in enumerate(starts(left, right, TILE_W, STEP_X), start=1):
            tile = image.crop((x0, y0, x0 + TILE_W, y0 + TILE_H)).copy()
            tdraw = ImageDraw.Draw(tile)
            for gx in range((x0 // GRID + 1) * GRID, x0 + TILE_W, GRID):
                tdraw.rectangle((gx - x0 + 4, 4, gx - x0 + 150, 56), fill=(30, 80, 200))
                tdraw.text((gx - x0 + 10, 6), f"x{gx // 100}", fill=(255, 255, 255), font=grid_font)
            for gy in range((y0 // GRID + 1) * GRID, y0 + TILE_H, GRID):
                tdraw.rectangle((4, gy - y0 + 4, 150, gy - y0 + 56), fill=(30, 80, 200))
                tdraw.text((10, gy - y0 + 6), f"y{gy // 100}", fill=(255, 255, 255), font=grid_font)
            tile.thumbnail((OUT_MAX, OUT_MAX), Image.LANCZOS)
            name = f"bereich-{r:02d}-{c:02d}.jpg"
            tile.save(out / name, quality=90)
            inside = [p["id"] for p in data["personen"] if x0 <= p["x"] + p["w"] / 2 <= x0 + TILE_W and y0 <= p["y"] + p["h"] / 2 <= y0 + TILE_H]
            index[name] = {"x": x0, "y": y0, "w": TILE_W, "h": TILE_H, "personen": inside}
    (work / "bereiche-p.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{len(index)} Bereiche → {out}; {len(list(single.glob('*.jpg')))} Einzelbilder → {single}")


if __name__ == "__main__":
    main()
