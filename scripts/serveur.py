#!/usr/bin/env python3
"""
Serveur local de « Mon Budget », à utiliser sur le Mac à la place de
`python3 -m http.server`.

- Sert l'application (comme http.server).
- Reçoit les sauvegardes CHIFFRÉES envoyées par l'app et les écrit dans
  Finance/sauvegardes/ (+ un historique daté des 20 dernières).
- N'écoute que sur 127.0.0.1 : inaccessible depuis le réseau.
- Lit les taux officiels du Livret A et du LEP sur service-public.gouv.fr
  (/api/taux-livrets) : le navigateur ne peut pas lire cette page lui-même.
  Seule une requête publique part vers ce site, sans aucune donnée personnelle.

Lancement :  python3 scripts/serveur.py            (port 8080)
             python3 scripts/serveur.py --port 8090
             python3 scripts/serveur.py --sauvegardes ~/Autre/dossier
"""
import argparse
import datetime as dt
import html
import json
import os
import pathlib
import re
import tempfile
import time
import urllib.request
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent.parent
BACKUP_DIR = ROOT / "sauvegardes"  # remplaçable par --sauvegardes
FORMATS = {"mon-budget-chiffre", "notre-budget-chiffre"}
MAX_BYTES = 50 * 1024 * 1024
KEEP_HISTORY = 20
LOCAL_HOSTS = {"localhost", "127.0.0.1"}

# ——— Taux officiels des livrets (service-public.gouv.fr) ———————————————
LIVRET_PAGES = {
    "livretA": ("https://www.service-public.gouv.fr/particuliers/vosdroits/F2365", "livret A"),
    "lep": ("https://www.service-public.gouv.fr/particuliers/vosdroits/F2367", "LEP"),
}
RATES_TTL = 6 * 3600  # secondes
_rates_cache = {"at": 0.0, "payload": None}
MONTHS = {m: i + 1 for i, m in enumerate(["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
                                          "août", "septembre", "octobre", "novembre", "décembre"])}
DATE = r"(\d{1,2})(?:er)? (" + "|".join(MONTHS) + r") (\d{4})"


def to_date(day, month, year):
    try:
        return dt.date(int(year), MONTHS[month.lower()], int(day))
    except (ValueError, KeyError):
        return None


def parse_livret(page: str, name: str, today: dt.date):
    """Taux actuel (« Le taux d'intérêt … du livret A est de 1,7 % ») et sa date d'effet."""
    text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", page)))
    m = re.search(r"taux d['’]int[ée]r[êe]ts? (?:annuel )?du " + name + r" est de (\d+(?:[,.]\d+)?) ?%", text, re.I)
    if not m:
        return None
    periods = [(to_date(*p[:3]), to_date(*p[3:])) for p in re.findall(r"\bdu " + DATE + r" au " + DATE, text, re.I)]
    current = [a for a, b in periods if a and b and a <= today <= b]
    if current:
        since = max(current)
    else:
        past = [b for a, b in periods if b and b < today]
        since = max(past) + dt.timedelta(days=1) if past else None
    return {"rate": float(m.group(1).replace(",", ".")), "since": since.isoformat() if since else None}


def livret_rates() -> dict:
    now = time.time()
    if _rates_cache["payload"] and now - _rates_cache["at"] < RATES_TTL:
        return _rates_cache["payload"]
    today = dt.date.today()
    payload = {"source": "service-public.gouv.fr", "lu": dt.datetime.now().isoformat(timespec="seconds"), "taux": {}, "erreurs": {}}
    for key, (url, name) in LIVRET_PAGES.items():
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "MonBudget/1.0 (lecture des taux officiels)"})
            with urllib.request.urlopen(request, timeout=15) as response:
                parsed = parse_livret(response.read().decode("utf-8", "ignore"), name, today)
            if parsed:
                payload["taux"][key] = {**parsed, "url": url}
            else:
                payload["erreurs"][key] = "taux introuvable dans la page"
        except Exception as err:  # réseau coupé, page changée…
            payload["erreurs"][key] = str(err)
    if payload["taux"]:
        _rates_cache.update(at=now, payload=payload)
    return payload


def history_dir() -> pathlib.Path:
    return BACKUP_DIR / "historique"


def latest_file() -> pathlib.Path:
    primary = BACKUP_DIR / "mon-budget-sauvegarde.json"
    legacy = BACKUP_DIR / "notre-budget-sauvegarde.json"
    if not primary.exists() and legacy.exists():
        return legacy
    return primary


def write_atomically(path: pathlib.Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-")
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    os.replace(tmp, path)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    # Les fichiers de sauvegarde ne sont jamais servis par HTTP
    def translate_path(self, path):
        resolved = pathlib.Path(super().translate_path(path)).resolve()
        if BACKUP_DIR in resolved.parents or resolved == BACKUP_DIR:
            return str(ROOT / "__interdit__")
        return str(resolved)

    def end_headers(self):
        if self.path.split("?")[0].endswith("service-worker.js"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def is_local_request(self) -> bool:
        # Protection contre le « DNS rebinding » : seul localhost est accepté
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0]
        origin = self.headers.get("Origin")
        if host not in LOCAL_HOSTS:
            return False
        if origin is not None:
            origin_host = origin.split("://", 1)[-1].rsplit(":", 1)[0]
            return origin_host in LOCAL_HOSTS
        return True

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/taux-livrets":
            if not self.is_local_request():
                return self.send_json(HTTPStatus.FORBIDDEN, {"erreur": "requête non locale"})
            return self.send_json(HTTPStatus.OK, livret_rates())
        if self.path.split("?")[0] == "/api/sauvegarde/etat":
            if not self.is_local_request():
                return self.send_json(HTTPStatus.FORBIDDEN, {"erreur": "requête non locale"})
            last = None
            if latest_file().exists():
                last = dt.datetime.fromtimestamp(latest_file().stat().st_mtime).isoformat(timespec="seconds")
            return self.send_json(HTTPStatus.OK, {
                "ok": True,
                "dossier": str(BACKUP_DIR),
                "fichier": latest_file().name,
                "derniere": last,
            })
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/sauvegarde":
            return self.send_json(HTTPStatus.NOT_FOUND, {"erreur": "inconnu"})
        if not self.is_local_request():
            return self.send_json(HTTPStatus.FORBIDDEN, {"erreur": "requête non locale"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BYTES:
            return self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"erreur": "taille invalide"})
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return self.send_json(HTTPStatus.BAD_REQUEST, {"erreur": "JSON invalide"})
        # On n'accepte que des sauvegardes chiffrées : jamais de données en clair sur le disque
        if payload.get("format") not in FORMATS or not payload.get("data") or not payload.get("iv"):
            return self.send_json(HTTPStatus.BAD_REQUEST, {"erreur": "sauvegarde non chiffrée refusée"})

        target = BACKUP_DIR / "mon-budget-sauvegarde.json"
        write_atomically(target, raw)
        stamp = dt.datetime.now().strftime("%Y-%m-%d_%H%M%S")
        write_atomically(history_dir() / f"mon-budget-{stamp}.json", raw)
        for old in sorted(history_dir().glob("*-budget-*.json"))[:-KEEP_HISTORY]:
            old.unlink()
        return self.send_json(HTTPStatus.OK, {"ok": True, "fichier": str(target), "historique": stamp})

    def log_message(self, fmt, *args):
        if "/api/" in (self.path or ""):
            super().log_message(fmt, *args)


def main() -> None:
    parser = argparse.ArgumentParser(description="Serveur local de Mon Budget")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--sauvegardes", type=pathlib.Path, help="dossier des sauvegardes (défaut : Finance/sauvegardes)")
    args = parser.parse_args()
    global BACKUP_DIR
    if args.sauvegardes:
        BACKUP_DIR = args.sauvegardes.expanduser().resolve()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Mon Budget : http://localhost:{args.port}  (sauvegardes dans {BACKUP_DIR})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
