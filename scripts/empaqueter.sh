#!/usr/bin/env bash
# ===================================================================
#  EMPAQUETAGE
#
#  L'exclusion porte sur le config.js de la RACINE uniquement.
#  Un motif « */config.js » emporterait aussi src/core/config.js, ce
#  qui est déjà arrivé : vingt et un tests ne se lançaient plus dans
#  l'archive extraite, alors que tout passait dans le dossier de
#  travail. D'où ce script, pour ne plus retaper le motif à la main.
# ===================================================================
set -euo pipefail

DOSSIER="LULU-Trajet-V6"
cd "$(dirname "$0")/../.."

rm -f "$DOSSIER.zip"
find "$DOSSIER" -name ".DS_Store" -delete 2>/dev/null || true

zip -rq "$DOSSIER.zip" "$DOSSIER" \
  -x "$DOSSIER/node_modules/*" \
     "$DOSSIER/.git/*" \
     "$DOSSIER/config.js"

echo "Archive : $DOSSIER.zip"
unzip -l "$DOSSIER.zip" | tail -2

echo
echo "Contrôle : le fichier de configuration du noyau doit être présent."
unzip -l "$DOSSIER.zip" | grep -q "$DOSSIER/src/core/config.js" \
  && echo "  ok    src/core/config.js" \
  || { echo "  ÉCHEC src/core/config.js absent de l'archive"; exit 1; }
