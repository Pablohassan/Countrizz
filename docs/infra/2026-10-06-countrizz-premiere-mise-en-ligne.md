# countrizz.fr — première mise en ligne (Task 5 du plan 2A-1)

Préparé le 06/10/2026 dans la session cloud, **réécrit le 08/10/2026 sur le Mac** : countrizz se déploie **exactement
comme agi-so et mecapilot** (décision de l'utilisateur). Chaque écriture hors du dépôt (Docker Hub, cluster) se fait
sur GO, commande exacte montrée. Recopier les sorties réelles dans `docs/HANDOFF.md` à la fin.

## La règle du parc, relevée le 08/10

- **Sites applicatifs simples** (agi-so, mecapilot, signature-privee, therapie…) : un namespace à eux, un `Deployment`,
  un `Service` LoadBalancer sur une IP MetalLB (`spec.loadBalancerIP`), la NetworkPolicy `namespace-isolation`, posés
  par `kubectl apply` (annotation `last-applied-configuration`). **Aucun n'est une release Helm** ; Helm sert aux
  grosses applis et à l'infra (politika, crm-datagouv, mautic, espocrm, vault, monitoring…). Aucun namespace applicatif
  n'a de Pod Security.
- **Proxy .60 = plateforme** : TLS, redirection HTTP, routage vers l'IP MetalLB. Rien de propre à une appli (cache,
  types, service worker) ne s'y écrit : c'est dans le pod (`deploy/web/nginx.conf`).

## Ce que contient `deploy/`

| Fichier | Rôle |
|---|---|
| `deploy/k8s/countrizz.yaml` | Namespace `countrizz` (étiquette Goldilocks), Deployment `countrizz-web` (2 réplicas, port 8080, sondes `/healthz`, `allowPrivilegeEscalation: false`), Service LoadBalancer `192.168.1.101:80`, NetworkPolicy `namespace-isolation` (copie de celle d'agi-so) |
| `deploy/web/Dockerfile`, `deploy/web/nginx.conf` | Image `nginxinc/nginx-unprivileged` (uid 101) ; types `ktx2`, cache, `/healthz` |
| `deploy/scripts/build-image.sh` | Build du site, préparation de l'image (contrôle des 394 patchs), `buildx --push` arm64 de l'étiquette lue dans le manifeste ; refuse une étiquette déjà publiée |

## État relevé le 08/10 (avant la mise en ligne)

- Vhost `countrizz.fr.conf` sur .60 **réduit le 08/10** (sauvegarde `sites-archive/countrizz.fr.conf.bak.20261008`) :
  TLS + `location /` → `http://192.168.1.101` ; synchronisé sur .3. Le site répond 502 tant que le pod n'existe pas.
- `.101` réservée au registre MetalLB, portée par aucun Service.
- Essai à blanc côté serveur le 08/10 : Deployment, Service et NetworkPolicy acceptés par l'API et l'admission
  (validés dans `default`, le namespace n'existant pas encore).

## Pas à pas (chaque écriture sur GO)

```bash
cd ~/projetsperso/countriz/countrizz            # branche newcountri, arbre propre, patchs présents (cd web && npm run imagery:fetch)
deploy/scripts/build-image.sh                     # GO : envoi Docker Hub de pablohassan/countrizz-web:<étiquette du manifeste>
ssh pablo1@192.168.1.171 'kubectl apply -f -' < deploy/k8s/countrizz.yaml          # GO : écriture cluster
ssh pablo1@192.168.1.171 'kubectl -n countrizz rollout status deploy/countrizz-web && curl -fsS http://192.168.1.101/healthz'
ssh pablo1@192.168.1.171 'bash ~/docs/cluster/gen-metallb-allocations.sh'         # GO : registre MetalLB
curl -sSI https://countrizz.fr/ ; curl -sSI https://countrizz.fr/textures/day-8k.ktx2
```

Puis vérification sur le téléphone (globe, boutons de la démo, crédit EOX), et ajout de `https://countrizz.fr` aux
cibles `blackbox-websites` par la procédure de `monitoring-prometheus.md` (valeurs **live**), sur GO.

**Nouvelle version** : monter l'étiquette dans `deploy/k8s/countrizz.yaml` (`1.0` → `1.1`…), committer,
`build-image.sh`, ré-appliquer. **Retour arrière** : remettre l'étiquette précédente et ré-appliquer.

## Tests e2e : sur la version déployée (décision du 09/10/2026)

- Avant l'image : `cd web && npm run check && npm run test:data`.
- Après `kubectl apply` : `npm run e2e` puis `npm run budget` visent **https://countrizz.fr** (défaut des configs
  Playwright). Une préparation (`web/e2e/deployed.ts`) refuse de lancer les tests si le site n'a pas `probe.html` et
  `calibrate.html` ou s'il ne sert pas les `countries.json`, `imagery.json`, `borders.json` du dépôt.
- Le site publie donc `probe.html` et `calibrate.html` (build multi-pages, liées depuis aucune page du jeu). Les crochets
  de test (`window.__globe`) ne s'installent hors dev que si le navigateur porte `localStorage['countrizz:e2e'] = '1'`,
  posé par Playwright (`storageState`).
- Un e2e rouge sur le site : remettre l'étiquette précédente, ré-appliquer, corriger.
- Serveur local : `npm run e2e:local`, `npm run budget:local`.
