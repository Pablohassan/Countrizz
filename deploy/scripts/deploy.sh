#!/usr/bin/env bash
# Déploie le chart countrizz sur le cluster, DEPUIS LE MAC : Helm part de rpi1 (kubeconfig du Mac cassé, dette 20).
# Patron deploy-helm.sh de Politika : staging propre par scp sur rpi1, puis ssh rpi1 helm upgrade --install
# … --history-max 5, essai --dry-run puis --atomic. Release dans SON namespace (comme toutes les releases du parc) ;
# le namespace n'est pas créé par le chart mais ici, avant Helm, avec ses étiquettes. Chaque écriture sur le cluster
# attend un GO sur la commande exacte (go.sh) ; un refus arrête tout.
# Usage : deploy/scripts/deploy.sh <étiquette>      (étiquette imprimée par build-image.sh)
set -euo pipefail
TAG="${1:?usage : deploy.sh ETIQUETTE (imprimée par build-image.sh)}"
CLUSTER_HOST="pablo1@192.168.1.171"
STAGING="/tmp/countrizz-deploy-staging"
RELEASE="countrizz"
NS="countrizz"
ETIQUETTES_NS="pod-security.kubernetes.io/enforce=restricted pod-security.kubernetes.io/enforce-version=latest goldilocks.fairwinds.com/enabled=true"
cd "$(git rev-parse --show-toplevel)"
source deploy/scripts/go.sh

echo "== Image : linux/arm64 et publique (lisible sans identifiants, comme par les nœuds)"
node deploy/scripts/image-controle.mjs "${TAG}"

echo "== Staging du chart sur rpi1 (${STAGING}, comme /tmp/politika-deploy-staging)"
ssh "${CLUSTER_HOST}" "rm -rf '${STAGING}' && mkdir -p '${STAGING}'"
scp -rq deploy/helm/countrizz "${CLUSTER_HOST}:${STAGING}/"

echo "== Contrôles sur rpi1, sans écriture sur le cluster"
ETAT_NS="$(ssh "${CLUSTER_HOST}" bash -s -- "${STAGING}" "${RELEASE}" "${TAG}" "${NS}" <<'DISTANT'
set -euo pipefail
STAGING="$1"; RELEASE="$2"; TAG="$3"; NS="$4"
CHART="${STAGING}/countrizz"
helm lint "${CHART}" --set image.tag="${TAG}" >/dev/null
helm template "${RELEASE}" "${CHART}" -n "${NS}" --set image.tag="${TAG}" > "${STAGING}/rendu.yaml"
if grep -q '^kind: Namespace' "${STAGING}/rendu.yaml"; then echo "Le chart ne doit pas créer son namespace" >&2; exit 1; fi

echo "-- Aucun nœud fantôme : chaque nœud exclu doit exister" >&2
NOEUDS="$(kubectl get nodes -o name | sed 's#^node/##')"
EXCLUS="$(sed -n 's/^ *avoidNodes: *\[\(.*\)\].*/\1/p' "${CHART}/values.yaml" | tr ',' '\n' | tr -d ' ')"
[ -n "${EXCLUS}" ] || { echo "Aucun nœud exclu trouvé dans values.yaml" >&2; exit 1; }
for n in ${EXCLUS}; do
  printf '%s\n' "${NOEUDS}" | grep -qx "${n}" || { echo "Nœud exclu inexistant : ${n}" >&2; exit 1; }
done

echo "-- Aucune ressource ne disparaît (manifeste en place contre nouveau rendu)" >&2
cles() { sed -n 's/^kind: *//p;s/^  name: *//p' "$1" | paste - - | sort -u; }
if helm status "${RELEASE}" -n "${NS}" >/dev/null 2>&1; then
  helm get manifest "${RELEASE}" -n "${NS}" > "${STAGING}/actuel.yaml"
  PERDUES="$(comm -23 <(cles "${STAGING}/actuel.yaml") <(cles "${STAGING}/rendu.yaml"))"
  [ -z "${PERDUES}" ] || { echo "Ressources qui disparaîtraient :" >&2; echo "${PERDUES}" >&2; exit 1; }
fi

echo "-- Essai à blanc (patron deploy-helm.sh)" >&2
helm upgrade --install "${RELEASE}" "${CHART}" -n "${NS}" --history-max 5 --set image.tag="${TAG}" --dry-run >/dev/null

# Dernière ligne : état du namespace, lu par le Mac.
if kubectl get namespace "${NS}" >/dev/null 2>&1; then
  kubectl get namespace "${NS}" -o jsonpath='{.metadata.labels}'; echo
else
  echo ABSENT
fi
DISTANT
)"
ETAT_NS="$(printf '%s\n' "${ETAT_NS}" | tail -n 1)"

if [ "${ETAT_NS}" = ABSENT ]; then
  go "création du namespace ${NS} sur le cluster, avec ses étiquettes (Pod Security « restricted », Goldilocks)" \
     "ssh ${CLUSTER_HOST} \"kubectl create namespace ${NS} && kubectl label namespace ${NS} ${ETIQUETTES_NS}\""
  ssh "${CLUSTER_HOST}" "kubectl create namespace ${NS} && kubectl label namespace ${NS} ${ETIQUETTES_NS}"
else
  for e in ${ETIQUETTES_NS}; do
    cle="${e%%=*}"; val="${e#*=}"
    case "${ETAT_NS}" in *"\"${cle}\":\"${val}\""*) ;; *) echo "Namespace ${NS} existant sans l'étiquette ${e} : à corriger avant tout déploiement" >&2; exit 1 ;; esac
  done
  echo "ok   namespace ${NS} présent avec ses étiquettes"
fi

HELM_CMD="helm upgrade --install ${RELEASE} ${STAGING}/countrizz -n ${NS} --history-max 5 --set image.tag=${TAG} --atomic --timeout 5m"
go "déploiement de la release ${RELEASE} (namespace ${NS}) sur le cluster" "ssh ${CLUSTER_HOST} \"${HELM_CMD}\""
ssh "${CLUSTER_HOST}" bash -s -- "${HELM_CMD}" "${NS}" <<'DISTANT'
set -euo pipefail
HELM_CMD="$1"; NS="$2"
${HELM_CMD}
kubectl -n "${NS}" rollout status deploy/countrizz-web --timeout=120s
curl -fsS http://192.168.1.101/healthz
DISTANT

echo "== Vérification publique"
curl -fsSI https://countrizz.fr/ | head -1
