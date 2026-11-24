"""Findet die Personen-Kästchen im Foto des Originals.

Die Kästchen sind mit Tusche umrandete Rechtecke mit Spitze unten. Gesucht werden die
Innenflächen geschlossener Umrandungen in typischer Kästchengröße.

Aufruf:  .venv/Scripts/python -I scripts/original/finde_kaesten.py <foto> <ausgabeordner>
Ausgabe: kaesten.json (Positionen in Pixeln des aufrecht gedrehten Fotos)
         kaesten-uebersicht.jpg (Vorschau mit nummerierten Rahmen zur Kontrolle)
"""

import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = None

# Arbeitsauflösung: Faktor gegenüber dem Originalfoto.
SCALE = 0.5


def load_upright(path: Path) -> np.ndarray:
    image = ImageOps.exif_transpose(Image.open(path)).convert("L")
    if SCALE != 1:
        image = image.resize((int(image.width * SCALE), int(image.height * SCALE)), Image.LANCZOS)
    return np.array(image)


def find_boxes(gray: np.ndarray, min_w: int, max_w: int, min_h: int, max_h: int) -> list[tuple[int, int, int, int]]:
    # Tinte hervorheben, ungleichmäßige Beleuchtung ausgleichen.
    raw = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 15)
    boxes = []
    # Lücken in den Umrandungen unterschiedlich stark schließen und die Treffer vereinen.
    for kernel in (5, 9, 13):
        binary = cv2.morphologyEx(raw, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (kernel, kernel)))
        boxes.extend(holes(binary, min_w, max_w, min_h, max_h))
    return dedupe(boxes)


def holes(binary: np.ndarray, min_w: int, max_w: int, min_h: int, max_h: int) -> list[tuple[int, int, int, int]]:
    contours, hierarchy = cv2.findContours(binary, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    boxes = []
    for i, contour in enumerate(contours):
        # Innenflächen (Löcher) haben einen Eltern-Umriss.
        if hierarchy[0][i][3] < 0:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        if not (min_w <= w <= max_w and min_h <= h <= max_h):
            continue
        area = cv2.contourArea(contour)
        if area < 0.45 * w * h:  # Kästchen sind weitgehend gefüllte Rechtecke (Schrift kann die Kante berühren)
            continue
        boxes.append((x, y, w, h))
    return boxes


def dedupe(boxes: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
    """Entfernt Kästchen, die fast vollständig in einem größeren liegen."""
    boxes = sorted(boxes, key=lambda b: -b[2] * b[3])
    kept: list[tuple[int, int, int, int]] = []
    for x, y, w, h in boxes:
        inside = False
        for kx, ky, kw, kh in kept:
            ix = max(0, min(x + w, kx + kw) - max(x, kx))
            iy = max(0, min(y + h, ky + kh) - max(y, ky))
            if ix * iy > 0.5 * w * h:
                inside = True
                break
        if not inside:
            kept.append((x, y, w, h))
    return kept


def reading_order(boxes, row_tolerance):
    """Sortiert von oben nach unten, innerhalb einer Zeile von links nach rechts."""
    boxes = sorted(boxes, key=lambda b: b[1])
    rows: list[list] = []
    for box in boxes:
        if rows and abs(rows[-1][0][1] - box[1]) <= row_tolerance:
            rows[-1].append(box)
        else:
            rows.append([box])
    return [box for row in rows for box in sorted(row, key=lambda b: b[0])]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    photo = Path(sys.argv[1])
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    gray = load_upright(photo)
    height, width = gray.shape

    # Größenbereich relativ zur Bildbreite (Innenflächen sind ca. 2,5–16 % der Bildbreite breit).
    boxes = find_boxes(gray, int(width * 0.025), int(width * 0.16), int(width * 0.009), int(width * 0.06))
    boxes = reading_order(boxes, row_tolerance=int(width * 0.01))

    factor = 1 / SCALE
    result = {
        "foto": photo.name,
        "breite": int(width * factor),
        "hoehe": int(height * factor),
        "kaesten": [
            {"id": f"K{n:03d}", "x": int(x * factor), "y": int(y * factor), "w": int(w * factor), "h": int(h * factor)}
            for n, (x, y, w, h) in enumerate(boxes, start=1)
        ],
    }
    (out / "kaesten.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    # Kontrollbild
    preview = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    for item in result["kaesten"]:
        x, y, w, h = (int(item[k] * SCALE) for k in ("x", "y", "w", "h"))
        cv2.rectangle(preview, (x, y), (x + w, y + h), (0, 0, 220), 4)
        cv2.putText(preview, item["id"][1:], (x + 4, y + 34), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (0, 120, 0), 3)
    cv2.imwrite(str(out / "kaesten-uebersicht.jpg"), preview, [cv2.IMWRITE_JPEG_QUALITY, 80])
    print(f"{len(result['kaesten'])} Kästchen gefunden → {out / 'kaesten.json'}")


if __name__ == "__main__":
    main()
