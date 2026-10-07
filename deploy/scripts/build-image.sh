#!/usr/bin/env bash
# Construit et pousse l'image du site, SUR LE MAC (arm64, builder « fresh-builder », comme Politika).
# Barrière : la suite complète du Mac (CI de référence) doit passer avant toute image.
# Usage : deploy/scripts/build-image.sh            → imprime l'étiquette poussée sur la dernière ligne
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain)" ]; then echo "Arbre de travail sale : committer d'abord (l'étiquette doit désigner un commit)." >&2; exit 1; fi
BRANCHE="$(git rev-parse --abbrev-ref HEAD | tr '/' '-')"
SHA8="$(git rev-parse --short=8 HEAD)"
HORO="$(date -u +%Y%m%d%H%M%S)"
TAG="${BRANCHE}-${SHA8}-${HORO}"
IMAGE="pablohassan/countrizz-web:${TAG}"

echo "== Suite complète du Mac (check, test:data, e2e, budget)"
( cd web && npm run check && npm run test:data && npm run e2e && npm run budget )
echo "== Build du site"
( cd web && npm run build )
echo "== Préparation de l'image et contrôle des 394 patchs image"
node deploy/scripts/stage-image.mjs
echo "== Image ${IMAGE} (linux/arm64)"
docker buildx build --builder fresh-builder --platform linux/arm64 -f deploy/web/Dockerfile -t "${IMAGE}" --push .
rm -rf .image-staging
echo "${TAG}"
