#!/usr/bin/env bash
# Déploie le chart countrizz sur le cluster, DEPUIS LE MAC : Helm part de rpi1 (kubeconfig du Mac cassé, dette 20).
# Patron deploy-helm.sh : staging propre par scp, puis ssh rpi1 helm upgrade --install … --history-max 5.
# Usage : deploy/scripts/deploy.sh <étiquette>      (étiquette imprimée par build-image.sh)
set -euo pipefail
TAG="${1:?usage : deploy.sh ETIQUETTE (imprimée par build-image.sh)}"
CLUSTER_HOST="pablo1@192.168.1.171"
STAGING="/tmp/countrizz-deploy-staging"
RELEASE="countrizz"
cd "$(git rev-parse --show-toplevel)"

echo "== L'image existe sur Docker Hub"
docker buildx imagetools inspect "pablohassan/countrizz-web:${TAG}" >/dev/null

echo "== Staging du chart sur rpi1"
ssh "${CLUSTER_HOST}" "rm -rf '${STAGING}' && mkdir -p '${STAGING}'"
scp -rq deploy/helm/countrizz "${CLUSTER_HOST}:${STAGING}/"

ssh "${CLUSTER_HOST}" bash -s -- "${STAGING}" "${RELEASE}" "${TAG}" <<'DISTANT'
set -euo pipefail
STAGING="$1"; RELEASE="$2"; TAG="$3"
CHART="${STAGING}/countrizz"
helm lint "${CHART}" --set image.tag="${TAG}" >/dev/null
helm template "${RELEASE}" "${CHART}" --set image.tag="${TAG}" > "${STAGING}/rendu.yaml"

echo "== Aucun nœud fantôme : chaque nœud exclu doit exister"
NOEUDS="$(kubectl get nodes -o name | sed 's#^node/##')"
EXCLUS="$(sed -n 's/^ *avoidNodes: *\[\(.*\)\].*/\1/p' "${CHART}/values.yaml" | tr ',' '\n' | tr -d ' ')"
[ -n "${EXCLUS}" ] || { echo "Aucun nœud exclu trouvé dans le rendu" >&2; exit 1; }
for n in ${EXCLUS}; do
  printf '%s\n' "${NOEUDS}" | grep -qx "${n}" || { echo "Nœud exclu inexistant : ${n}" >&2; exit 1; }
done

echo "== Aucune ressource ne disparaît (manifeste en place contre nouveau rendu)"
cles() { sed -n 's/^kind: *//p;s/^  name: *//p' "$1" | paste - - | sort -u; }
if helm status "${RELEASE}" -n default >/dev/null 2>&1; then
  helm get manifest "${RELEASE}" -n default > "${STAGING}/actuel.yaml"
  PERDUES="$(comm -23 <(cles "${STAGING}/actuel.yaml") <(cles "${STAGING}/rendu.yaml"))"
  [ -z "${PERDUES}" ] || { echo "Ressources qui disparaîtraient :" >&2; echo "${PERDUES}" >&2; exit 1; }
fi

echo "== Essai à blanc, puis déploiement atomique"
helm upgrade --install "${RELEASE}" "${CHART}" -n default --history-max 5 --set image.tag="${TAG}" --dry-run >/dev/null
helm upgrade --install "${RELEASE}" "${CHART}" -n default --history-max 5 --set image.tag="${TAG}" --atomic --timeout 5m
kubectl -n countrizz rollout status deploy/countrizz-web --timeout=120s
curl -fsS http://192.168.1.101/healthz
DISTANT

echo "== Vérification publique"
curl -fsSI https://countrizz.fr/ | head -1
