#!/usr/bin/env bash
# Construit, vérifie puis pousse l'image du site, SUR LE MAC (arm64, builder « fresh-builder », comme Politika).
# Barrière : la suite complète du Mac (CI de référence) doit passer avant toute image. Contrôles de l'usage Politika
# avant de pousser : code de sortie du build capturé, contenu vérifié en lançant l'image ; après : linux/arm64 et
# lecture anonyme (image-controle.mjs). L'envoi sur Docker Hub est une écriture : GO sur la commande exacte.
# Usage : deploy/scripts/build-image.sh            → imprime l'étiquette poussée sur la dernière ligne
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
source deploy/scripts/go.sh

if [ -n "$(git status --porcelain)" ]; then echo "Arbre de travail sale : committer d'abord (l'étiquette doit désigner un commit)." >&2; exit 1; fi
BRANCHE="$(git rev-parse --abbrev-ref HEAD | tr '/' '-')"
SHA8="$(git rev-parse --short=8 HEAD)"
HORO="$(date -u +%Y%m%d%H%M%S)"
TAG="${BRANCHE}-${SHA8}-${HORO}"
IMAGE="pablohassan/countrizz-web:${TAG}"
BUILD=(docker buildx build --builder fresh-builder --platform linux/arm64 -f deploy/web/Dockerfile -t "${IMAGE}")

echo "== Suite complète du Mac (check, test:data, e2e, budget)"
( cd web && npm run check && npm run test:data && npm run e2e && npm run budget )
echo "== Build du site"
( cd web && npm run build )
echo "== Préparation de l'image et contrôle des 394 patchs image"
node deploy/scripts/stage-image.mjs

echo "== Image ${IMAGE} (linux/arm64), chargée en local pour l'essai"
"${BUILD[@]}" --load .

echo "== Essai de l'image : non root, /healthz, page, texture et patch servis avec leur type"
ESSAI="countrizz-essai-${SHA8}"
docker run -d --rm --name "${ESSAI}" -p 127.0.0.1:18080:8080 "${IMAGE}" >/dev/null
trap 'docker stop "${ESSAI}" >/dev/null 2>&1 || true' EXIT
for _ in 1 2 3 4 5 6 7 8 9 10; do curl -fsS http://127.0.0.1:18080/healthz >/dev/null 2>&1 && break; sleep 1; done
[ "$(docker exec "${ESSAI}" id -u)" = 101 ] || { echo "ÉCHEC : le conteneur ne tourne pas en uid 101" >&2; exit 1; }
type_de() { curl -fsS -o /dev/null -w '%{content_type}' "http://127.0.0.1:18080$1"; }
[ "$(curl -fsS http://127.0.0.1:18080/healthz)" = ok ] || { echo "ÉCHEC : /healthz" >&2; exit 1; }
case "$(type_de /)" in text/html*) ;; *) echo "ÉCHEC : / n'est pas du HTML" >&2; exit 1 ;; esac
[ "$(type_de /textures/day-8k.ktx2)" = image/ktx2 ] || { echo "ÉCHEC : type de day-8k.ktx2" >&2; exit 1; }
[ "$(type_de /data/patches/img/fra-2048.ktx2)" = image/ktx2 ] || { echo "ÉCHEC : patch fra-2048.ktx2" >&2; exit 1; }
docker stop "${ESSAI}" >/dev/null; trap - EXIT
echo "ok   image essayée"

go "envoi de l'image sur Docker Hub (dépôt public pablohassan/countrizz-web)" "${BUILD[*]} --push ."
"${BUILD[@]}" --push .
node deploy/scripts/image-controle.mjs "${TAG}"
rm -rf .image-staging
echo "${TAG}"
