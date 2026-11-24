"""Führt Lesungen, Schiedsurteile und Zusammenhänge zu einem Zwischenstand zusammen.

Aufruf:  .venv/Scripts/python -I scripts/original/zusammenfuehren.py <arbeitsordner>
Liest:   kaesten.json, lesungen.json, schiedsrichter/urteil-*.json, struktur/*.json
Schreibt zwischenstand.json und gibt eine Prüfübersicht aus.

Personen-Kennungen: Kxxx (erkanntes Kästchen), Uxx (übersehenes Kästchen, aus der Lage),
Exx (nur erwähnte Person, z. B. Ehepartner im Kästchentext).
"""

import json
import re
import sys
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

U_PATTERN = re.compile(r"U:\s*x(\d+)\s*y(\d+)", re.I)
K_PATTERN = re.compile(r"^K(\d{3})$")
CLUSTER = 3  # Hunderter-Pixel: Meldungen übersehener Kästchen innerhalb dieses Abstands sind dasselbe Kästchen


def norm(text: str) -> str:
    return re.sub(r"[^a-zäöüß0-9]", "", text.lower())


def name_key(text: str) -> str:
    """Namensteil einer freien Partnerangabe: vor Klammer, Stern oder Lageangabe."""
    text = re.split(r"[(*†]|\bKennung\b|\baus Kästchen\b", text)[0]
    return norm(text)


def load_readings(work: Path):
    readings = json.loads((work / "lesungen.json").read_text(encoding="utf-8"))
    verdicts = {}
    for file in sorted((work / "schiedsrichter").glob("urteil-*.json")):
        verdicts.update(json.loads(file.read_text(encoding="utf-8")))
    boxes = {b["id"]: b for b in json.loads((work / "kaesten.json").read_text(encoding="utf-8"))["kaesten"]}
    persons = {}
    for box_id, entry in readings.items():
        if entry["status"] == "kein_kaestchen":
            continue
        first = entry["lesung_1"][0] if entry["lesung_1"] else {}
        if first.get("typ") not in (None, "person") and entry["status"] != "verschieden":
            continue
        reasons = []
        if entry["status"] == "verschieden" and box_id in verdicts:
            verdict = verdicts[box_id]
            lines, outside = verdict.get("zeilen", []), verdict.get("aussen", [])
            if verdict.get("pruefen"):
                reasons.append(f"Lesung prüfen: {verdict.get('begruendung', '')}".strip())
        else:
            lines, outside = first.get("zeilen", []), []
            if any(e.get("unsicher") for e in entry["lesung_1"] + entry["lesung_2"]) or any("[" in line for line in lines):
                reasons.append("Lesung prüfen: Leser waren unsicher")
        if not lines:
            continue
        persons[box_id] = {"id": box_id, "quelle": "kaestchen", "zeilen": lines, "aussen": outside, "gruende": reasons, "bild": boxes.get(box_id), "alias": []}
    return persons


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    work = Path(sys.argv[1])
    persons = load_readings(work)
    problems: list[str] = []

    # Doppelt gezeichnete Personen: gleicher Text in den ersten drei Zeilen.
    by_text = defaultdict(list)
    for pid, person in persons.items():
        by_text[norm(" ".join(person["zeilen"][:3]))].append(pid)
    canonical = {}
    for ids in by_text.values():
        ids.sort()
        for alias in ids[1:]:
            canonical[alias] = ids[0]
            persons[ids[0]]["alias"].append(alias)
            persons[ids[0]].setdefault("weitere_bilder", []).append(persons[alias]["bild"])
            del persons[alias]

    structures = []
    for file in sorted((work / "struktur").glob("bereich-*.json")):
        data = json.loads(file.read_text(encoding="utf-8"))
        data["_datei"] = file.stem
        structures.append(data)

    # Übersehene Kästchen sammeln und nach Lage zusammenfassen.
    u_boxes: list[dict] = []

    def u_for(x: int, y: int, lines=None) -> str:
        for u in u_boxes:
            if abs(u["x"] - x) <= CLUSTER and abs(u["y"] - y) <= CLUSTER:
                if lines and len(" ".join(lines)) > len(" ".join(u["zeilen"])):
                    u["zeilen"] = lines
                u["meldungen"] += 1
                return u["id"]
        uid = f"U{len(u_boxes) + 1:02d}"
        u_boxes.append({"id": uid, "x": x, "y": y, "zeilen": lines or [], "meldungen": 1})
        return uid

    for data in structures:
        for entry in data.get("unnummerierte_kaesten", []):
            m = U_PATTERN.search("U:" + entry.get("lage", ""))
            if m:
                u_for(int(m[1]), int(m[2]), entry.get("zeilen", []))

    mentioned: dict[str, dict] = {}
    name_index = [(pid, norm(" ".join(p["zeilen"][:2]))) for pid, p in persons.items()]

    def resolve(ref: str, where: str) -> str | None:
        ref = (ref or "").strip()
        if not ref or ref.lower().startswith("unbekannt"):
            return None
        m = K_PATTERN.match(ref)
        if m:
            return canonical.get(ref, ref) if (canonical.get(ref, ref) in persons) else ref
        m = U_PATTERN.search(ref)
        if m:
            return u_for(int(m[1]), int(m[2]))
        key = name_key(ref)
        if len(key) >= 6:
            best, score = None, 0.0
            for pid, text in name_index:
                s = SequenceMatcher(None, key, text[: len(key) + 4]).ratio()
                if s > score:
                    best, score = pid, s
            if best and score >= 0.82:
                return best
        eid = mentioned.get(key, {}).get("id") or f"E{len(mentioned) + 1:02d}"
        mentioned.setdefault(key, {"id": eid, "quelle": "erwaehnt", "zeilen": [re.split(r"\(", ref)[0].strip()], "gruende": [f"nur erwähnt ({where})"]})
        return eid

    marriages: dict[tuple, dict] = {}
    twins: set[tuple] = set()
    free_texts, references = [], []
    for data in structures:
        where = data["_datei"]
        for e in data.get("ehen", []):
            partners = [resolve(p, where) for p in (e.get("partner") or [])][:2]
            while len(partners) < 2:
                partners.append(None)
            known = tuple(sorted(p for p in partners if p))
            if not known:
                continue
            wortlaut = (e.get("wortlaut") or "").strip()
            # Ehen mit unbekanntem Partner zusätzlich über den Wortlaut unterscheiden.
            key = known if len(known) == 2 else known + (norm(wortlaut)[:12] or "?",)
            m = marriages.setdefault(key, {"partner": sorted(partners, key=lambda p: (p is None, p or "")), "wortlaut": [], "ehe_nr": "", "kinder": [], "unsicher": False, "hinweise": [], "bereiche": []})
            if wortlaut and wortlaut not in m["wortlaut"]:
                m["wortlaut"].append(wortlaut)
            m["ehe_nr"] = m["ehe_nr"] or e.get("ehe_nr", "")
            for child in e.get("kinder", []):
                cid = resolve(child, where)
                if cid and cid not in m["kinder"]:
                    m["kinder"].append(cid)
            m["unsicher"] = m["unsicher"] or bool(e.get("unsicher"))
            if e.get("hinweis"):
                m["hinweise"].append(f"{where}: {e['hinweis']}")
            m["bereiche"].append(where)
        for pair in data.get("zwillinge", []):
            ids = tuple(sorted(filter(None, (resolve(p, where) for p in pair))))
            if len(ids) == 2:
                twins.add(ids)
        for t in data.get("freie_texte", []):
            free_texts.append({"wortlaut": t.get("wortlaut", ""), "gehoert_zu": resolve(t.get("gehoert_zu", ""), where) if t.get("gehoert_zu") else None, "lage": t.get("lage", ""), "bereich": where})
        for v in data.get("verweise", []):
            references.append({"von": resolve(v.get("von", ""), where), "nach": resolve(v.get("nach", ""), where), "beschriftung": v.get("beschriftung", ""), "bereich": where})

    # Freie Texte entdoppeln (überlappende Bereiche).
    seen, unique_texts = set(), []
    for t in free_texts:
        k = (norm(t["wortlaut"]), t["gehoert_zu"])
        if k not in seen:
            seen.add(k)
            unique_texts.append(t)

    all_persons = list(persons.values()) + [
        {"id": u["id"], "quelle": "unnummeriert", "zeilen": u["zeilen"], "aussen": [], "gruende": ["Kästchen nur aus Strukturdurchgang gelesen (noch zweimal lesen)"], "bild": {"x": u["x"] * 100 - 200, "y": u["y"] * 100 - 100, "w": 400, "h": 200}, "alias": [], "meldungen": u["meldungen"]}
        for u in u_boxes
    ] + list(mentioned.values())

    # Angeschnittene Meldungen derselben Ehe zusammenlegen: Teilen zwei Meldungen Kinder und ist eine davon
    # unvollständig (Partner unbekannt oder nur als Name „erwähnt"), gehört sie zur vollständigeren.
    def completeness(m: dict) -> int:
        return sum(1 for p in m["partner"] if p and not p.startswith("E"))

    merged_away: set[tuple] = set()
    changed = True
    while changed:
        changed = False
        keys = [k for k in marriages if k not in merged_away]
        for a in keys:
            for b in keys:
                if a == b or a in merged_away or b in merged_away:
                    continue
                ma, mb = marriages[a], marriages[b]
                shared = set(ma["kinder"]) & set(mb["kinder"])
                if not shared or completeness(ma) < completeness(mb) or completeness(mb) == 2:
                    continue
                known_b = {p for p in mb["partner"] if p and not p.startswith("E")}
                if not known_b <= set(ma["partner"]):
                    continue
                for c in mb["kinder"]:
                    if c not in ma["kinder"]:
                        ma["kinder"].append(c)
                for w in mb["wortlaut"]:
                    if w not in ma["wortlaut"]:
                        ma["wortlaut"].append(w)
                ma["hinweise"] += mb["hinweise"]
                ma["bereiche"] += mb["bereiche"]
                merged_away.add(b)
                changed = True
    for k in merged_away:
        del marriages[k]
    used = {p for m in marriages.values() for p in m["partner"] + m["kinder"] if p} | {t["gehoert_zu"] for t in unique_texts if t["gehoert_zu"]}
    all_persons = [p for p in all_persons if p["quelle"] != "erwaehnt" or p["id"] in used]

    # Prüfungen
    parents_of = defaultdict(list)
    for key, m in marriages.items():
        for c in m["kinder"]:
            parents_of[c].append(key)
    for child, keys in parents_of.items():
        if len(keys) > 1:
            problems.append(f"{child}: mehreren Ehen als Kind zugeordnet: {[marriages[k]['partner'] for k in keys]}")
    in_marriage = {p for m in marriages.values() for p in m["partner"] if p}
    orphans = [p["id"] for p in all_persons if p["id"] not in parents_of and p["id"] not in in_marriage and p["quelle"] != "erwaehnt"]
    for o in orphans:
        problems.append(f"{o}: weder Kind noch Partner einer Ehe")

    result = {
        "personen": all_persons,
        "ehen": [{"id": f"EHE{i + 1:03d}", **m} for i, m in enumerate(marriages.values())],
        "zwillinge": sorted(twins),
        "freie_texte": unique_texts,
        "verweise": references,
        "probleme": problems,
    }
    (work / "zwischenstand.json").write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")
    counts = defaultdict(int)
    for p in all_persons:
        counts[p["quelle"]] += 1
    print(f"Personen: {dict(counts)} (doppelt gezeichnet zusammengelegt: {len(canonical)})")
    print(f"Ehen: {len(marriages)}, davon unsicher: {sum(m['unsicher'] for m in marriages.values())}; Zwillinge: {len(twins)}; freie Texte: {len(unique_texts)}; Verweise: {len(references)}")
    print(f"Probleme: {len(problems)}")
    for p in problems[:40]:
        print("  -", p)


if __name__ == "__main__":
    main()
