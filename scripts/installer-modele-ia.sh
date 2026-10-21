#!/bin/sh
# Télécharge UNE FOIS le modèle d'IA locale dans ./models.
# Ensuite, l'application l'utilise sans aucune connexion : vos relevés ne
# quittent jamais l'ordinateur. Relancer le script ne retélécharge que les
# fichiers manquants.
#
#   ./scripts/installer-modele-ia.sh          grand modèle Qwen3.5-4B (≈ 3,1 Go, carte graphique)
#   ./scripts/installer-modele-ia.sh leger    modèle léger Qwen3.5-2B (≈ 1,5 Go, repli sans carte graphique)
#   ./scripts/installer-modele-ia.sh tout     les deux
#
# Seule la partie « texte » est téléchargée : l'encodeur d'images est inutile ici.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

install() {
  MODEL="$1"
  FILES="config.json generation_config.json tokenizer.json tokenizer_config.json
onnx/embed_tokens_q4.onnx onnx/embed_tokens_q4.onnx_data
onnx/decoder_model_merged_q4.onnx onnx/decoder_model_merged_q4.onnx_data $2"
  DEST="$ROOT/models/$MODEL"
  BASE="https://huggingface.co/$MODEL/resolve/main"

  echo "Modèle : $MODEL"
  echo "Dossier : $DEST"
  mkdir -p "$DEST/onnx"

  for f in $FILES; do
    if [ -s "$DEST/$f" ]; then
      echo "  ✓ $f (déjà présent)"
      continue
    fi
    echo "  ↓ $f"
    curl -fL --progress-bar -o "$DEST/$f.part" "$BASE/$f"
    mv "$DEST/$f.part" "$DEST/$f"
  done
}

case "${1:-grand}" in
  grand) install onnx-community/Qwen3.5-4B-ONNX onnx/decoder_model_merged_q4.onnx_data_1 ;;
  leger) install onnx-community/Qwen3.5-2B-ONNX "" ;;
  tout)
    install onnx-community/Qwen3.5-4B-ONNX onnx/decoder_model_merged_q4.onnx_data_1
    install onnx-community/Qwen3.5-2B-ONNX ""
    ;;
  *) echo "Usage : $0 [grand|leger|tout]" >&2; exit 1 ;;
esac

echo "Terminé. Rechargez l'application (Cmd + Maj + R)."
