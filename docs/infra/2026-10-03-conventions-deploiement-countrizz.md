> **Document de session (03/10/2026, 4ᵉ session), établi en LECTURE SEULE par cinq lecteurs, une synthèse et une critique (workflow `conventions-deploiement-countrizz`).** La PARTIE 2 (critique) corrige la PARTIE 1 là où elles divergent : elle prime. Décisions de l’utilisateur prises ensuite : CI de référence = le Mac (GitHub ne garde que `check`) ; section « déploiement » de la 2A validée (build sur le Mac à la Politika, image PUBLIQUE Docker Hub patchs compris, chart Helm `web` seul sur `.101` via rpi1, écritures cluster annexes chacune sur GO). Les chemins `/private/tmp/...` cités sont éphémères (dossier de session).

# PARTIE 1 — Synthèse


> Document établi le 03/10/2026, en lecture seule, à partir des cartes de cinq lecteurs. Chaque point indique sa source entre parenthèses. Ce qu'aucune source n'établit se trouve en section 7.

---

## 0. Ce qu'il faut savoir avant de lire

- **Le runner gratuit de GitHub est bien coupé pour Politika, mais il tourne encore pour Countrizz.** Côté Politika, le workflow de build hébergé est coupé depuis le 09/09 : « The job was not started because recent account payments have failed… » (`politika/.github/workflows/build-and-push.yml:3-14`).
  - Côté Countrizz, le dépôt `Pablohassan/Countrizz` est **public**. Ses jobs `ubuntu-latest` ont tourné aujourd'hui : `check` réussi, `"runner_name":"GitHub Actions 1000004094"`, `"started_at":"2026-10-03T18:08:55Z"` (`gh api repos/Pablohassan/Countrizz/actions/runs/37143111810/jobs`).
  - L'échec de `visual-baselines` est un échec de test, pas de facturation : « 12 failed … 12 passed (5.7m) », captures webgl2 en timeout (`gh run view 37143111810 --log-failed`).
- **Sur le Mac, aucune CI ne construit d'image aujourd'hui.** Le runner `politika-mac` ne fait tourner que les tests (`politika/.github/workflows/backend-pr-gates.yml:62-68`). Les images Politika sont construites et poussées **à la main** sur le Mac, avec `docker buildx … --push` (`politika/README.md:129,210-216`). Elles sont ensuite déployées par `deploy-helm.sh`. Un workflow « build → push → deploy » sur le runner du Mac serait donc une **création**, pas la reprise d'une convention.

---

## 1. La chaîne actuelle sur le Mac (patron Politika), pas à pas

| # | Étape | Ce qui existe | Source |
|---|---|---|---|
| 1 | **Déclencheur** | Le build est manuel : l'opérateur ou l'agent lance la commande sur le Mac. Le seul workflow de build (`build-and-push.yml`) vise `ubuntu-latest` et ne se déclenche plus qu'à la main (`on: workflow_dispatch`). | `politika/.github/workflows/build-and-push.yml:13-18` ; `politika/README.md:210-216` |
| 2 | **Runner du Mac** | `politika-mac` : étiquettes `self-hosted, ARM64, macOS, mac-ci`. Enregistré **au niveau du dépôt** `Pablohassan/ColorNews` (`"gitHubUrl": "https://github.com/Pablohassan/ColorNews"`). Service launchd `actions.runner.Pablohassan-ColorNews.politika-mac`, actif (`launchctl list` → `4559 0 …`). | `~/actions-runner-politika/.runner:3-8` ; `~/actions-runner-politika/.service:1` ; `gh api repos/Pablohassan/ColorNews/actions/runners` |
| 2b | **Usage du runner** | Tests uniquement (typecheck, gardes, vitest, realdb), sur push `main` et sur les PR qui touchent `backend/**`, avec `runs-on: [self-hosted, mac-ci]`. Son `.env` porte `LANG` et `TEST_PG_ADMIN_URL` vers le Postgres de CI local 127.0.0.1:55433 (valeur non recopiée). | `backend-pr-gates.yml:44-55,62-68` ; `~/actions-runner-politika/.env:1-2` |
| 2c | **Runner de secours** | `politika-k3s` (étiquette `politika`), dans le cluster : release Helm `politika-ci`, namespace `gha-runner`, image `myoung34/github-runner:2.337.0-debian-bookworm`, préférence `raspberrypi8`. Lui aussi est lié à ColorNews seulement. | `ssh rpi1 helm list -A` ; `kubectl -n gha-runner get deploy gha-runner -o json` ; `helm/politika-ci/deploy-ci.sh:16-20,34-46` |
| 3 | **Build arm64** | `docker buildx build --builder fresh-builder --platform linux/arm64 -f Dockerfile -t pablohassan/<image>:<tag> --push .`. Le builder `fresh-builder` (docker-container, BuildKit v0.30.0, linux/arm64) existe et Docker Desktop tourne en arm64 (« arm64 29.4.0 »). Règle du canon : « toujours sur Mac (`docker buildx --platform linux/arm64`), jamais sur rpi1 master ». | `politika/docs/historique/plans-suspendus-20260909/superpowers-plans/2026-07-23-frontend-mcp-a-communities-stats.md:1003` ; `docker buildx ls` ; `docker version` ; `politika/docs/POLITIKA-CANON.md:562-568` |
| 4 | **Registre et tag** | Docker Hub, compte `pablohassan`. Le Mac est authentifié sur Docker Hub et ghcr.io (`credsStore: desktop`). Tag immuable `<lot>-<sha8>-<AAAAMMJJHHMMSS>-<variante>`, par exemple `pablohassan/politika-frontend:vit-aa799861-20261002141323-frontend`. `pullPolicy: Always`. | `helm/politika/values.yaml:142-157` ; `kubectl get deploy -A` ; `~/.docker/config.json` (clés seulement) ; `docker image ls` (`s0-03976e61-20261003091242-bun`) |
| 4b | **Repli documenté** | `docker save \| ssh rpi1 docker load`, puis push depuis rpi1. | `politika/README.md:210-216` |
| 5 | **Vérifications avant déploiement** | ① Code de sortie du build capturé directement (`BUILD_EXIT`), jamais derrière un `tail`. ② `docker manifest inspect` : l'index doit porter `linux/arm64`. ③ Contenu vérifié en lançant l'image. Lancer les builds l'un après l'autre : deux buildx en parallèle saturent le disque du builder. | `~/.claude/projects/-Users-rusmirsadikovic-projetsperso-political-politika/memory/feedback_build_on_mac_not_master.md:32-41` ; `reference_build_push_verifier_manifest_20260817.md:15-31` ; `politika/docs/audit/2026-07-26-frontend-ui-data-sota/CURRENT.md:223-228` |
| 6 | **Déploiement Helm** | `deploy-helm.sh`, lancé depuis le Mac :<br>• scp du chart dans un dossier **propre** sur rpi1 (`STAGING="/tmp/politika-deploy-staging"`, « jamais ~/politika ») ;<br>• capture de l'overlay live par `helm get values` ;<br>• `ssh rpi1 helm upgrade $RELEASE $STAGING -n $NAMESPACE -f $STAGING/overlay.yaml … --history-max 5`.<br>Le tag passe par `IMAGE_TAG`/`FRONTEND_TAG` en `--set`, jamais par `kubectl set image`. `EXTRA_VALUES` est passé en `-f` après l'overlay, donc il prime. Mode `--dry-run` disponible. | `politika/deploy-helm.sh:17-34,63-67,113-124,148-158,186-195,229` |
| 7 | **Gardes du déploiement** | `context:audit` (avertissement seulement), garde de lignée Git, garde `values-prod.yaml` ↔ release (`ops/values-prod-sync.sh check` avant l'upgrade, `resync` après, résultat à committer). | `deploy-helm.sh:71-111,126-146,231-237` ; `ops/values-prod-sync.sh:12-21` |
| 8 | **Pourquoi Helm part de rpi1** | Le kubeconfig du Mac vise `https://192.168.1.171:6443` et échoue : « x509: certificate signed by unknown authority » (revérifié aujourd'hui, dette 20). Sur rpi1, `kubectl` et `helm` se lancent sans préfixe. Helm en v3.14.4 sur rpi1, v3.18.0 sur le Mac. | `kubectl config view --minify` ; `kubectl --request-timeout=8s get nodes` (Mac) ; `rpi1:~/docs/cluster/DETTE.md:89` ; `politika/CLAUDE.md:176-177` ; `deploy-helm.sh:8-11` ; `helm version --short` |

Aucun script de build ou de push n'existe dans Politika (`find` des motifs `*build*.sh`, `*push*.sh`, `*image*.sh` sans résultat).

---

## 2. Règles du cluster qu'une nouvelle application DOIT respecter

| Règle | Source |
|---|---|
| Aucun build d'image ni workload applicatif sur les masters rpi1/2/3 (taint `control-plane:NoSchedule`). | `rpi1:~/CLAUDE.md:130-131` ; `cluster-k3s-carte-identite-2026-06-06.md:867,2035` ; `kubectl get nodes` (taints) |
| Images `linux/arm64` : les 9 nœuds sont en arm64. | `kubectl get nodes -L kubernetes.io/arch` ; `carte-identite:772` |
| Images sur Docker Hub `pablohassan/<app>`, publiques, sans `imagePullSecrets` ; pas de `registries.yaml` sur les nœuds. Seule exception : aba-demo, sur ghcr.io avec le secret `ghcr`. | `ls /etc/rancher/k3s` (rpi1, rpi4) ; `carte-identite:202-204,1959` ; `curl hub.docker.com/v2/repositories/pablohassan/mecapilot-front/` (`is_private=false`) |
| Tag immuable versionné, jamais `:latest` (dette 18 : « 28 conteneurs sur images non versionnées »). | `rpi1:~/docs/cluster/DETTE.md:86` ; `build-and-push.yml:40` |
| Tout objet Kubernetes passe par Helm, jamais par `kubectl apply` ni `kubectl set image`. | `rpi1:~/CLAUDE.md:134` ; `POLITIKA-CANON.md:567` ; `carte-identite:374` |
| Services LoadBalancer « via Helm uniquement ». | `rpi1:~/docs/cluster/metallb-ip-allocations.md:68` |
| IP MetalLB fixée par `spec.loadBalancerIP` seul, sans l'annotation `metallb.universe.tf/loadBalancerIPs`. Ne jamais patcher l'IP d'un Service. | `metallb-ip-allocations.md:65-66` |
| IP prise au registre : pool `.70–.169` ; `.101` réservée à countrizz/web, `.102` à countrizz/scores. | `metallb-ip-allocations.md:9-10,54-55` |
| Après la création du Service : relancer `bash ~/docs/cluster/gen-metallb-allocations.sh` sur rpi1. | `metallb-ip-allocations.md:70-74` ; `gen-metallb-allocations.sh:4` |
| Une règle NetworkPolicy ingress par port exposé. | `metallb-ip-allocations.md:67` |
| NetworkPolicy `namespace-isolation` : intra-namespace, `monitoring`, `192.168.1.0/24`, `10.42.0.0/16` (le pod CIDR est requis par le SNAT kube-proxy). | `rpi1:~/GUIDE-DEVOPS.md:385-406` ; `kubectl -n mecapilot get netpol namespace-isolation` |
| Un namespace par projet. | `carte-identite:276,1537-1553` |
| Placement : exclure `raspberrypi0` (4 Go, instable) et `rpi6-4b` (taint `role=reverse-proxy-backup`), ou cibler `node.agiso.fr/class=worker`. | `politika/helm/politika/values.yaml:660-666` ; `kubectl get nodes` (taints, labels) |
| Tout `NotIn` doit viser un nœud **existant** : un nom fantôme « ne produit ni erreur, ni avertissement, ni événement ». | `rpi1:~/CLAUDE.md:152-153,219-222` ; `DETTE.md:64` |
| Kyverno `heavy-pods-avoid-small-nodes` ne s'applique qu'à partir de 2Gi de request mémoire : il ne protège pas un petit nginx. | `kubectl get clusterpolicy -o json` (`"value":"2Gi"`) |
| Requests et limits déclarées et modestes : les CPU demandés sont saturés (rpi4 89 %, rpi8 86 %, rpi5 84 %). | `DETTE.md:97` |
| Helm : `--history-max 5`, jamais `--reuse-values`, version de chart explicite. | `rpi1:~/CLAUDE.md:134-135` ; `operations-runbook.md:44-52` ; `GUIDE-DEVOPS.md:553-566` |
| Avant un upgrade : prouver qu'aucune ressource ne disparaît (manifest contre template, diff, `--dry-run` puis `--atomic`). | `rpi1:~/docs/cluster/handoff-2026-08-26.md:325-343` |
| Helm et kubectl se lancent depuis rpi1, par scp et ssh ; pas depuis le Mac (dette 20). | `control-plane-ha.md:34-52` ; `DETTE.md:89` |
| Secrets : Vault (sidecar de l'injecteur), consommation opaque, rien dans les values, le dépôt ou les logs. En 2A, aucun secret n'est nécessaire côté pod. | `POLITIKA-CANON.md:566` ; `DETTE.md:83` ; `carte-identite:1289-1307,1339-1344` |
| Avant toute modification d'infra : lire la page du composant dans `~/docs/cluster/` ; si elle n'existe pas, l'écrire **avant** d'agir. | `rpi1:~/CLAUDE.md:137` |
| Toute écriture sur le cluster demande un GO sur la commande exacte. | `POLITIKA-CANON.md:570-577` |
| Supervision par opt-in : le récepteur par défaut est `devnull`. Ajouter le site à `blackbox-websites` (release `prometheus`, en partant de `helm get values`, pas de `~/helm-values/prometheus.yaml`, qui est périmé). | `monitoring-prometheus.md:18-25,29-31` ; `helm -n monitoring get values prometheus` |
| Logs : rien à configurer, Alloy ramasse stdout et stderr vers Loki. | `carte-identite:1442-1446` |
| Front mono-réplica : sans PDB, kured le draine (samedi 20:00–06:00). Prévoir un PDB ou 2 réplicas. | `DETTE.md:71,73` ; `carte-identite:1997-1999,2033` |
| Purge des images le dimanche à 03:30 : les tags hash ou datés non référencés sont supprimés ; `latest`, `stable`, `prod`, `main`, `master` et le semver sont protégés. | `operations-runbook.md:119-145` |

---

## 3. Le modèle le plus proche et ce qu'on en reprend

**Aucun site statique n'est une release Helm.** mecapilot, therapie, nuage-word, signature-privee, soluce-nuisibles et agi-so ont été posés par `kubectl apply` : l'annotation `last-applied-configuration` est présente et ils sont absents de `helm list -A` (`ssh rpi1 helm list -A` ; `kubectl -n mecapilot get deploy mecapilot-front -o yaml`). Il n'existe donc **pas de modèle conforme complet**. On assemble deux sources.

**A. Valeurs de mecapilot-front** (gabarit du vhost countrizz) (`kubectl -n mecapilot get deploy,svc,netpol -o yaml` → `scratchpad/conv/statiques/k-mecapilot.yaml:8-53,111-139`)
- On reprend :
  - 2 réplicas ;
  - requests 20m/32Mi, limits 100m/64Mi ;
  - Service LoadBalancer port 80 (`loadBalancerIP` .98 pour mecapilot, .101 pour nous) ;
  - NetworkPolicy `namespace-isolation`.
- On reprend aussi son Dockerfile multi-étapes `node:22-alpine` → `nginx:1.27-alpine` et son `nginx.conf` SPA (`try_files … /index.html`, `/assets/` en cache immutable) (`~/projetsperso/meca-pilot/Dockerfile:2-14`).
- On ne reprend pas : la méthode `kubectl apply`, l'absence de probes, de securityContext, d'affinité et de PDB, le tag réutilisé.

**B. Durcissement de signature-privee-front** (`~/projetsperso/signature-priv-concierge/k8s/deployment.yaml:18-40`)
- On reprend : sondes `tcpSocket`, `allowPrivilegeEscalation: false`, ordre de grandeur des ressources (25m/64Mi en requests, 150m/256Mi en limits).
- On ne reprend pas sa NetworkPolicy « port 80 depuis partout » (`k-signature-privee.yaml:144-152`) : elle diverge de `namespace-isolation`. Voir la question 7.

**C. Forme Helm de Politika** (`k-politika-prod.yaml:11-15,52-60,88-112` ; `tests/helmAffinity.test.ts:22-25,77-80`)
- On reprend : labels `app.kubernetes.io/*`, affinité `NotIn` sur `rpi6-4b` et `raspberrypi0`, probes `httpGet`, le test de chart qui refuse tout nœud inexistant, et le script de déploiement par staging scp puis `ssh rpi1 helm upgrade --install … --history-max 5`.

---

## 4. countrizz.fr : ce qui est en place, ce qui manque

### En place

| Élément | Preuve |
|---|---|
| DNS `countrizz.fr` et `www` → 82.65.17.134 | `dig +short` |
| Certificat couvrant les deux noms, valable jusqu'au 31/12/2026 | `openssl s_client … x509 -enddate` (« notAfter=Dec 31 12:32:15 2026 GMT ») |
| Vhost actif sur .60 : `/` → `http://192.168.1.101`, `/api/` → `.102/api/`, `sw.js`, `registerSW.js` et `manifest.webmanifest` en `expires -1` | `ssh pablito@192.168.1.60 cat -n /etc/nginx/sites-available/countrizz.fr.conf` (l.3-4, 36-59, 85-88) |
| Vhost identique sur le backup .3 (même md5 `70433c3d…`), poussée faite aujourd'hui | `md5sum` sur .60 et .3 ; `/var/log/nginx-sync.log` (« 2026-10-03 20:25:06 OK: sync completed ») |
| IP .101 et .102 réservées dans le registre et dans le générateur | `metallb-ip-allocations.md:54-55` ; `gen-metallb-allocations.sh:38-39,44` |
| Le site répond 502, avec les en-têtes de sécurité sur la racine | `curl -sI https://countrizz.fr/` |

### Manquant

| Élément | Preuve de l'absence |
|---|---|
| Namespace `countrizz` | `kubectl get ns countrizz` → NotFound |
| Release Helm et chart (`deploy/`, `helm/`, `k8s/`) | `helm list -A` ; `ls deploy helm k8s` → No such file |
| Dockerfile et conf nginx du pod | `ls` du dépôt |
| Dépôt Docker Hub `pablohassan/countrizz-web` | `curl hub.docker.com/v2/repositories/pablohassan/countrizz-web/` → « object not found » |
| Runner auto-hébergé pour `Pablohassan/Countrizz` | `gh api repos/Pablohassan/Countrizz/actions/runners` → `total_count: 0` |
| Service sur .101 | `kubectl get svc -A` (la plus haute IP live sous .115 est .100) |
| Cible `https://countrizz.fr` dans `blackbox-websites` | `helm -n monitoring get values prometheus` (11 cibles, sans countrizz) |
| Page composant countrizz dans `~/docs/cluster/` | non trouvée par les lecteurs (règle `rpi1:~/CLAUDE.md:137`) |
| Location de cache pour `.ktx2`, `.json`, `.wasm` dans le vhost (ils passent par `location /`) | `countrizz.fr.conf:61-88` |
| `application/wasm` dans `gzip_types` du proxy (transcodeur de 527 333 octets) | `.60 /etc/nginx/nginx.conf:48-81` ; `ls -la web/dist/assets` |
| Fichiers PWA attendus par le vhost (pas de `vite-plugin-pwa`) | `web/package.json` ; `web/vite.config.ts` ; `ls web/dist` |

Volumes à servir : `web/dist` fait 252 213 328 octets en 805 fichiers, dont :
- patchs image : 183 340 414 octets (394 fichiers) ;
- patchs SDF : 51 048 531 octets ;
- textures : 9 743 398 octets ;
- assets : 2 534 608 octets.

(`node` avec `fs.statSync` sur `web/dist`.) Les patchs image ne sont pas versionnés (`.gitignore: web/public/data/patches/img/` ; `git ls-files` → 0).

---

## 5. Écarts entre le spec §7 et la réalité, avec la correction à faire

| Spec | Réalité | Correction proposée au spec |
|---|---|---|
| « GitHub Actions construit des images **arm64** » (`spec:215`) | Le canon impose le build sur le Mac (`POLITIKA-CANON.md:564`) ; le hosted est coupé pour Politika mais tourne pour Countrizz (§0). Aucun workflow existant ne construit d'image sur le runner du Mac (§1). | « Images arm64 construites **sur le Mac** (`docker buildx --builder fresh-builder --platform linux/arm64 --push`), vérifiées (code de sortie, `docker manifest inspect`, lancement), puis déployées par un script à la `deploy-helm.sh`. » Le choix entre script manuel et runner dédié reste ouvert (questions 1 et 2). |
| Tag `pablohassan/countrizz-web:<commit>` (`spec:215`) | Convention du parc : `<lot>-<sha8>-<AAAAMMJJHHMMSS>-<variante>` (`build-and-push.yml:40`, images live). Les deux formes sont purgeables si elles ne sont pas référencées (`operations-runbook.md:139-145`). | Aligner sur `<branche>-<sha8>-<horodatage UTC>` (question 6). |
| « textures, patchs, drapeaux intégrés à l'image » (`spec:221`) | Le §1 amendé dit le contraire : « patchs image **hors dépôt** (…, déposés sur Garage au déploiement) » (`spec:36`).<br>• Les patchs sont gitignorés : un checkout de runner produit une image **sans** patchs.<br>• Garage est mono-nœud RF=1, LAN seulement (.76), dédié aux sauvegardes, sans route publique (`garage-s3.md:5-8,33-46`).<br>• Calques de plus de 150 Mo : des échecs de push depuis le Mac sont signalés. | Trancher une seule source pour les patchs (question 3). Écrire dans le spec d'où le build les prend. |
| « nginx non privilégié » (`spec:221`) | Aucun précédent : tous les fronts écoutent en root sur 80, 5173 ou 5174 (`meca-pilot/Dockerfile:9,13` ; `signature-priv-concierge/Dockerfile:10,13`). Le vhost appelle `http://192.168.1.101` sans port (`countrizz.fr.conf:86`). | Préciser : Service port 80 → `targetPort` égal au port du conteneur non privilégié ; NetworkPolicy sur le port du conteneur (question 5). |
| « déploiement Helm depuis l'opérateur » | Helm ne marche pas depuis le Mac (x509, dette 20). Patron réel : staging scp dans `/tmp/<projet>-deploy-staging` sur rpi1, puis `ssh rpi1 helm upgrade --install … --history-max 5` (`deploy-helm.sh:30-34,229`). | Écrire ce patron explicitement, avec `--dry-run` puis `--atomic` (`handoff-2026-08-26.md:325-343`). |
| Placement : « exclusion de `raspberrypi0` » et test Helm anti-nœud fantôme (`spec:226`) | Conforme. Le spec n'impose rien sur `rpi6-4b` (taint `reverse-proxy-backup`), et Kyverno ne couvre pas un pod de moins de 2Gi. | Ajouter `rpi6-4b` au `NotIn` (comme `values.yaml:660-666`) et le figer dans le test. |
| NetworkPolicies « une règle par port » (`spec:225-226`) | Conforme à `metallb-ip-allocations.md:67`. Le parc ajoute `namespace-isolation`. | Nommer le gabarit `namespace-isolation` (choix à confirmer, question 7). |
| Le spec ne prévoit ni supervision, ni page composant, ni régénération du registre MetalLB, ni types MIME ou compression | `monitoring-prometheus.md:29-31` (devnull par défaut) ; `rpi1:~/CLAUDE.md:137` ; `metallb-ip-allocations.md:70-74` ; `.60 nginx.conf` | Ajouter au §7 :<br>• cible blackbox ;<br>• page `~/docs/cluster/countrizz.md` écrite avant le premier déploiement ;<br>• `gen-metallb-allocations.sh` après la création du Service ;<br>• nginx du pod : `image/ktx2` et `application/wasm`, `gzip_types application/wasm`, Cache-Control sur `.ktx2`, `.json`, `.wasm`. |

---

## 6. Pièges connus qui menacent ce déploiement

1. **Runner du Mac inutilisable tel quel.** Il est lié à ColorNews. Un `runs-on: [self-hosted, mac-ci]` dans Countrizz resterait en file d'attente (`~/actions-runner-politika/.runner:7` ; `gh api …/Countrizz/actions/runners` → 0).
2. **Dépôt public et runner auto-hébergé.** La doc GitHub dit que ces runners ne devraient « almost never be used for public repositories », car « any user can open pull requests against the repository and compromise the environment » (docs.github.com, secure-use). `web-ci.yml` se déclenche sur `pull_request`. Le Mac détient les identifiants Docker Hub et ghcr (`~/.docker/config.json`, clés seulement).
3. **Mauvais remote.** `origin` pointe sur `WildCodeSchool/countrizz` (API runners → 404). Le dépôt de l'utilisateur est `pb`/`countriz` = `Pablohassan/Countrizz`, branche par défaut « Master » avec un M majuscule (`git remote -v` ; `gh api repos/Pablohassan/Countrizz`).
4. **Patchs absents d'un checkout propre.** L'image sortirait sans patchs image et le jeu se replierait sur la texture globale sans erreur visible (`.gitignore` ; `spec §8:257`).
5. **Grosse image.** Avec tout `dist`, environ 252 Mo de données sont tirés anonymement par des Pi. Les workers ont une racine NVMe de 57 Go, et rpi0 était à 82 % le 26/08 (`DETTE.md:69` ; `operations-runbook.md:176`). Des `docker push` de calques de plus de 150 Mo ont échoué depuis le Mac (« use of closed network connection ») (`memory/_archive_phase_a_20260429/incidents-pg-cluster/feedback_docker_push_mac_to_rpi1_workaround.md:7`).
6. **Code de sortie masqué.** Un `tail` ou un pipe après `buildx` masque le code de sortie. Le 17/08, un tag jamais poussé a été déployé (ImagePullBackOff) (`reference_build_push_verifier_manifest_20260817.md:15-29`).
7. **Disque Docker du Mac.** Un « no space left on device » a déjà cassé un build. Aujourd'hui : 6,561 Go d'images récupérables et 935,4 Mo de Build Cache (`docker system df`).
8. **Copier mecapilot.** Le faire tel quel (`kubectl apply`, tag réutilisé, root, sans affinité) violerait « Helm uniquement » (`metallb-ip-allocations.md:68`).
9. **Dette 40 dans le vhost.** Les locations images/svg, CSS/JS et polices posent `add_header Cache-Control`, ce qui retire HSTS, nosniff, COOP et CORP sur ces fichiers, drapeaux `.svg` compris (`countrizz.fr.conf:61-83` ; `DETTE.md:133`). Le proxy bufferise en 8×4k (`snippets/proxy-params.conf:20-22`). Corriger le vhost est une écriture sur .60.
10. **Types MIME.** Le `default_type` est `application/octet-stream` et nosniff est actif : sans type déclaré dans le nginx du pod, `.ktx2` et `.wasm` partent mal typés (`.60 nginx.conf` ; `security-headers.conf`).
11. **Rollback après la purge du dimanche.** Il repasse par un pull Docker Hub : l'ancien tag doit y exister encore (`operations-runbook.md:139-145`).
12. **Sources périmées.**
    - `GUIDE-DEVOPS.md` (07/05) prescrit `kubectl set image` et `rollout restart`, et une synchronisation nginx nocturne (`GUIDE-DEVOPS.md:516-530`). La synchronisation réelle est poussée toutes les 5 min (`DETTE.md:135`).
    - La carte d'identité (06/06) décrit un « CODE → kubectl set image » et un build sur rpi1 (`carte-identite:1952-1955,1968-1975`), ce que contredisent `rpi1:~/CLAUDE.md:131` et l'incident du 28/07 (`deploy-helm.sh:186-195`).
    - `~/CLAUDE.md:101` sur rpi1 dit encore « Garage 2 nœuds RF=2 », alors que `garage-s3.md:5-8` dit mono-nœud RF=1.
    - Le tableau du `~/CLAUDE.md` du Mac attribue improrap.fr au namespace `therapie`. En réalité improrap.fr est servi par `nuage-word` (.90) ; `therapie` sert carole-lagardere.fr (`.60 improrap.fr.conf:3`, `carole-lagardere.fr.conf:3`).
13. **visual-baselines doit rester sur Linux.** Ses références portent le suffixe `-linux` (`.github/workflows/visual-baselines.yml:2-3,29`).
14. **Migration de `ubuntu-latest`.** « The ubuntu-latest label will migrate to Ubuntu 26 beginning October 19, 2026 » (`gh run view 37143111810`, annotations).
15. **Écart de lecture déjà commis.** Un lecteur a écrit `/tmp/.x` sur rpi1 en redirigeant `kubectl get svc`. Le fichier a été laissé en place, à supprimer par l'opérateur s'il le souhaite (carte `cluster-docs`).

---

## 7. Questions à poser à l'utilisateur (non tranchées par les sources)

1. **Périmètre de la bascule.** Le runner hébergé tourne encore pour Countrizz (public). Faut-il seulement construire et pousser les images sur le Mac en gardant `web-ci` et `visual-baselines` sur `ubuntu-latest` (Linux, requis par les références) ? Ou tout basculer ?
2. **Forme de la « CI Mac ».** Deux options :
   - (a) script manuel `buildx --push` puis déploiement à la `deploy-helm.sh`, ce qui est le patron réel de Politika ;
   - (b) un **second runner** enregistré pour `Pablohassan/Countrizz` (nouveau dossier, LaunchAgent distinct, nouvelle étiquette : `mac-ci` est prise).
   
   Si (b), comment protéger un dépôt public ? Déclencheurs limités à `push` et `workflow_dispatch`, ou passage du dépôt en privé ?
3. **Patchs image (≈183 Mo).**
   - Dans l'image (§7), mais d'où le build les prend-il, puisqu'ils sont absents de git ?
   - Ou à part (Garage, PVC Longhorn, image de données distincte) ? Garage n'a pas de route publique et sert aux sauvegardes.
   
   Le spec dit les deux.
4. **Dépôt Docker Hub `pablohassan/countrizz-web`.** Public comme les autres, sans secret de tirage ? S'il est privé, il faut un secret alimenté depuis Vault sur le modèle `dockerhubPull`. Ce mécanisme est désactivé et le secret `dockerhub-pull` n'existe pas dans `politika-prod` (`values.yaml:2158-2172` ; `kubectl get secret dockerhub-pull` → NotFound).
5. **nginx non privilégié.** Quelle image (`nginx-unprivileged` ou `nginx:alpine` avec `runAsUser`), quel port interne, et faut-il `runAsNonRoot`, `readOnlyRootFilesystem` et seccomp, qu'aucun front actuel n'utilise ?
6. **Format du tag.** `<sha>` (spec) ou `<branche>-<sha8>-<horodatage>` (Politika) ?
7. **NetworkPolicy.** `namespace-isolation` (LAN, pods, monitoring) ou règle ouverte par port (signature-privee) ?
8. **Valeurs du chart.** Dans le dépôt (`values-prod.yaml` synchronisé, patron Politika) ou dans `~/helm-values/countrizz.yaml` sur rpi1 (`operations-runbook.md:44-52`) ? Ce dossier ne contient aujourd'hui que des charts tiers (`ls ~/helm-values`).
9. **Branche de production.** `phase1b-rendu` (non fusionnée) ou `Master` ?
10. **Contenu du chart en 2A.** `web` seul (.101), avec `scores` et `postgres` en 2B ?
11. **Disponibilité.** 2 réplicas, ou 1 réplica avec un PDB `minAvailable: 1` ?
12. **Écritures hors chart, chacune soumise à un GO.**
    - Corriger le vhost sur .60 (dette 40, plus une location de cache pour `.ktx2`, `.json`, `.wasm`, plus `gzip` pour `wasm`) **avant** la mise en ligne ?
    - Ajouter `countrizz.fr` à `blackbox-websites`, ce qui demande un upgrade de la release `prometheus` avec la procédure en 8 étapes ?
13. **Page composant.** Écrire `~/docs/cluster/countrizz.md` sur rpi1 avant le premier déploiement, comme l'exige `rpi1:~/CLAUDE.md:137` ?
14. **Kubeconfig du Mac (dette 20).** Le laisser cassé et tout faire passer par ssh vers rpi1, ou le régénérer, ce qui est une décision de l'utilisateur ?

---

# PARTIE 2 — Critique (prime sur la partie 1)


J'ai tout vérifié en lecture seule le 03/10/2026. Les fichiers copiés depuis le cluster sont dans `/private/tmp/claude-501/-Users-rusmirsadikovic-projetsperso-countriz-countrizz/085a9229-9522-48a2-8fe1-d0d8add9f4b0/scratchpad/conv/critique/`.

Le document est juste sur l'essentiel, mais quatre affirmations sont fausses :
- **Placement :** cibler `node.agiso.fr/class=worker` n'écarte pas `raspberrypi0`.
- **nginx non privilégié :** un front tourne déjà en non-root (`agi-so-com-app`), contrairement à ce que dit le document.
- **Purge des images :** le passage de 03:00 retire toute image inutilisée, sans aucune protection de tag.
- **kubeconfig sur rpi1 :** les deux fichiers ne visent pas la VIP `.208`.

## (a) Affirmations fausses ou non étayées, avec correction

1. **§2, placement : « ou cibler `node.agiso.fr/class=worker` » est faux.**
   - `raspberrypi0` et `rpi6-4b` portent tous deux `node.agiso.fr/class=worker` (`kubectl get nodes -o json` → `raspberrypi0 [] …,node.agiso.fr/class=worker,…` ; `rpi6-4b […] …,node.agiso.fr/class=worker`).
   - **Correction :** `nodeSelector node.agiso.fr/class=worker` **plus** `NotIn [raspberrypi0, rpi6-4b]`. `rpi6-4b` est déjà écarté par son taint `{"key":"role","value":"reverse-proxy-backup","effect":"NoSchedule"}`, et le `NotIn` reste une redondance déclarée.
   - Le motif donné par Politika pour `rpi6-4b` n'est pas le taint mais « RPi 4, pas de support Bun » (`politika/helm/politika/values.yaml:664`).

2. **§5 et question 5, « nginx non privilégié : aucun précédent », « runAsNonRoot … qu'aucun front actuel n'utilise » : faux.**
   - `agi-so-com/agi-so-com-app` (image `pablohassan/agi-so-commercial-front:1.0`) a le port `[3000]` et `sc {"allowPrivilegeEscalation":false,"runAsNonRoot":true,"runAsUser":1001}`, avec des sondes (`kubectl get deploy,sts,cronjob -A -o json`).
   - Les autres fronts sont bien sans `runAsNonRoot` : mecapilot sur le port 80 sans securityContext, politika-frontend sur 5173.

3. **§1 étape 4 et §5, tag « convention du parc `<lot>-<sha8>-<AAAAMMJJHHMMSS>-<variante>` » (source `build-and-push.yml:40`) : inexact.**
   - Le workflow calcule `SHORT_SHA=${GITHUB_SHA::12}`, soit 12 caractères (`build-and-push.yml:31`). Le sha8 vient seulement des tags posés à la main (`politika-frontend:vit-aa799861-20261002141323-frontend`, live).
   - C'est la convention de **Politika** seulement. Les autres fronts sont en tags de version manuels : `mecapilot-front:1.10`, `agi-so-commercial-front:1.0`, `nuage-front:1.3`, `carole-therapie-front:1.2`, `poker_frontend_app:02` (même commande kubectl).
   - Le chart Politika lui-même a des défauts mutables : `tag: refacto-bun`, `tag: latest` (`values.yaml:146,156`). `README.md:210-216` construit `:refacto-bun` et `:latest`. Ce README contredit donc la règle du tag immuable : à signaler, pas à prendre pour modèle.

4. **§2, purge : « `latest`, `stable`, `prod`, `main`, `master` et le semver sont protégés » n'est vrai que pour le script de 03:30.**
   - À 03:00 le dimanche, chaque nœud lance `crictl --timeout 300s rmi --prune` (`/etc/cron.d/cleanup-weekly` sur rpi1).
   - `crictl rmi --help` donne : `--prune, -q  Remove all unused images`. Toute image non utilisée sur le nœud est donc retirée, **quel que soit son tag**.
   - Le runbook décrit ce passage comme « images containerd sans tag » (`operations-runbook.md:123`), ce que l'aide de crictl contredit.
   - **Conséquence :** tout rollback ou toute replanification après un dimanche retire l'image de Docker Hub. Le piège 11 est juste dans sa conclusion, mais pas pour la raison donnée.
   - Le regex du script de 03:30 (`SAFE_PATTERN='^(<none>|[0-9a-f]{7,40}|[0-9]{8}-.*|.*-[0-9]{8}.*)$'`, `cluster-image-cleanup.sh:25`) attrape bien les deux formes de tag : `<sha>` et `…-AAAAMMJJ…`.

5. **§1 étape 8, « Sur rpi1, kubectl et helm se lancent sans préfixe » : vrai, mais pas avec le même kubeconfig, et aucun ne vise la VIP.**
   - Helm lit `~/.kube/config`, qui contient `server: https://192.168.1.171:6443`.
   - `kubectl` (`/usr/local/bin/kubectl -> k3s`) lit `k3s.yaml`, qui contient `https://127.0.0.1:6443` (`kubectl config view --minify`, avec et sans `KUBECONFIG`).
   - Cela contredit `control-plane-ha.md:14-25` (« Les deux fichiers pointent vers `server: https://192.168.1.208:6443` ») et le garde-fou `rpi1:~/CLAUDE.md:133`. `deploy-helm.sh:41-42` le reconnaît : « server 192.168.1.171 ».
   - **Conséquence :** un déploiement countrizz dépend de l'apiserver de rpi1 seul. À noter comme dérive de la doc, ou à ajouter à DETTE.

6. **Piège 5 : « rpi0 était à 82 % le 26/08 » est périmé, et « les workers ont une racine NVMe de 57 Go » est trop général.**
   - Mesure du jour (`ssh rpiN df -h /`) :

     | Nœud | Taille | Utilisé |
     |---|---|---|
     | rpi7 | 57G | **82 %** |
     | rpi8 | 57G | **80 %** |
     | rpi4 | 57G | 70 % |
     | rspi (rpi0) | 57G | 50 % |
     | rpi5 | **939G** | 19 % |

   - rpi7 et rpi8 sont au-dessus de la cible « aucun nœud > 80 % » (`operations-runbook.md:176`), alors que Kyverno les **préfère** pour les pods lourds.

7. **§2, « Tout objet Kubernetes passe par Helm » (source `rpi1:~/CLAUDE.md:134`) : la source ne dit pas cela.**
   - La ligne dit « Toujours utiliser Helm pour les changements applicatifs/infra **geres par chart** ».
   - La forme absolue vient de `POLITIKA-CANON.md:567` (« Infra : toujours Helm, jamais `kubectl apply` manuel ») et, pour les LoadBalancer, de `metallb-ip-allocations.md:68`.

8. **§2, « jamais `--reuse-values` » est trop fort.** `operations-runbook.md:52` dit « Ne pas faire `helm upgrade --reuse-values` **sans verifier** les valeurs stockées », et `rpi1:~/CLAUDE.md:135` dit « Eviter … sans verifier ».

9. **Piège 10 et §4, types MIME : mauvaise source.**
   - `default_type application/octet-stream` (`.60 nginx.conf:32`) est celui du **proxy**. Pour une réponse proxifiée, c'est le `Content-Type` du pod qui passe.
   - La conclusion reste juste (déclarer `ktx2` et `wasm` dans le nginx du pod), mais la source à lire est le `mime.types` de l'image du pod. Je ne l'ai pas vérifié pour `nginx:1.27-alpine` : il aurait fallu tirer ou lancer l'image.
   - Il n'y a pas de CSP dans `snippets/security-headers.conf` (lignes 1-27) : rien ne bloque la compilation du wasm.

10. **§4 « Manquant » : « Location de cache pour `.ktx2`, `.json`, `.wasm` dans le vhost ».**
    - Ce n'est pas nécessaire. `location /` (`countrizz.fr.conf:85-88`) n'a pas d'`add_header`. Les en-têtes de sécurité y restent, et le `Cache-Control` posé par le nginx du pod devrait être relayé. Cette transmission est le comportement par défaut de `proxy_pass` : c'est un raisonnement, je ne l'ai pas mesuré, puisque le site répond aujourd'hui `HTTP/2 502`.
    - Poser le cache dans le pod évite une écriture sur .60 et la dette 40. À reformuler comme une option.

11. **Erreurs de ligne mineures.**
    - `runs-on: [self-hosted, mac-ci]` est à `backend-pr-gates.yml:69`, pas 62-68 (qui sont des commentaires).
    - La règle sur les masters est `rpi1:~/CLAUDE.md:131`, pas 130 (qui parle du redémarrage des masters).

12. **Non étayé : mecapilot « tag réutilisé » (§3 A).** Le tag live est `pablohassan/mecapilot-front:1.10`. Aucune source citée ne montre qu'il a été réutilisé.

## (b) Sujets non couverts qui comptent pour countrizz.fr

1. **Alertes.**
   - Les alertes `WebsiteDown`, `WebsiteSlowResponse`, `WebsiteSSLExpiringSoon` et `WebsiteSSLExpiryCritical` (groupe `blackbox-websites.rules`, `WebsiteDown` : `probe_success{job="blackbox-websites"} == 0`, `for: 2m`, `severity: critical`) sont **déjà routées** vers `discord-only` par `alertname=~"WebsiteDown|…"` (`helm -n monitoring get values prometheus -o json`). Ajouter la cible suffit : aucune route n'est à créer.
   - **Ordre :** n'ajouter la cible qu'une fois que le site rend 200. Il rend `HTTP/2 502` aujourd'hui (`curl -sI`), donc `WebsiteDown` tirerait au bout de 2 minutes.
   - Aucune route ni règle ne couvre `namespace="countrizz"` : le récepteur par défaut est `devnull`, et la seule règle de redémarrage de pods est `PolitikaPodRedemarrages`, limitée à `politika-prod`. Le crash d'un pod ne serait donc vu que par `WebsiteDown`.

2. **Purge des images et rollback** : voir (a)4. Le prochain passage est le dimanche 04/10 à 03:00. Le dernier passage central date du `2026-09-27T03:30` avec « Total deleted: 27 » (`~/cluster-image-cleanup.log`).

3. **`pullPolicy` et tirages depuis Docker Hub.**
   - Politika est en `Always` (`values.yaml:147,152,157`). Avec des tags immuables, `IfNotPresent` éviterait un tirage d'environ 250 Mo par démarrage de pod, et donc à chaque drain kured.
   - Les nœuds tirent sans authentification (pas de `registries.yaml`, `ls /etc/rancher/k3s`). Les limites de Docker Hub pour les tirages anonymes ne sont pas sourcées ici : à vérifier dans leur documentation avant de trancher.

4. **Calques de l'image.** Les échecs de push signalés concernent des calques de plus de 150 Mo. Les patchs 2048 font 140 335 406 octets et les 1024 43 005 008 : un `COPY` par résolution garde chaque calque sous ce seuil, alors qu'un seul `COPY img/` (183 Mo) le dépasse.

5. **Intégrité des patchs absents de git.** `web/public/data/imagery.json` porte un `sha256` et une taille par fichier (« AFG … "2048":{"bytes":855727,"sha256":"6902…"} »). Un contrôle au build vérifiant que l'image contient les 394 fichiers avec le bon hash fermerait le piège 4, qui sinon reste silencieux.

6. **Cache : les noms de fichiers ne sont pas versionnés.**
   - Patchs et textures ont des noms fixes : `afg-1024.ktx2`, `day-8k.ktx2`, `clouds-4k.ktx2` (`ls web/dist/...`). Un `immutable` serait faux pour eux.
   - Il faut un `max-age` court avec revalidation (ETag), ou un chemin versionné. Seuls `assets/*` sont hachés (`basis_transcoder-VXdx5NbI.wasm`, `index-Csn2w2DF.js`).
   - Le vhost pose déjà `expires 30d` et `"public, immutable"` sur `.svg` et `.png` (`countrizz.fr.conf:61-67`). Les drapeaux `.svg`, non hachés, resteraient en cache 30 jours après une mise à jour.

7. **Écritures sur la carte SD du proxy .60.**
   - Le proxy a `proxy_buffering on; proxy_buffer_size 4k; proxy_buffers 8 4k;` (`snippets/proxy-params.conf:20-22`) et `proxy_temp_path /var/cache/nginx/tmp` (`nginx.conf:97`), sur `/dev/mmcblk0p2` (`df`). Sa racine sur carte SD est déjà en dette 13.
   - Chaque KTX2 de plusieurs centaines de Ko dépasse ces tampons : 183 Mo de patchs peuvent passer par des fichiers temporaires sur la carte SD.
   - Option : `proxy_max_temp_file_size 0`, ou pas de tampon sur `/data/`. C'est une écriture sur .60, donc soumise à un GO.

8. **Répartition des 2 réplicas.** mecapilot a 2 réplicas sans affinité. Il faut une anti-affinité ou un `topologySpreadConstraints` par `kubernetes.io/hostname`, sinon un drain kured peut emporter les deux réplicas.

9. **Étiquette du namespace.** Les namespaces applicatifs portent `goldilocks.fairwinds.com/enabled=true` (`kubectl get ns --show-labels` : agi-so, mecapilot non, nuage-word, therapie…). C'est la convention pour les recommandations VPA de la dette 21 : à décider pour `countrizz`.

10. **Pod Security Admission.** Aucun namespace applicatif n'est en `baseline` ni en `restricted` (DETTE n°16, `DETTE.md`, section Sécurité). Un `countrizz` en `restricted` serait une première, cohérente avec « nginx non privilégié ».

11. **Licences servies.**
    - L'attribution EOX est affichée (`web/src/globe/GlobeView.tsx:114` `<ImageryCredit />`, texte dans `credits.tsx:2-8`).
    - En revanche, la page « Crédits » ODbL exigée par `spec:265` n'existe pas : aucun fichier de `web/src` ne référence `credits.json`, qui est pourtant servi (`web/dist/textures/credits.json`, `web/public/data/credits.json`).
    - Servir les patchs vaut publication sous CC BY-NC-SA 4.0 : le site doit rester non commercial (`spec:264`).

12. **Limitation de débit.** Les zones `limit_req_zone … zone=general` et `zone=api` existent (`nginx.conf:87-89`), mais le vhost countrizz n'en applique aucune. C'est sans enjeu pour le statique en 2A, mais à prévoir pour `/api/` en 2B (`spec:233` : « limite de requêtes par IP »).

13. **Quotas.** Il existe des `ResourceQuota` dans `crm-datagouv`, `espocrm` et `mautic` seulement (`kubectl get resourcequota -A`). Ce n'est pas une convention imposée, juste un choix à faire.

## (c) Vérifié et trouvé juste

**Registre d'images.**
- Docker Hub, compte `pablohassan`. Un seul `imagePullSecrets` dans tout le parc : `{"aba-demo/aba-demo":"ghcr"}`.
- `hub.docker.com/v2/repositories/pablohassan/countrizz-web/` rend 404.

**Build arm64 sur le Mac.**
- `POLITIKA-CANON.md:564` : « Build Docker : toujours sur Mac (`docker buildx --platform linux/arm64`), jamais sur rpi1 master ». Même règle dans `README.md:129` et `211`, repli `docker save | ssh … docker load` à `README.md:215-216`.
- `docker buildx ls` : `fresh-builder … running v0.30.0 … linux/arm64`. `docker version` : `arm64 29.4.0`.
- Le workflow hébergé ne se lance plus qu'à la main : `on: workflow_dispatch`, `runs-on: ubuntu-latest`, coupé le 09/09 (`build-and-push.yml:3-18`).

**Runners.**
- `politika-mac` est enregistré pour le seul dépôt `Pablohassan/ColorNews` (`.runner:3,7`). Étiquettes `self-hosted,ARM64,macOS,mac-ci`, statut online. Le LaunchAgent tourne (`launchctl list` : `4559 0 actions.runner.Pablohassan-ColorNews.politika-mac`).
- `politika-k3s` est online, étiquettes `self-hosted,Linux,ARM64,politika`.
- `Pablohassan/Countrizz` : `total_count` 0 runner, dépôt `public`, branche par défaut `Master`. `origin` pointe sur `WildCodeSchool/countrizz`.
- `web-ci.yml:2-6` se déclenche sur `push` et `pull_request`.

**Qui lance Helm, et comment.**
- `deploy-helm.sh` :
  - `CLUSTER_HOST="pablo1@192.168.1.171"` et `STAGING="/tmp/politika-deploy-staging"` (lignes 30-34) ;
  - capture de l'overlay par `helm get values` (124) ;
  - garde `values-prod-sync check` (133-146), puis `resync` (234-237) ;
  - garde de lignée (84-111) ;
  - `EXTRA_VALUES` passé en `-f` après l'overlay (148-158, 229) ;
  - `FRONTEND_TAG` en `--set` (192-195) ;
  - `helm upgrade … --history-max 5` (229).
- Kubeconfig du Mac cassé : `control-plane-ha.md:34-44` (« x509: certificate signed by unknown authority … toute operation Helm doit partir de raspberrypi1 ») et `DETTE.md:89` (n°20).
- Helm `v3.14.4+g81c902a` sur rpi1.

**Overlay de valeurs.** L'autorité est `helm get values` : `monitoring-prometheus.md:18-19` (« `~/helm-values/prometheus.yaml` est PÉRIMÉ ») et `deploy-helm.sh:13-15`.

**Placement.**
- 9 nœuds `arm64`. Taint `node-role.kubernetes.io/control-plane NoSchedule` sur rpi1, rpi2 et rpi3.
- Kyverno `heavy-pods-avoid-small-nodes` : seuil `"value":"2Gi"` sur `containers[0..2]`, `failurePolicy: Ignore`, mode `Audit`. Il ajoute `NotIn [raspberrypi0, rpi6-4b]` et préfère rpi7 et rpi8.
- Nœud fantôme : « ne produit ni erreur, ni avertissement, ni evenement » (`rpi1:~/CLAUDE.md:221-222` ; `DETTE.md:64`).

**MetalLB.** Tout est conforme dans `metallb-ip-allocations.md` :
- pool `.70–.169` (ligne 9) ;
- `.101` → `countrizz/web` et `.102` → `countrizz/scores`, réservées le 02/10 (54-55) ;
- règles 1 à 4 (65-68) ;
- régénération (70-74) ;
- plus haute IP live avant `.115` : `.100` (46).

**NetworkPolicy et ressources.**
- `mecapilot/namespace-isolation` admet `podSelector {}`, le namespace `monitoring`, `192.168.1.0/24` et `10.42.0.0/16`.
- mecapilot : 2 réplicas, requests `20m/32Mi`, limits `100m/64Mi`.
- 31 NetworkPolicies et 15 PDB dans le cluster.

**Supervision.** `blackbox-websites` a 11 cibles, sans countrizz. Récepteur par défaut `devnull` (`monitoring-prometheus.md:29`).

**Release Helm.**
- Aucune release ne correspond à un site statique (`helm list -A`). `blackbox-exporter` est une release à part (rev 1), mais la liste des cibles vit dans la release `prometheus` (`extraScrapeConfigs`).
- Namespace `countrizz` : NotFound.

**Garage.** Un seul nœud, RF=1 (`garage-s3.md:5-8` ; `kubectl -n garage-s3 get deploy` : `garage 1/1`, `garage-rpi1 0/0`). `rpi1:~/CLAUDE.md:101` (« RF=2 ») est périmé.

**Proxy .60.**
- Vhost : `.101` et `.102`, `expires -1` pour `sw.js`, `registerSW.js` et le manifest (`countrizz.fr.conf:3-4,36-59,85-88`). `add_header Cache-Control` dans les locations 61-83 (dette 40, `DETTE.md:133`).
- `gzip_types` ne contient pas `application/wasm` (`nginx.conf:56-81`).

**Autres points justes.**
- Les lignes de DETTE citées (64, 69, 71, 73, 83, 86, 89, 97, 133, 135) correspondent bien aux entrées n° 5, 10, 35, 12, 15, 18, 20, 21, 40 et 42.
- Le run de 03:30 est central sur rpi1 et ne couvre pas rpi6-4b (`operations-runbook.md:124,158`).