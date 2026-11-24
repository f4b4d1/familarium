"""Führt die Agenten-Ergebnisse (Ehen, Kinder, Info-Texte, Lesungen neuer Kästchen) mit dem Arbeitsstand zusammen.

Aufruf:  .venv/Scripts/python -I scripts/original/fuehre_beziehungen_zusammen.py <arbeitsordner>
Liest:   beziehungen.json (von baue_beziehungen.py, noch nicht zusammengeführt), beziehungen-agenten/*.json,
         lesung-neu-A.json, lesung-neu-B.json
Schreibt beziehungen.json (zusammengeführt) und vorher eine Kopie beziehungen-basis.json

Regeln:
- Eine Ehe der ersten Auswertung gilt als geprüft, wenn Agenten dieselben zwei Partner und dieselben Kinder sehen
  und keiner unsicher war. Sonst bleibt sie offen (gestrichelt) mit Begründung in den Hinweisen.
- Info-Texte aus überlappenden Bereichen werden zusammengelegt (Lage + Wortlaut ähnlich). Offen bleiben Infos mit
  abweichendem Wortlaut, unsicherer Lesung oder ohne klare Zuordnung.
"""

import json
import re
import shutil
import statistics
import sys
from difflib import SequenceMatcher
from pathlib import Path

POS = re.compile(r"x\s*(\d+(?:[.,]\d+)?)\s*y\s*(\d+(?:[.,]\d+)?)", re.I)
PID = re.compile(r"P\d{3}")
ARTEN = {"heirat", "beruf", "ort", "sonstiges"}


def pos(text) -> tuple[float, float] | None:
    m = POS.search(str(text or ""))
    return (float(m[1].replace(",", ".")) * 100, float(m[2].replace(",", ".")) * 100) if m else None


def norm(text: str) -> str:
    return re.sub(r"[^a-zäöüß0-9]", "", text.lower())


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    work = Path(sys.argv[1])
    target = work / "beziehungen.json"
    data = json.loads(target.read_text(encoding="utf-8"))
    if data.get("zusammengefuehrt"):
        sys.exit("beziehungen.json ist schon zusammengeführt – nicht noch einmal (Nutzerarbeit!).")
    shutil.copyfile(target, work / "beziehungen-basis.json")
    persons = {p["id"]: p for p in data["personen"]}
    gen_no = {p["id"]: ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII"].index(p["generation"]) + 1
              if p["generation"] else 0 for p in data["personen"]}

    # ---------- Lesungen der neu gezogenen Kästchen ----------
    readings = [json.loads((work / f"lesung-neu-{k}.json").read_text(encoding="utf-8")) for k in "AB" if (work / f"lesung-neu-{k}.json").exists()]
    for pid, person in persons.items():
        found = [r[pid] for r in readings if pid in r]
        if person["zeilen"] or not found:
            continue
        person["zeilen"] = found[0]["zeilen"]
        texts = [" / ".join(f["zeilen"]) for f in found]
        if len(set(map(norm, texts))) > 1 or any(f.get("unsicher") for f in found):
            person["lesung_unsicher"] = True
            person["hinweise"] = [f"Lesung {k}: {t}" for k, t in zip("AB", texts)] + [f["hinweis"] for f in found if f.get("hinweis")]

    # ---------- Agenten-Dateien einlesen ----------
    reports = []
    for file in sorted((work / "beziehungen-agenten").glob("bereich-*.json")):
        try:
            reports.append(json.loads(file.read_text(encoding="utf-8")) | {"_name": file.stem})
        except json.JSONDecodeError as err:
            print(f"!! {file.name} nicht lesbar: {err}")

    # ---------- Ehen ----------
    marriages = data["ehen"]
    for m in marriages:
        m.update(stimmen=0, agent_kinder=set(), agent_punkte=[], agent_unsicher=False, agent_sicher=False)

    def known(refs):
        return [r for r in refs if r in persons]

    def overlap(m, children):
        return len((set(m["kinder"]) | m["agent_kinder"]) & set(children))

    agent_marriages = []
    for rep in reports:
        for e in rep.get("ehen", []):
            refs = [str(r).strip() for r in (e.get("partner") or [])]
            partners = known([PID.search(r)[0] if PID.search(r) else r for r in refs])
            mentioned = [r.split(":", 1)[1].strip() for r in refs if r.lower().startswith("erw")]
            children = [c for c in (e.get("kinder") or []) if c in persons]
            unknown_refs = [r for r in [*refs, *(e.get("kinder") or [])] if PID.fullmatch(str(r)) and r not in persons]
            agent_marriages.append({"bereich": rep["_name"], "partner": sorted(set(partners)), "erwaehnt": mentioned, "kinder": children,
                                    "punkt": pos(e.get("punkt")), "unsicher": bool(e.get("unsicher")), "hinweis": e.get("hinweis", ""),
                                    "fremd": unknown_refs})
    agent_marriages.sort(key=lambda a: -len(a["partner"]))

    def new_marriage(a):
        nid = f"E{max(int(m['id'][1:]) for m in marriages) + 1:03d}"
        x, y = a["punkt"] or (None, None)
        if x is None:
            anchor = persons[(a["partner"] or a["kinder"])[0]]
            x, y = anchor["x"] + anchor["w"] + 120, anchor["y"] + anchor["h"] / 2
        m = {"id": nid, "x": round(x), "y": round(y), "partner": list(a["partner"]), "partner_text": [], "kinder": [],
             "herkunft": "agent", "unsicher": True, "alt_wortlaut": [], "alt_ehe_nr": "", "hinweise": [],
             "stimmen": 0, "agent_kinder": set(), "agent_punkte": [], "agent_unsicher": False, "agent_sicher": False}
        marriages.append(m)
        return m

    def dist(m, a):
        if not a["punkt"]:
            return 0
        return abs(m["x"] - a["punkt"][0]) + abs(m["y"] - a["punkt"][1])

    for a in agent_marriages:
        if not a["partner"] and not a["kinder"]:
            continue
        ps = set(a["partner"])
        match = None
        if len(ps) == 2:
            match = next((m for m in marriages if set(m["partner"]) == ps), None)
            if not match:  # Ehe mit nur einem bekannten Partner, der jetzt ergänzt wird
                cands = [m for m in marriages if len(m["partner"]) == 1 and set(m["partner"]) < ps and overlap(m, a["kinder"])]
                match = cands[0] if len(cands) == 1 else None
                if match:
                    match["partner"] = sorted(ps)
                    match["hinweise"].append(f"{a['bereich']}: zweiter Partner ergänzt")
        elif len(ps) == 1:
            cands = [m for m in marriages if ps <= set(m["partner"])]
            if len(cands) > 1:
                best = max(overlap(m, a["kinder"]) for m in cands)
                cands = [m for m in cands if overlap(m, a["kinder"]) == best]
                cands.sort(key=lambda m: dist(m, a))
            match = cands[0] if cands else None
        else:
            cands = [m for m in marriages if overlap(m, a["kinder"])]
            cands.sort(key=lambda m: -overlap(m, a["kinder"]))
            match = cands[0] if cands else None
        m = match or new_marriage(a)
        m["stimmen"] += 1
        m["agent_kinder"] |= set(a["kinder"])
        if a["punkt"]:
            m["agent_punkte"].append(a["punkt"])
        m["agent_unsicher"] |= a["unsicher"]
        m["agent_sicher"] |= not a["unsicher"]
        for t in a["erwaehnt"]:
            if t and norm(t) not in map(norm, m["partner_text"]):
                m["partner_text"].append(t)
        if a["hinweis"]:
            m["hinweise"].append(f"{a['bereich']}: {a['hinweis']}")
        if a["fremd"]:
            m["hinweise"].append(f"{a['bereich']}: unbekannte Kennungen {a['fremd']}")

    for m in marriages:
        m["textehe"] = (m["herkunft"] == "alt" and not m["stimmen"] and not m["kinder"] and len(m["partner"]) == 1)

    # Ehen nur aus dem Kästchentext („⚭ 1.2.1850 Name"): Doppelte zusammenlegen; hat die Person genau eine
    # weitere Ehe, ist es vermutlich dieselbe – dort anhängen (bleibt offen); sonst gilt sie als belegt.
    def absorb(into, m, note):
        into["alt_wortlaut"] += [w for w in m["alt_wortlaut"] if w not in into["alt_wortlaut"]]
        into["partner_text"] += [t for t in m["partner_text"] if t not in into["partner_text"]]
        into["hinweise"].append(f"{note} ({m['id']}: {' '.join(m['alt_wortlaut']) or '–'})")
        marriages.remove(m)

    for m in [m for m in marriages if m["textehe"]]:
        same = [o for o in marriages if o is not m and o["partner"] == m["partner"] and o.get("textehe")]
        if same:
            absorb(same[0], m, "doppelte Ehe aus Kästchentext zusammengelegt")
            continue
        others = [o for o in marriages if o is not m and m["partner"][0] in o["partner"] and not o.get("textehe")]
        if len(others) == 1:
            absorb(others[0], m, "Prüfen: Ehe aus Kästchentext hierher gelegt – dieselbe Ehe?")
            others[0]["textehe_angehaengt"] = True

    for m in marriages:
        old_children = set(m["kinder"])
        if m["agent_punkte"]:
            m["x"] = round(statistics.median(p[0] for p in m["agent_punkte"]))
            m["y"] = round(statistics.median(p[1] for p in m["agent_punkte"]))
        reasons = []
        if m["herkunft"] == "alt" and m["stimmen"]:
            only_old, only_new = old_children - m["agent_kinder"], m["agent_kinder"] - old_children
            if only_old:
                reasons.append(f"Kinder nur in erster Auswertung: {', '.join(sorted(only_old))}")
            if only_new:
                reasons.append(f"Kinder nur von Agenten: {', '.join(sorted(only_new))}")
        elif m["textehe"]:
            m["hinweise"].insert(0, "Ehe aus dem Kästchentext (keine Linie im Bild)")
        elif m["herkunft"] == "alt":
            reasons.append("von den Agenten nicht gefunden")
        else:
            reasons.append("nur von Agenten gefunden")
        m["kinder"] = sorted(old_children | m["agent_kinder"], key=lambda c: persons[c]["x"])
        gens = [gen_no[p] for p in m["partner"] if gen_no.get(p)]
        late = [c for c in m["kinder"] if gens and gen_no.get(c) and gen_no[c] <= max(gens)]
        if late:
            reasons.append(f"Kind nicht unterhalb der Eltern-Generation: {', '.join(late)}")
        if m["agent_unsicher"] and not m["agent_sicher"]:
            reasons.append("Agent war unsicher")
        if m.pop("textehe_angehaengt", False):
            reasons.append("Ehe aus Kästchentext angehängt")
        m["unsicher"] = bool(reasons)
        if reasons:
            m["hinweise"].insert(0, "Prüfen: " + "; ".join(reasons))
        for k in ("stimmen", "agent_kinder", "agent_punkte", "agent_unsicher", "agent_sicher", "textehe"):
            del m[k]

    parents = {}
    for m in marriages:
        for c in m["kinder"]:
            parents.setdefault(c, []).append(m)
    for c, ms in parents.items():
        if len(ms) > 1:
            for m in ms:
                m["unsicher"] = True
                m["hinweise"].insert(0, f"Prüfen: Kind {c} hängt an mehreren Ehen ({', '.join(x['id'] for x in ms)})")

    # ---------- Infos ----------
    raw = []
    for rep in reports:
        for inf in rep.get("infos", []):
            a, b = pos(inf.get("von")), pos(inf.get("bis"))
            if not a:
                continue
            b = b or (a[0] + 300, a[1] + 100)
            x1, x2 = sorted((a[0], b[0]))
            y1, y2 = sorted((a[1], b[1]))
            if x2 - x1 < 120:
                x2 = x1 + 120
            if y2 - y1 < 60:
                y2 = y1 + 60
            raw.append({"bereich": rep["_name"], "art": inf.get("art") if inf.get("art") in ARTEN else "sonstiges",
                        "wortlaut": str(inf.get("wortlaut", "")).strip(), "rect": (x1, y1, x2, y2),
                        "gehoert_zu": str(inf.get("gehoert_zu", "") or ""), "unsicher": bool(inf.get("unsicher")),
                        "hinweis": inf.get("hinweis", "")})

    def iou(r, s):
        w = min(r[2], s[2]) - max(r[0], s[0])
        h = min(r[3], s[3]) - max(r[1], s[1])
        inter = max(0, w) * max(0, h)
        return inter / ((r[2] - r[0]) * (r[3] - r[1]) + (s[2] - s[0]) * (s[3] - s[1]) - inter)

    def similar(t, u):
        a, b = norm(t), norm(u)
        return bool(a and b) and (a in b or b in a or SequenceMatcher(None, a, b).ratio() >= 0.6)

    clusters = []
    for r in raw:
        cx, cy = (r["rect"][0] + r["rect"][2]) / 2, (r["rect"][1] + r["rect"][3]) / 2
        best = None
        for c in clusters:
            if c[0]["bereich"] == r["bereich"]:
                continue
            q = c[0]["rect"]
            near = iou(q, r["rect"]) > 0.15 or (abs((q[0] + q[2]) / 2 - cx) < 250 and abs((q[1] + q[3]) / 2 - cy) < 150)
            if near and similar(c[0]["wortlaut"], r["wortlaut"]) and all(x["bereich"] != r["bereich"] for x in c):
                best = c
                break
        (best.append(r) if best else clusters.append([r]))

    def resolve(ref: str, rect) -> str | None:
        ids = PID.findall(ref)
        if ref.lower().startswith("ehe"):
            want = set(i for i in ids if i in persons)
            cands = [m for m in marriages if want and want <= set(m["partner"])]
            exact = [m for m in cands if set(m["partner"]) == want]
            cands = exact or cands
            if not cands:
                return None
            cx, cy = (rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2
            return min(cands, key=lambda m: abs(m["x"] - cx) + abs(m["y"] - cy))["id"]
        return ids[0] if ids and ids[0] in persons else None

    infos = []
    for c in clusters:
        texts = [x["wortlaut"] for x in c]
        counts = {t: texts.count(t) for t in texts}
        longest = max(texts, key=lambda t: len(norm(t)))
        cut_off = all(norm(t) in norm(longest) for t in texts)  # nur am Rand abgeschnitten: kein Widerspruch
        text = longest if cut_off else max(counts, key=lambda t: (counts[t], len(t)))
        rect = tuple(statistics.median(x["rect"][i] for x in c) for i in range(4))
        arts = [x["art"] for x in c]
        art = max(set(arts), key=arts.count)
        refs = {resolve(x["gehoert_zu"], rect) for x in c}
        refs.discard(None)
        hints, reasons = [], []
        if not cut_off:
            reasons.append("Lesarten: " + " | ".join(dict.fromkeys(texts)))
        if len(set(arts)) > 1:
            reasons.append("Art uneinig: " + ", ".join(dict.fromkeys(arts)))
        if not refs:
            reasons.append(f"Zuordnung unklar ({' / '.join(dict.fromkeys(x['gehoert_zu'] for x in c)) or 'keine Angabe'})")
        elif len(refs) > 1:
            reasons.append("Zuordnung uneinig: " + ", ".join(sorted(refs)))
        if all(x["unsicher"] for x in c):
            reasons.append("Agent war unsicher")
        if "[" in text:
            reasons.append("unsichere Zeichen im Wortlaut")
        hints += [f"{x['bereich']}: {x['hinweis']}" for x in c if x["hinweis"]]
        infos.append({"id": "", "art": art, "x": round(rect[0]), "y": round(rect[1]), "w": round(rect[2] - rect[0]),
                      "h": round(rect[3] - rect[1]), "wortlaut": text, "gehoert_zu": sorted(refs)[:1] if len(refs) > 1 else sorted(refs),
                      "unsicher": bool(reasons), "herkunft": "agent", "bereiche": [x["bereich"] for x in c],
                      "hinweise": (["Prüfen: " + "; ".join(reasons)] if reasons else []) + hints})
    infos.sort(key=lambda i: (i["y"], i["x"]))
    for n, inf in enumerate(infos, start=1):
        inf["id"] = f"I{n:03d}"

    # ---------- Zwillinge ----------
    twins = {tuple(sorted(t)) for t in data.get("zwillinge", [])}
    for rep in reports:
        for t in rep.get("zwillinge", []):
            t = [x for x in t if x in persons]
            if len(set(t)) == 2:
                twins.add(tuple(sorted(t)))

    data.update(ehen=marriages, infos=infos, zwillinge=[list(t) for t in sorted(twins)], zusammengefuehrt=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    linked = {p for m in marriages for p in m["partner"] + m["kinder"]}
    print(f"{len(reports)} Bereichsdateien gelesen")
    print(f"Ehen: {len(marriages)} (offen {sum(m['unsicher'] for m in marriages)}, neu von Agenten {sum(m['herkunft'] == 'agent' for m in marriages)})")
    print(f"Infos: {len(infos)} (offen {sum(i['unsicher'] for i in infos)}) aus {len(raw)} Meldungen; je Art:",
          {a: sum(i['art'] == a for i in infos) for a in sorted(ARTEN)})
    print(f"Zwillingspaare: {len(twins)}; Personen ohne Verbindung: {sorted(set(persons) - linked)}")
    print(f"Neue Lesungen unsicher: {[p for p in persons.values() if p.get('lesung_unsicher')].__len__()}")


if __name__ == "__main__":
    main()
