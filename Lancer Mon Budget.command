#!/bin/sh
# Double-cliquez sur ce fichier dans le Finder : lance le serveur local
# (application + sauvegarde automatique chiffrée) puis ouvre l'app.
cd "$(dirname "$0")" || exit 1
( sleep 1 && open "http://localhost:8080" ) &
exec python3 scripts/serveur.py --port 8080
