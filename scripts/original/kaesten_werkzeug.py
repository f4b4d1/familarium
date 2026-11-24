"""Werkzeug zum Prüfen der Kästchen und Einzeichnen der Generationslinien im Browser.

Aufruf:  .venv/Scripts/python -I scripts/original/kaesten_werkzeug.py
Öffnet http://127.0.0.1:8765 (nur auf diesem Rechner erreichbar).

Liest beim ersten Start:  private/arbeit/zwischenstand.json (Kästchen der Personen, auch übersehene Uxx),
                          private/arbeit/kaesten.json (Fotogröße)
Schreibt bei jeder Änderung: private/arbeit/kaesten-korrektur.json (danach wird von dort weitergearbeitet)
Alle Koordinaten beziehen sich auf das Originalfoto (kaesten.json: breite × hoehe).
"""

import json
import os
import sys
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "private" / "arbeit"
MEDIA = ROOT / "private" / "medien"
PAGE = Path(__file__).with_name("kaesten-werkzeug.html")
RESULT = WORK / "kaesten-korrektur.json"
DISPLAY = WORK / "foto-anzeige.jpg"
TARGET = 293  # vom Nutzer gezählte Personen auf dem Original
PORT = 8765


def initial_data() -> dict:
    if RESULT.exists():
        return json.loads(RESULT.read_text(encoding="utf-8"))
    meta = json.loads((WORK / "kaesten.json").read_text(encoding="utf-8"))
    state = json.loads((WORK / "zwischenstand.json").read_text(encoding="utf-8"))
    boxes = []
    for person in state["personen"]:
        image = person.get("bild")
        if person.get("quelle") in ("kaestchen", "unnummeriert") and image:
            origin = "K" if person["id"].startswith("K") else "U"
            boxes.append({"id": person["id"], "herkunft": origin, **{k: int(image[k]) for k in ("x", "y", "w", "h")}})
    return {"foto": meta["foto"], "breite": meta["breite"], "hoehe": meta["hoehe"], "ziel": TARGET,
            "kaesten": boxes, "generationslinien": []}


def ensure_display_photo(meta: dict) -> None:
    if DISPLAY.exists():
        return
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = None
    with Image.open(MEDIA / meta["foto"]) as im:
        im.convert("RGB").resize((meta["breite"] * 2 // 5, meta["hoehe"] * 2 // 5), Image.LANCZOS).save(DISPLAY, quality=85)


def valid(data) -> bool:
    if not isinstance(data, dict) or not isinstance(data.get("kaesten"), list) or not isinstance(data.get("generationslinien"), list):
        return False
    numbers = all(isinstance(b.get(k), (int, float)) for b in data["kaesten"] for k in ("x", "y", "w", "h"))
    points = all(isinstance(line.get("punkte"), list) for line in data["generationslinien"])
    return numbers and points


class Handler(BaseHTTPRequestHandler):
    def send(self, status: int, body: bytes, kind: str, cache: bool = False) -> None:
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "max-age=86400" if cache else "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path in ("/", "/index.html"):
            self.send(200, PAGE.read_bytes(), "text/html; charset=utf-8")
        elif self.path == "/foto.jpg":
            self.send(200, DISPLAY.read_bytes(), "image/jpeg", cache=True)
        elif self.path == "/daten":
            self.send(200, json.dumps(initial_data(), ensure_ascii=False).encode("utf-8"), "application/json")
        else:
            self.send(404, b"nicht gefunden", "text/plain")

    def do_POST(self) -> None:
        if self.path != "/daten":
            self.send(404, b"nicht gefunden", "text/plain")
            return
        try:
            data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            data = None
        if not valid(data):
            self.send(400, b"ungueltige Daten", "text/plain")
            return
        temp = RESULT.with_suffix(".tmp")
        temp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(temp, RESULT)
        self.send(200, b"ok", "text/plain")

    def log_message(self, *args) -> None:  # Konsole ruhig halten
        pass


def main() -> None:
    meta = json.loads((WORK / "kaesten.json").read_text(encoding="utf-8"))
    ensure_display_photo(meta)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}/"
    print(f"Kästchen-Werkzeug läuft: {url}")
    print(f"Ergebnis wird laufend gespeichert in: {RESULT}")
    print("Beenden mit Strg+C.")
    if "--kein-browser" not in sys.argv:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
