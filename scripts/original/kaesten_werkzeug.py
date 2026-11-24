"""Werkzeug zum Prüfen der Personen-Kästchen, Ehen, Kinder und Info-Kästchen im Browser.

Aufruf:  .venv/Scripts/python -I scripts/original/kaesten_werkzeug.py [--kein-browser]
Öffnet http://127.0.0.1:8765 (nur auf diesem Rechner erreichbar).

Arbeitet auf private/arbeit/beziehungen.json (erzeugt von baue_beziehungen.py und fuehre_beziehungen_zusammen.py)
und speichert jede Änderung sofort dorthin. Beim Start wird eine Sicherung beziehungen-sicherung.json angelegt.
Alle Koordinaten beziehen sich auf das Originalfoto (breite × hoehe).
"""

import json
import os
import shutil
import sys
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "private" / "arbeit"
MEDIA = ROOT / "private" / "medien"
PAGE = Path(__file__).with_name("kaesten-werkzeug.html")
DATA = WORK / "beziehungen.json"
BACKUP = WORK / "beziehungen-sicherung.json"
DISPLAY = WORK / "foto-anzeige.jpg"
PORT = 8765
LISTS = ("personen", "ehen", "infos", "generationslinien")


def ensure_display_photo(meta: dict) -> None:
    if DISPLAY.exists():
        return
    from PIL import Image, ImageOps

    Image.MAX_IMAGE_PIXELS = None
    with Image.open(MEDIA / meta["foto"]) as im:
        upright = ImageOps.exif_transpose(im).convert("RGB")
        upright.resize((meta["breite"] * 2 // 5, meta["hoehe"] * 2 // 5), Image.LANCZOS).save(DISPLAY, quality=85)


def valid(data) -> bool:
    if not isinstance(data, dict) or not all(isinstance(data.get(k), list) for k in LISTS):
        return False
    boxes = data["personen"] + data["infos"]
    numbers = all(isinstance(b.get(k), (int, float)) for b in boxes for k in ("x", "y", "w", "h"))
    points = all(isinstance(e.get("x"), (int, float)) and isinstance(e.get("y"), (int, float)) for e in data["ehen"])
    return numbers and points and all(isinstance(line.get("punkte"), list) for line in data["generationslinien"])


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
            self.send(200, DATA.read_bytes(), "application/json; charset=utf-8")
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
        temp = DATA.with_suffix(".tmp")
        temp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(temp, DATA)
        self.send(200, b"ok", "text/plain")

    def log_message(self, *args) -> None:  # Konsole ruhig halten
        pass


def main() -> None:
    global DATA, BACKUP
    sys.stdout.reconfigure(encoding="utf-8")
    if "--datei" in sys.argv:  # zum Testen auf einer Kopie arbeiten
        DATA = Path(sys.argv[sys.argv.index("--datei") + 1]).resolve()
        BACKUP = DATA.with_name(DATA.stem + "-sicherung.json")
    if not DATA.exists():
        sys.exit(f"{DATA} fehlt – zuerst baue_beziehungen.py ausführen.")
    meta = json.loads(DATA.read_text(encoding="utf-8"))
    ensure_display_photo(meta)
    shutil.copyfile(DATA, BACKUP)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}/"
    print(f"Kästchen-Werkzeug läuft: {url}")
    print(f"Änderungen werden laufend gespeichert in: {DATA} (Sicherung vom Start: {BACKUP.name})")
    print("Beenden mit Strg+C.")
    if "--kein-browser" not in sys.argv:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
