#!/usr/bin/env bash
# Première mise en ligne de countrizz.fr (Task 5 du plan 2A-1), d'un seul trait, DEPUIS LE MAC.
# Chaque étape attend la fin de la précédente ; la première erreur arrête tout. Chaque écriture hors du dépôt
# (Docker Hub, rpi1, cluster, proxy .60) affiche la commande exacte et attend un GO ; un refus ARRÊTE tout (go.sh).
# Tout est journalisé dans ~/countrizz-mise-en-ligne-*.log.
#
#   deploy/scripts/mise-en-ligne.sh                     tout, depuis le début
#   deploy/scripts/mise-en-ligne.sh --depuis 3 --tag T  reprendre à l'étape 3 avec l'image T déjà poussée
#
# Compatible avec le bash 3.2 de macOS.
set -euo pipefail

CLUSTER_HOST="${CLUSTER_HOST:-pablo1@192.168.1.171}"
PROXY_HOST="${PROXY_HOST:-pablito@192.168.1.60}"
VHOST="/etc/nginx/sites-available/countrizz.fr.conf"
ARCHIVE="/etc/nginx/sites-archive"            # sauvegardes des vhosts : convention du proxy (dette 43)
BUILD="${COUNTRIZZ_BUILD:-deploy/scripts/build-image.sh}"     # remplaçables pour les essais à blanc
DEPLOY="${COUNTRIZZ_DEPLOY:-deploy/scripts/deploy.sh}"
SITE="${COUNTRIZZ_SITE:-https://countrizz.fr}"

DEPUIS=0; TAG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --depuis) DEPUIS="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    *) echo "Option inconnue : $1" >&2; exit 2 ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"
source deploy/scripts/go.sh
JOURNAL="${HOME}/countrizz-mise-en-ligne-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "${JOURNAL}") 2>&1
DEBUT=$(date +%s)

etape() { echo; echo "════════ Étape $1 — $2  ($(date +%H:%M:%S))"; }
faire() { [ "$DEPUIS" -le "$1" ]; }
echec() { echo "ÉCHEC : $*" >&2; echo "Journal : ${JOURNAL}" >&2; exit 1; }
trap 'echo "Arrêt (ligne ${LINENO}). Journal : ${JOURNAL}" >&2' ERR

# ── 0. Prérequis (lecture seule) ─────────────────────────────────────────────────────────────────────────────────
if faire 0; then
  etape 0 "Prérequis"
  [ -z "$(git status --porcelain)" ] || echec "arbre de travail sale (l'étiquette d'image doit désigner un commit)"
  echo "Branche : $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short=8 HEAD)"
  n=$(ls web/public/data/patches/img 2>/dev/null | grep -c '\.ktx2$' || true)
  [ "$n" = 394 ] || echec "patchs image : ${n} fichiers au lieu de 394 dans web/public/data/patches/img (cd web && npm run imagery:fetch)"
  echo "Patchs image : 394 fichiers"
  docker buildx inspect fresh-builder >/dev/null 2>&1 || echec "builder buildx « fresh-builder » introuvable"
  echo "Builder arm64 : fresh-builder"
  ssh -o BatchMode=yes "${CLUSTER_HOST}" 'helm version --short && kubectl get nodes --no-headers | wc -l' \
    || echec "rpi1 injoignable sans mot de passe (${CLUSTER_HOST})"
  ssh -o BatchMode=yes "${PROXY_HOST}" "test -r ${VHOST} && test -d ${ARCHIVE} && sudo -n true" \
    || echec "proxy .60 : ssh, vhost, ${ARCHIVE} ou sudo sans mot de passe indisponible (${PROXY_HOST})"
  echo "Proxy .60 : ssh, vhost et sudo disponibles"
  deploy/scripts/check-chart.sh
  node --test 'deploy/scripts/*.test.mjs' 2>&1 | grep -E '^# (pass|fail)'
fi

# ── 1. Page de doc du cluster (GO) : écrite AVANT d'agir (règle de rpi1) ────────────────────────────────────────
if faire 1; then
  etape 1 "Page ~/docs/cluster/countrizz.md sur rpi1"
  PAGE="$(mktemp)"
  cat > "${PAGE}" <<'PAGE'
# countrizz — site du jeu Countrizz (countrizz.fr)

- Release Helm `countrizz` dans le namespace **`countrizz`** (comme toutes les releases du parc). Le namespace n'est
  PAS créé par le chart : `deploy/scripts/deploy.sh` le crée avant Helm (`kubectl create namespace` + `kubectl label`,
  sur GO) avec ses étiquettes.
- Namespace en **Pod Security Admission `enforce: restricted`** — **première du parc** (dette 16 « à trancher » :
  décision de l'utilisateur du 08/10/2026) : tout pod root, avec élévation de privilèges, capacités ou sans seccomp y est
  REFUSÉ par l'API. C'est voulu. Étiquette Goldilocks comme les autres namespaces applicatifs.
- Deployment `countrizz-web` : 2 réplicas étalés par nœud (topologySpread), PDB minAvailable 1, nginx non root
  (`nginxinc/nginx-unprivileged`, uid 101, port 8080, seccomp RuntimeDefault, capacités retirées), sondes `/healthz`,
  nœuds `node.agiso.fr/class=worker` sauf raspberrypi0 et rpi6-4b (test du chart contre les nœuds fantômes).
- Service LoadBalancer `countrizz-web` sur **192.168.1.101:80** (`spec.loadBalancerIP`, réservée au registre MetalLB) ;
  NetworkPolicy `namespace-isolation` (gabarit mecapilot, port 8080).
- Proxy .60 : vhost `countrizz.fr.conf` (gabarit mecapilote.fr) → `http://192.168.1.101`, **sans** les locations de
  cache du gabarit (le Cache-Control vient du pod ; pas d'`add_header`, donc les en-têtes de sécurité restent : dette 40)
  et avec `proxy_max_temp_file_size 0` dans `location /` (gros KTX2 sans fichier temporaire sur la carte SD : dette 13).
  Décisions de l'utilisateur du 08/10/2026. Sauvegarde de l'ancien vhost dans `/etc/nginx/sites-archive/`.
- Image publique `pablohassan/countrizz-web:<branche>-<sha8>-<AAAAMMJJHHMMSS>` (immuable), `IfNotPresent`, tirée sans
  authentification. Construite et essayée sur le Mac après la suite complète ; arm64 et lecture anonyme contrôlés.
- Déployer : sur le Mac, `deploy/scripts/build-image.sh` puis `deploy/scripts/deploy.sh <étiquette>` (GO à chaque
  écriture).
- Revenir en arrière : `helm history countrizz -n countrizz` puis `helm rollback countrizz <révision> -n countrizz`
  (après la purge du dimanche 03:00, l'ancienne image est re-tirée depuis Docker Hub).
- Supervision : cible `https://countrizz.fr` dans `blackbox-websites` (release `prometheus`), une fois le site en 200.
- Dépôt : github.com/Pablohassan/Countrizz, dossier `deploy/`.
PAGE
  if ssh "${CLUSTER_HOST}" 'test -f ~/docs/cluster/countrizz.md'; then
    if ssh "${CLUSTER_HOST}" 'cat ~/docs/cluster/countrizz.md' | diff -q - "${PAGE}" >/dev/null; then
      echo "Page déjà à jour."
    else
      echo "La page existe ; différences avec la version proposée :"
      ssh "${CLUSTER_HOST}" 'cat ~/docs/cluster/countrizz.md' | diff - "${PAGE}" || true
      go "remplacement de la page ~/docs/cluster/countrizz.md sur rpi1" "scp <page ci-dessus> ${CLUSTER_HOST}:docs/cluster/countrizz.md"
      scp -q "${PAGE}" "${CLUSTER_HOST}:docs/cluster/countrizz.md" && echo "Page écrite."
    fi
  else
    cat "${PAGE}"
    go "écriture de la page ~/docs/cluster/countrizz.md sur rpi1" "scp <page ci-dessus> ${CLUSTER_HOST}:docs/cluster/countrizz.md"
    scp -q "${PAGE}" "${CLUSTER_HOST}:docs/cluster/countrizz.md" && echo "Page écrite."
  fi
  rm -f "${PAGE}"
fi

# ── 2. Image (GO avant l'envoi sur Docker Hub, dans build-image.sh) ─────────────────────────────────────────────
if faire 2 && [ -z "${TAG}" ]; then          # --tag fourni : image déjà poussée, pas de reconstruction
  etape 2 "Suite complète du Mac, build, essai et image arm64 (long : e2e compris)"
  SORTIE="$(mktemp)"
  "${BUILD}" | tee "${SORTIE}"
  TAG="$(tail -n 1 "${SORTIE}")"; rm -f "${SORTIE}"
  echo "Étiquette poussée : ${TAG}"
fi
[ -n "${TAG}" ] || echec "aucune étiquette d'image (reprendre avec --tag)"

# ── 3. Déploiement (GO pour le namespace et pour Helm, dans deploy.sh) ──────────────────────────────────────────
if faire 3; then
  etape 3 "Déploiement de ${TAG} (contrôles, essai à blanc, puis --atomic, depuis rpi1)"
  "${DEPLOY}" "${TAG}"
fi

# ── 4. Registre MetalLB (GO) ────────────────────────────────────────────────────────────────────────────────────
if faire 4; then
  etape 4 "Registre MetalLB (.101 désormais attribuée)"
  go "régénération du registre MetalLB sur rpi1" "ssh ${CLUSTER_HOST} 'bash ~/docs/cluster/gen-metallb-allocations.sh'"
  ssh "${CLUSTER_HOST}" 'bash ~/docs/cluster/gen-metallb-allocations.sh'
fi

# ── 5. Proxy .60 (GO) : vhost adapté par deploy/scripts/vhost.mjs (testé sur la copie du vhost en place) ──────────
if faire 5; then
  etape 5 "Proxy .60 : vhost countrizz.fr (cache du pod relayé, proxy_max_temp_file_size 0)"
  ACTUEL="$(mktemp)"; NOUVEAU="$(mktemp)"
  ssh "${PROXY_HOST}" "cat ${VHOST}" > "${ACTUEL}"
  node deploy/scripts/vhost.mjs < "${ACTUEL}" > "${NOUVEAU}" || echec "vhost en place inattendu : rien n'est modifié"
  if diff -q "${ACTUEL}" "${NOUVEAU}" >/dev/null; then
    echo "Vhost déjà à jour."
  else
    echo "Différences proposées (en place → nouveau) :"
    diff "${ACTUEL}" "${NOUVEAU}" || true
    go "remplacement du vhost ${VHOST} sur .60 (sauvegarde dans ${ARCHIVE}, nginx -t, rechargement ou restauration)" \
"scp <nouveau vhost> ${PROXY_HOST}:/tmp/countrizz.fr.conf.nouveau
ssh ${PROXY_HOST}: sudo cp ${VHOST} ${ARCHIVE}/countrizz.fr.conf.bak.<AAAAMMJJ-HHMMSS>
                   sudo install -m 644 -o root -g root /tmp/countrizz.fr.conf.nouveau ${VHOST}
                   sudo /usr/sbin/nginx -t && sudo systemctl reload nginx   (sinon : restauration de la sauvegarde)"
    scp -q "${NOUVEAU}" "${PROXY_HOST}:/tmp/countrizz.fr.conf.nouveau"
    ssh "${PROXY_HOST}" bash -s -- "${VHOST}" "${ARCHIVE}" <<'DISTANT'
set -euo pipefail
VHOST="$1"; ARCHIVE="$2"
SAUVE="${ARCHIVE}/countrizz.fr.conf.bak.$(date +%Y%m%d-%H%M%S)"
sudo cp "${VHOST}" "${SAUVE}"
sudo install -m 644 -o root -g root /tmp/countrizz.fr.conf.nouveau "${VHOST}"
rm -f /tmp/countrizz.fr.conf.nouveau
if sudo /usr/sbin/nginx -t; then
  sudo systemctl reload nginx; echo "nginx rechargé (sauvegarde : ${SAUVE})."
else
  sudo cp "${SAUVE}" "${VHOST}"; echo "nginx -t en échec : vhost restauré depuis ${SAUVE}." >&2; exit 1
fi
DISTANT
    echo "Le backup .3 reçoit la nouvelle configuration par la poussée automatique de .60 (toutes les 5 min)."
  fi
  rm -f "${ACTUEL}" "${NOUVEAU}"
  echo "Contrôle (drapeau : cache du pod et en-têtes de sécurité ; texture : type ktx2) :"
  curl -fsSI "${SITE}/data/flags/fra.svg" | grep -iE '^(HTTP|cache-control|strict-transport-security|x-content-type-options)' || echec "drapeau inaccessible"
  [ "$(curl -fsSI "${SITE}/data/flags/fra.svg" | grep -ic '^cache-control:')" = 1 ] || echec "drapeau : Cache-Control absent ou en double"
  curl -fsSI "${SITE}/data/flags/fra.svg" | grep -iq '^strict-transport-security:' || echec "drapeau : en-têtes de sécurité perdus"
  curl -fsSI "${SITE}/textures/day-8k.ktx2" | grep -iE '^(HTTP|content-type|cache-control)' || echec "texture inaccessible"
fi

# ── 6. Téléphone ────────────────────────────────────────────────────────────────────────────────────────────────
if faire 6; then
  etape 6 "Vérification sur ton téléphone"
  echo "Ouvre ${SITE} : le globe s'affiche, les trois boutons de la démo marchent, le crédit EOX est visible."
  go "validation : tout est bon sur le téléphone" "(aucune commande : ta vérification)"
fi

# ── 7. Supervision : guidée, pas automatique ────────────────────────────────────────────────────────────────────
if faire 7; then
  etape 7 "Supervision (blackbox-websites)"
  echo "Non automatisée : la release « prometheus » sert tout le parc ; sa procédure (valeurs LIVE par helm get values,"
  echo "~/helm-values/prometheus.yaml est périmé) est dans ~/docs/cluster/monitoring-prometheus.md sur rpi1. Cibles :"
  ssh "${CLUSTER_HOST}" 'helm -n monitoring get values prometheus -o yaml | grep -n -A15 "blackbox-websites" | head -40' || true
  echo "À faire en suivant la procédure, sur GO : ajouter ${SITE} à ces cibles (le site répond 200, l'alerte ne tirera pas)."
fi

# ── Bilan ───────────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "════════ Terminé en $(( ($(date +%s) - DEBUT) / 60 )) min. Image déployée : ${TAG}"
echo "Journal complet : ${JOURNAL} (à recopier dans docs/HANDOFF.md)"
