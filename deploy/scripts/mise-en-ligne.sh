#!/usr/bin/env bash
# Première mise en ligne de countrizz.fr (Task 5 du plan 2A-1), d'un seul trait, DEPUIS LE MAC.
# Chaque étape attend la fin de la précédente ; la première erreur arrête tout. Chaque écriture hors du dépôt
# (rpi1, proxy .60) demande « GO ? [o/N] » avant d'agir. Tout est journalisé dans ~/countrizz-mise-en-ligne-*.log.
#
#   deploy/scripts/mise-en-ligne.sh                     tout, depuis le début
#   deploy/scripts/mise-en-ligne.sh --depuis 3 --tag T  reprendre à l'étape 3 avec l'image T déjà poussée
#
# Compatible avec le bash 3.2 de macOS.
set -euo pipefail

CLUSTER_HOST="${CLUSTER_HOST:-pablo1@192.168.1.171}"
PROXY_HOST="${PROXY_HOST:-pablito@192.168.1.60}"
VHOST="${VHOST:-/etc/nginx/sites-available/countrizz.fr.conf}"
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
JOURNAL="${HOME}/countrizz-mise-en-ligne-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "${JOURNAL}") 2>&1
DEBUT=$(date +%s)

etape() { echo; echo "════════ Étape $1 — $2  ($(date +%H:%M:%S))"; }
go() {
  local r=""
  read -r -p "$1 — GO ? [o/N] " r || true
  case "$r" in o|O|oui|OUI) return 0 ;; *) echo "→ étape sautée (pas de GO)."; return 1 ;; esac
}
faire() { [ "$DEPUIS" -le "$1" ]; }
echec() { echo "ÉCHEC : $*" >&2; echo "Journal : ${JOURNAL}" >&2; exit 1; }
trap 'echo "Arrêt sur erreur (ligne ${LINENO}). Journal : ${JOURNAL}" >&2' ERR

# ── 0. Prérequis ────────────────────────────────────────────────────────────────────────────────────────────────
if faire 0; then
  etape 0 "Prérequis"
  [ -z "$(git status --porcelain)" ] || echec "arbre de travail sale (l'étiquette d'image doit désigner un commit)"
  echo "Branche : $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short=8 HEAD)"
  n=$(ls web/public/data/patches/img 2>/dev/null | grep -c '\.ktx2$' || true)
  [ "$n" = 394 ] || echec "patchs image : ${n} fichiers au lieu de 394 dans web/public/data/patches/img"
  echo "Patchs image : 394 fichiers"
  docker buildx inspect fresh-builder >/dev/null 2>&1 || echec "builder buildx « fresh-builder » introuvable"
  echo "Builder arm64 : fresh-builder"
  ssh -o BatchMode=yes "${CLUSTER_HOST}" 'helm version --short && kubectl get nodes --no-headers | wc -l' \
    || echec "rpi1 injoignable sans mot de passe (${CLUSTER_HOST})"
  deploy/scripts/check-chart.sh
  node --test 'deploy/scripts/*.test.mjs' 2>&1 | grep -E '^# (pass|fail)'
fi

# ── 1. Page de doc du cluster (GO) ──────────────────────────────────────────────────────────────────────────────
if faire 1; then
  etape 1 "Page ~/docs/cluster/countrizz.md sur rpi1"
  PAGE="$(mktemp)"
  cat > "${PAGE}" <<'PAGE'
# countrizz — site du jeu Countrizz (countrizz.fr)

- Namespace `countrizz`, **Pod Security Admission `enforce: restricted`** (première du parc) : tout pod root, avec
  élévation de privilèges, capacités ou sans seccomp y est REFUSÉ par l'API. C'est voulu. Étiquette Goldilocks.
- Release Helm `countrizz` dans le namespace **`default`** (le chart crée le namespace et pose ses étiquettes ;
  `helm.sh/resource-policy: keep` : `helm uninstall` ne le supprime pas).
- Deployment `countrizz-web` : 2 réplicas étalés par nœud, PDB minAvailable 1, nginx non root (uid 101, port 8080),
  racine en lecture seule, nœuds `class=worker` sauf raspberrypi0 et rpi6-4b.
- Service LoadBalancer `countrizz-web` sur **192.168.1.101:80** (spec.loadBalancerIP) ; proxy .60 : vhost
  `countrizz.fr.conf` → `http://192.168.1.101`, `proxy_max_temp_file_size 0` (pas de fichiers temporaires sur la SD).
- Image publique `pablohassan/countrizz-web:<branche>-<sha8>-<AAAAMMJJHHMMSS>` (immuable), `IfNotPresent`, tirée sans
  authentification. Construite sur le Mac après la suite complète.
- Déployer : sur le Mac, `deploy/scripts/build-image.sh` puis `deploy/scripts/deploy.sh <étiquette>`.
- Revenir en arrière : `helm history countrizz -n default` puis `helm rollback countrizz <révision> -n default`
  (après une purge du dimanche, l'ancienne image est re-tirée depuis Docker Hub).
- Dépôt : github.com/Pablohassan/Countrizz, dossier `deploy/`.
PAGE
  if ssh "${CLUSTER_HOST}" 'test -f ~/docs/cluster/countrizz.md'; then
    echo "La page existe déjà ; différences avec la version proposée :"
    ssh "${CLUSTER_HOST}" 'cat ~/docs/cluster/countrizz.md' | diff - "${PAGE}" || true
  else
    cat "${PAGE}"
  fi
  if go "Écrire cette page sur rpi1"; then
    scp -q "${PAGE}" "${CLUSTER_HOST}:docs/cluster/countrizz.md" && echo "Page écrite."
  fi
  rm -f "${PAGE}"
fi

# ── 2. Image ────────────────────────────────────────────────────────────────────────────────────────────────────
if faire 2; then
  etape 2 "Suite complète du Mac, build et image arm64 (long : e2e compris)"
  SORTIE="$(mktemp)"
  "${BUILD}" | tee "${SORTIE}"
  TAG="$(tail -n 1 "${SORTIE}")"; rm -f "${SORTIE}"
  echo "Étiquette poussée : ${TAG}"
fi
[ -n "${TAG}" ] || echec "aucune étiquette d'image (reprendre avec --tag)"

# ── 3. Déploiement ──────────────────────────────────────────────────────────────────────────────────────────────
if faire 3; then
  etape 3 "Déploiement de ${TAG} (essai à blanc puis --atomic, depuis rpi1)"
  "${DEPLOY}" "${TAG}"
fi

# ── 4. Allocations MetalLB (GO) ─────────────────────────────────────────────────────────────────────────────────
if faire 4; then
  etape 4 "Registre MetalLB (.101 désormais attribuée)"
  if go "Lancer ~/docs/cluster/gen-metallb-allocations.sh sur rpi1"; then
    ssh "${CLUSTER_HOST}" 'bash ~/docs/cluster/gen-metallb-allocations.sh'
  fi
fi

# ── 5. Proxy .60 (GO) ───────────────────────────────────────────────────────────────────────────────────────────
if faire 5; then
  etape 5 "Proxy .60 : proxy_max_temp_file_size 0 dans le seul vhost countrizz.fr"
  if ssh "${PROXY_HOST}" "grep -q 'proxy_max_temp_file_size 0' ${VHOST}"; then
    echo "Déjà en place."
  elif go "Modifier ${VHOST} sur .60 (sauvegarde, nginx -t, rechargement ; sudo demandera peut-être le mot de passe)"; then
    # Ajout juste après « location / { » ; retour à la sauvegarde si nginx -t échoue.
    ssh -t "${PROXY_HOST}" "set -e
      sudo cp ${VHOST} ${VHOST}.avant-countrizz-\$(date +%Y%m%d%H%M%S)
      [ \$(grep -c '^[[:space:]]*location / {' ${VHOST}) = 1 ] || { echo 'location / introuvable ou multiple'; exit 1; }
      sudo sed -i '/^[[:space:]]*location \/ {/a\\        proxy_max_temp_file_size 0;   # countrizz : pas de fichiers temporaires sur la SD' ${VHOST}
      if sudo nginx -t; then sudo systemctl reload nginx; echo 'nginx rechargé.'
      else sudo cp \$(ls -t ${VHOST}.avant-countrizz-* | head -1) ${VHOST}; echo 'nginx -t en échec : vhost restauré.'; exit 1; fi"
    echo "Le backup .3 se synchronise tout seul (toutes les 5 min)."
  fi
  echo "Contrôle :"
  curl -sI "${SITE}/textures/day-8k.ktx2" | grep -iE '^(HTTP|content-type|cache-control)' || echec "texture inaccessible"
fi

# ── 6. Téléphone ────────────────────────────────────────────────────────────────────────────────────────────────
if faire 6; then
  etape 6 "Vérification sur ton téléphone"
  echo "Ouvre ${SITE} : le globe s'affiche, les trois boutons de la démo marchent, le crédit EOX est visible."
  go "Tout est bon sur le téléphone" || echec "vérification téléphone non validée"
fi

# ── 7. Supervision : guidée, pas automatique ────────────────────────────────────────────────────────────────────
if faire 7; then
  etape 7 "Supervision (blackbox-websites)"
  echo "Non automatisée : la release « prometheus » sert tout le parc et sa procédure d'upgrade (8 étapes) est dans"
  echo "~/docs/cluster/monitoring-prometheus.md sur rpi1. Cibles actuelles :"
  ssh "${CLUSTER_HOST}" 'helm -n monitoring get values prometheus -o yaml | grep -n -A15 "blackbox-websites" | head -40' || true
  echo "À faire en suivant la procédure : ajouter ${SITE} à ces cibles (le site répond 200, l'alerte ne tirera pas)."
fi

# ── Bilan ───────────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "════════ Terminé en $(( ($(date +%s) - DEBUT) / 60 )) min. Image déployée : ${TAG}"
echo "Journal complet : ${JOURNAL} (à recopier dans docs/HANDOFF.md)"
