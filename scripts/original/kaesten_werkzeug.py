"""Werkzeug zum Prüfen der Übertragung im Browser (nur auf diesem Rechner erreichbar: http://127.0.0.1:8765).

Aufruf:  .venv/Scripts/python -I scripts/original/kaesten_werkzeug.py [--pruefen] [--kein-browser]

Zwei Seiten:
- /         Kästchen, Ehen, Kinder und Info-Kästchen auf dem Foto. Arbeitet auf private/arbeit/beziehungen.json und
            speichert jede Änderung sofort dorthin (Sicherung beim Start: beziehungen-sicherung.json).
- /pruefen  Prüf-Ansicht für die Prüfliste (private/arbeit/pruefliste.json, erzeugt von baue_datenbestand.ts):
            Bildausschnitt (private/arbeit/pruef-bilder/, erzeugt von pruef_bilder.py), Wortlaut und Deutung.
            Entscheidungen landen in private/arbeit/pruef-entscheidungen.json; baue_datenbestand.ts wendet sie an.
Alle Koordinaten beziehen sich auf das Originalfoto (breite × hoehe).
"""

import json
import os
import re
import shutil
import subprocess
import sys
import threading
import webbrowser
from datetime import date
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
REVIEW_PAGE = Path(__file__).with_name("pruefen.html")
REVIEW_LIST = WORK / "pruefliste.json"
DECISIONS = WORK / "pruef-entscheidungen.json"
CROPS = WORK / "pruef-bilder"
BUILDER = ROOT / "scripts" / "original" / "baue_datenbestand.ts"
decision_lock = threading.Lock()


def read_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def write_json(path: Path, data) -> None:
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(temp, path)


def review_data() -> dict:
    """Alles, was die Prüf-Ansicht braucht: Prüfpunkte, Wortlaut, Deutung, frühere Lesarten, Entscheidungen."""
    bz = read_json(DATA, {"personen": [], "infos": []})
    readings = read_json(WORK / "lesungen.json", {})
    interpretation = {}
    for file in sorted((WORK / "deutung").glob("ergebnis-*.json")):
        interpretation.update(read_json(file, {}))
    persons = {}
    for p in bz["personen"]:
        variants = []
        entry = readings.get(p.get("alt") or "", {})
        for key in ("lesung_1", "lesung_2"):
            first = (entry.get(key) or [{}])[0]
            text = " / ".join(first.get("zeilen", []))
            if text and text not in variants:
                variants.append(text)
        persons[p["id"]] = {"id": p["id"], "zeilen": p["zeilen"], "generation": p.get("generation"), "gleich_wie": p.get("gleich_wie"),
                            "hinweise": p.get("hinweise", []), "lesarten": variants, "deutung": interpretation.get(p["id"])}
    infos = {i["id"]: {"id": i["id"], "art": i["art"], "wortlaut": i["wortlaut"]} for i in bz["infos"]}
    return {"pruefliste": read_json(REVIEW_LIST, []), "personen": persons, "infos": infos, "entscheidungen": read_json(DECISIONS, {})}


def save_decision(payload) -> bool:
    if not isinstance(payload, dict) or not isinstance(payload.get("schluessel"), str):
        return False
    decision = payload.get("entscheidung")
    if decision is not None and not (isinstance(decision, dict) and decision.get("status") == "erledigt"):
        return False
    with decision_lock:
        decisions = read_json(DECISIONS, {})
        if decision is None:
            decisions.pop(payload["schluessel"], None)
        else:
            decisions[payload["schluessel"]] = {**decision, "am": date.today().isoformat()}
        write_json(DECISIONS, decisions)
    return True


def rebuild() -> tuple[bool, str]:
    result = subprocess.run(["node", str(BUILDER)], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=180)
    return result.returncode == 0, (result.stdout + result.stderr).strip()


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
        elif self.path == "/pruefen":
            self.send(200, REVIEW_PAGE.read_bytes(), "text/html; charset=utf-8")
        elif self.path == "/pruefdaten":
            self.send(200, json.dumps(review_data(), ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")
        elif (m := re.fullmatch(r"/bild/([PI]\d{3})\.jpg", self.path)) and (CROPS / f"{m[1]}.jpg").exists():
            self.send(200, (CROPS / f"{m[1]}.jpg").read_bytes(), "image/jpeg", cache=True)
        else:
            self.send(404, b"nicht gefunden", "text/plain")

    def do_POST(self) -> None:
        try:
            data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("utf-8") or "null")
        except (ValueError, UnicodeDecodeError):
            data = None
        if self.path == "/entscheidung":
            ok = save_decision(data)
            self.send(200 if ok else 400, b"ok" if ok else b"ungueltige Entscheidung", "text/plain")
            return
        if self.path == "/neu-bauen":
            ok, output = rebuild()
            self.send(200 if ok else 500, output.encode("utf-8"), "text/plain; charset=utf-8")
            return
        if self.path != "/daten":
            self.send(404, b"nicht gefunden", "text/plain")
            return
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
    url = f"http://127.0.0.1:{PORT}/" + ("pruefen" if "--pruefen" in sys.argv else "")
    if not CROPS.exists():
        print("Hinweis: Bildausschnitte fehlen – zuerst scripts/original/pruef_bilder.py ausführen.")
    print(f"Werkzeug läuft: {url}")
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
