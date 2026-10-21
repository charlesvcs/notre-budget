#!/usr/bin/env python3
"""
Serveur local de « Notre Budget », à utiliser sur le Mac à la place de
`python3 -m http.server`.

- Sert l'application (comme http.server).
- Reçoit les sauvegardes CHIFFRÉES envoyées par l'app et les écrit dans
  Finance/sauvegardes/ (+ un historique daté des 20 dernières).
- N'écoute que sur 127.0.0.1 : inaccessible depuis le réseau.

Lancement :  python3 scripts/serveur.py            (port 8080)
             python3 scripts/serveur.py --port 8090
             python3 scripts/serveur.py --sauvegardes ~/Autre/dossier
"""
import argparse
import datetime as dt
import json
import os
import pathlib
import tempfile
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent.parent
BACKUP_DIR = ROOT / "sauvegardes"  # remplaçable par --sauvegardes
FORMAT = "notre-budget-chiffre"
MAX_BYTES = 50 * 1024 * 1024
KEEP_HISTORY = 20
LOCAL_HOSTS = {"localhost", "127.0.0.1"}


def history_dir() -> pathlib.Path:
    return BACKUP_DIR / "historique"


def latest_file() -> pathlib.Path:
    return BACKUP_DIR / "notre-budget-sauvegarde.json"


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
        if payload.get("format") != FORMAT or not payload.get("data") or not payload.get("iv"):
            return self.send_json(HTTPStatus.BAD_REQUEST, {"erreur": "sauvegarde non chiffrée refusée"})

        write_atomically(latest_file(), raw)
        stamp = dt.datetime.now().strftime("%Y-%m-%d_%H%M%S")
        write_atomically(history_dir() / f"notre-budget-{stamp}.json", raw)
        for old in sorted(history_dir().glob("notre-budget-*.json"))[:-KEEP_HISTORY]:
            old.unlink()
        return self.send_json(HTTPStatus.OK, {"ok": True, "fichier": str(latest_file()), "historique": stamp})

    def log_message(self, fmt, *args):
        if "/api/" in (self.path or ""):
            super().log_message(fmt, *args)


def main() -> None:
    parser = argparse.ArgumentParser(description="Serveur local de Notre Budget")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--sauvegardes", type=pathlib.Path, help="dossier des sauvegardes (défaut : Finance/sauvegardes)")
    args = parser.parse_args()
    global BACKUP_DIR
    if args.sauvegardes:
        BACKUP_DIR = args.sauvegardes.expanduser().resolve()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Notre Budget : http://localhost:{args.port}  (sauvegardes dans {BACKUP_DIR})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
