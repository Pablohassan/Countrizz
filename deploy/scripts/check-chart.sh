#!/usr/bin/env bash
# Contrôle statique du chart (sans cluster) : lint, rendu, et les exigences de sécurité et de placement du spec §9.
# Helm local s'il existe, sinon l'image alpine/helm à la version de rpi1 (3.14.4).
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
if command -v helm >/dev/null; then HELM=(helm); else HELM=(docker run --rm -v "$PWD/deploy/helm:/apps" -w /apps alpine/helm:3.14.4); fi
CHART=countrizz; [ "${HELM[0]}" = helm ] && CHART=deploy/helm/countrizz

"${HELM[@]}" lint "$CHART" --set image.tag=controle >/dev/null
if "${HELM[@]}" template countrizz "$CHART" >/dev/null 2>&1; then echo "ÉCHEC : le rendu passe sans image.tag" >&2; exit 1; fi
RENDU="$("${HELM[@]}" template countrizz "$CHART" --set image.tag=controle)"

echec=0
exige() { if printf '%s\n' "$RENDU" | grep -qE -- "$2"; then echo "ok   $1"; else echo "ÉCHEC $1" >&2; echec=1; fi; }
exige "namespace en Pod Security restricted"       'pod-security.kubernetes.io/enforce: restricted'
exige "namespace étiqueté Goldilocks"              'goldilocks.fairwinds.com/enabled: "true"'
exige "namespace conservé à la désinstallation"    'helm.sh/resource-policy: keep'
exige "non root"                                   'runAsNonRoot: true'
exige "seccomp RuntimeDefault"                     'type: RuntimeDefault'
exige "pas d élévation de privilèges"              'allowPrivilegeEscalation: false'
exige "racine en lecture seule"                    'readOnlyRootFilesystem: true'
exige "capacités retirées"                         'drop: \[ALL\]|- ALL'
exige "Service sur .101"                           'loadBalancerIP: 192.168.1.101'
exige "nœuds worker"                               'node.agiso.fr/class: worker'
exige "raspberrypi0 et rpi6-4b exclus"             'raspberrypi0'
exige "réplicas étalés par nœud"                   'topologyKey: kubernetes.io/hostname'
exige "PodDisruptionBudget"                        'kind: PodDisruptionBudget'
exige "NetworkPolicy namespace-isolation"          'name: namespace-isolation'
exige "CIDR des pods admis (SNAT kube-proxy)"      '10.42.0.0/16'
exige "sondes sur /healthz"                        'path: /healthz'
exige "tirage seulement si absente"                'imagePullPolicy: IfNotPresent'
exit $echec
