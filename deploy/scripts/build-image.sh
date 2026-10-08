#!/usr/bin/env bash
# Construit et pousse l'image du site, SUR LE MAC (arm64, builder « fresh-builder »).
# L'étiquette est celle de deploy/k8s/countrizz.yaml : la monter avant chaque nouvelle version.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

IMAGE="$(node -e 'const t=require("fs").readFileSync("deploy/k8s/countrizz.yaml","utf8");const m=t.match(/image: (pablohassan\/countrizz-web:\S+)/);if(!m)process.exit(1);console.log(m[1])')"
if docker buildx imagetools inspect "${IMAGE}" >/dev/null 2>&1; then
  echo "${IMAGE} existe déjà sur Docker Hub : monter l'étiquette dans deploy/k8s/countrizz.yaml." >&2; exit 1
fi

( cd web && npm run build )
node deploy/scripts/stage-image.mjs
docker buildx build --builder fresh-builder --platform linux/arm64 -f deploy/web/Dockerfile -t "${IMAGE}" --push .
rm -rf .image-staging
echo "${IMAGE}"
