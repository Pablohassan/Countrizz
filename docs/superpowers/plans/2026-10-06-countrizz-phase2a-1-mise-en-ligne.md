# Countrizz — Phase 2A, plan 1 : mise en ligne de countrizz.fr · plan d'implémentation

> **Révisé le 08/10/2026 sur le Mac — prime sur tout le texte ci-dessous (Helm, `restricted`, PDB, scripts).** Décision
> de l'utilisateur : countrizz se déploie **exactement comme agi-so et mecapilot** — un manifeste `deploy/k8s/countrizz.yaml`
> (Namespace + étiquette Goldilocks, Deployment, Service LoadBalancer `.101`, NetworkPolicy `namespace-isolation`) appliqué
> par `kubectl apply` depuis rpi1. **Pas de Helm** (aucun site statique du parc n'en a), **pas de Pod Security
> `restricted`**, ni PDB, ni étalement, ni nœuds exclus ; les scripts `go.sh`, `deploy.sh`, `mise-en-ligne.sh`,
> `image-controle.mjs`, `check-chart.sh` et le chart sont **retirés**. Le proxy .60 est de la plateforme : vhost réduit le
> 08/10 à TLS + `location /` → `.101`, tout le comportement du site vit dans le pod. Branche : `newcountri`. Pas-à-pas :
> `docs/infra/2026-10-06-countrizz-premiere-mise-en-ligne.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `https://countrizz.fr` sert le globe actuel (démo de la 1B) depuis le cluster K3s : image arm64 construite et poussée depuis le Mac après la suite complète, chart Helm durci sur `.101`, déploiement atomique lancé depuis rpi1. La chaîne image → Helm → proxy est validée **avant** le jeu ; chaque plan suivant de la 2A se déploie par les mêmes deux commandes.

**Architecture:** `deploy/web/` (Dockerfile + `nginx.conf` sur l'image officielle `nginxinc/nginx-unprivileged`, utilisateur 101, port 8080) ; `deploy/scripts/` (préparation de l'image avec contrôle des 394 patchs image hors dépôt, construction, déploiement, contrôle du chart) ; `deploy/helm/countrizz/` (Namespace en Pod Security `restricted`, Deployment non root en lecture seule, Service LoadBalancer `.101`, PDB, NetworkPolicy `namespace-isolation`). Le proxy .60 (TLS, vhost déjà en place) relaie vers `.101`.

**Tech Stack:** nginx 1.30.5 (`nginxinc/nginx-unprivileged:1.30.5-alpine`, épinglée par empreinte), Helm 3.14.4 (version de rpi1), K3s, MetalLB, Docker buildx (builder `fresh-builder` du Mac), Node 24 (`node --test`, aucune dépendance npm nouvelle).

**Spec:** `docs/superpowers/specs/2026-10-05-countrizz-phase2a-design.md` §9 (déploiement) et §13 (points résolus le 06/10). Conventions sourcées : `docs/infra/2026-10-03-conventions-deploiement-countrizz.md` (la partie 2 prime).

## Découpage de la 2A

Ce plan est le **premier** d'une série ; chacun se termine par un déploiement sur countrizz.fr avec les scripts d'ici.

| Plan | Contenu | Dépend de |
|---|---|---|
| **2A-1 (ce plan)** | Mise en ligne du globe actuel | — |
| 2A-2 | Données bilingues et coordonnées des capitales (spec §6) | — |
| 2A-3 | Moteur du jeu en TypeScript pur : `rules`, `draw`, `clock`, `machine`, `scores` ; `i18n` (spec §1, §2) | 2A-2 |
| 2A-4 | API du globe à ajouter (spec §5) | — |
| 2A-5 | Écrans du jeu (spec §3), haptique (§7), erreurs (§10) | 2A-3, 2A-4 |
| 2A-6 | Accueil complet (avion A2 en boucle, §4), écran de chargement (Terre cartoon), PWA (§8) | 2A-4, 2A-5 |

## Global Constraints

- **Construction et déploiement depuis le Mac uniquement.** Le cloud écrit et contrôle le code ; il n'a accès ni au cluster, ni à rpi1, ni à Docker Hub en écriture.
- **La suite complète du Mac est la barrière** de toute image (`check`, `test:data`, `e2e`, `budget`) : `build-image.sh` l'exécute avant de construire.
- Étiquette d'image **immuable** `<branche>-<sha8>-<AAAAMMJJHHMMSS>` (convention Politika), **jamais réutilisée** ; image **publique** `pablohassan/countrizz-web` ; `pullPolicy: IfNotPresent`.
- Patchs image (183 Mo, hors dépôt) pris sur le disque du Mac, **contrôlés un par un** contre `web/public/data/imagery.json` (taille + sha256), **un calque par résolution** (2048 : 140 335 406 octets ; 1024 : 43 005 008 ; les calques de plus de 150 Mo échouent à l'envoi).
- Helm part de **rpi1** (`pablo1@192.168.1.171`) : kubeconfig du Mac cassé (dette 20). Staging propre `/tmp/countrizz-deploy-staging`, `--history-max 5`, **`--dry-run` puis `--atomic`**, jamais `--reuse-values`, preuve qu'aucune ressource ne disparaît.
- IP **`.101` par `spec.loadBalancerIP` seul** (sans annotation MetalLB) ; jamais patchée à la main.
- **Écritures hors dépôt, chacune sur GO explicite de l'utilisateur** (Task 5) : page `~/docs/cluster/countrizz.md`, envoi Docker Hub, namespace, release Helm, `gen-metallb-allocations.sh`, cible `blackbox-websites` (révisé le 08/10 : rien sur le proxy .60).
- Rappel : la purge du dimanche 03:00 (`crictl rmi --prune`) retire **toute** image inutilisée d'un nœud ; un rollback re-tire alors depuis Docker Hub (tirages anonymes : on retient la limite la plus stricte publiée, 10 / heure / IP — spec §13.3).

## Prototype du 06/10/2026 : ce qui est déjà prouvé (session cloud)

| Point | Résultat |
|---|---|
| Build du site | `npm run build` : `dist/` de 67 Mo **sans** les patchs image (absents du cloud) ; `index.html` seul (pas de page multiple dans `vite.config.ts`) |
| Image | `nginxinc/nginx-unprivileged:1.30.5-alpine` (multi-arch, arm64 compris ; utilisateur 101, port 8080 ; `wasm` présent dans `mime.types`, **`ktx2` absent**) |
| nginx | conteneur lancé `--read-only --tmpfs /tmp --user 101 --cap-drop ALL --security-opt no-new-privileges` : `/` et `/index.html` 200 `no-cache` ; `/assets/*.js` `application/javascript` `immutable` ; `/basis/*.wasm` `application/wasm` ; `/textures/*.ktx2` et `/data/patches/img/*.ktx2` **`image/ktx2`** `max-age=3600, must-revalidate` ; patch absent **404** ; `/healthz` 200 ; `/sw.js` absent **404** (et non la page HTML) ; `countries.json` gzippé |
| Contrôle des patchs | jeu d'essai : conforme → copie en `site/`, `img-2048/`, `img-1024/` ; altéré, manquant, en trop, non déclaré → **refus**, chaque défaut nommé (3 tests `node --test`) |
| Chart | `helm lint` (Helm **3.14.4+g81c902a**, celui de rpi1) ; rendu refusé sans `image.tag` ; 17 exigences de `check-chart.sh` vertes, et rouge si `readOnlyRootFilesystem` repasse à `false` (contre-épreuve) |
| K3s v1.31.6 réel (dans Docker) | `helm upgrade --install --dry-run` puis `--atomic` : le namespace reçoit `enforce: restricted` + Goldilocks ; **nos pods sont admis** ; un pod `nginx:alpine` root est **refusé** (« violates PodSecurity "restricted:latest" ») ; l'échec d'`--atomic` désinstalle la release et **garde le namespace** (`resource-policy: keep`). Le démarrage des conteneurs n'a pas pu être observé (runc imbriqué impossible dans la session cloud) : il l'est par le conteneur Docker en lecture seule ci-dessus, et le sera sur le cluster à la Task 5. |
| Gardes du déploiement | extraction des nœuds exclus de `values.yaml` (raspberrypi0, rpi6-4b) ; un nom inconnu (« rpi9 ») est refusé ; une ressource présente dans la release mais absente du nouveau rendu est détectée (`comm`) |

## Choix pris dans ce plan (à valider avec le plan)

1. **Le namespace est créé par le chart** (Helm gère ses étiquettes de sécurité), et la **release vit dans `default`** : Helm ne peut pas stocker une release dans un namespace qu'il crée lui-même. `helm list -n default` montre donc `countrizz`. Alternative écartée : `kubectl create namespace` + `kubectl label` dans le script (contraire à « toujours Helm »).
2. **Valeurs de production dans le dépôt** (`deploy/helm/countrizz/values.yaml`, aucun secret) ; seule l'étiquette d'image est passée au déploiement.
3. **Racine en lecture seule** (`readOnlyRootFilesystem`) en plus de `restricted` (qui ne l'exige pas) : nginx n'écrit que dans `/tmp` (`emptyDir` de 32 Mi).
4. **Pas de page multiple** : seul `index.html` est servi (`calibrate.html`, `probe.html` restent des outils de développement).

## Arborescence produite par ce plan

```
deploy/
  web/Dockerfile                 image du site (3 calques : site, patchs 1024, patchs 2048)
  web/nginx.conf                 types ktx2, cache, gzip, /healthz, 404 francs
  scripts/patchs.mjs             contrôle des patchs contre imagery.json
  scripts/patchs.test.mjs        3 tests node:test
  scripts/stage-image.mjs        prépare .image-staging/
  scripts/check-chart.sh         lint, rendu et 17 exigences du chart
  scripts/build-image.sh         Mac : suite complète → build → contrôle → buildx arm64 --push
  scripts/deploy.sh              Mac → rpi1 : gardes, --dry-run, --atomic, vérifications
  helm/countrizz/                Chart.yaml, values.yaml, templates/ (namespace, deployment, service, pdb, networkpolicy)
.github/workflows/deploy-ci.yml  node --test + check-chart.sh sur GitHub
.gitignore                       + .image-staging/
```

---

### Task 1 : serveur web (nginx) et Dockerfile

**Files:** Create `deploy/web/nginx.conf`, `deploy/web/Dockerfile` ; Modify `.gitignore`.

- [ ] **Step 1 : écrire `deploy/web/nginx.conf`**

```nginx
# Site statique Countrizz (image nginxinc/nginx-unprivileged : utilisateur 101, port 8080).
# Le proxy .60 termine TLS et relaie vers le Service (port 80 → 8080) ; les en-têtes de sécurité sont posés par .60.
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    server_tokens off;

    # ktx2 manque dans /etc/nginx/mime.types (wasm y est) : on l'ajoute sans remplacer la table héritée.
    include /etc/nginx/mime.types;
    types { image/ktx2 ktx2; }

    gzip on;
    gzip_types text/css application/javascript application/json application/wasm image/svg+xml application/manifest+json;
    gzip_min_length 1024;

    # Sonde de vie (kubelet), sans journal.
    location = /healthz { access_log off; default_type text/plain; return 200 "ok\n"; }

    # Fichiers hachés par Vite : cache immuable.
    location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; try_files $uri =404; }

    # Noms fixes (patchs, textures, drapeaux, données, transcodeur) : cache court, revalidé par ETag.
    location ~ ^/(data|textures|basis)/ { add_header Cache-Control "public, max-age=3600, must-revalidate"; try_files $uri =404; }

    # Page, service worker et manifeste : toujours revalidés (une nouvelle version doit être vue tout de suite).
    location = / { add_header Cache-Control "no-cache"; try_files /index.html =404; }
    location ~ ^/(index\.html|sw\.js|registerSW\.js|manifest\.webmanifest)$ { add_header Cache-Control "no-cache"; try_files $uri =404; }

    # Le reste n'existe pas : un patch absent doit rendre 404 (le jeu passe alors à la texture globale).
    location / { try_files $uri =404; }
}
```

- [ ] **Step 2 : écrire `deploy/web/Dockerfile`**

```dockerfile
# Image du site Countrizz. Construite SUR LE MAC (arm64) par deploy/scripts/build-image.sh, à partir de
# .image-staging/ préparé par deploy/scripts/stage-image.mjs : site/ (dist sans les patchs image), puis un dossier
# par résolution de patchs, chacun dans son propre calque (< 150 Mo : les envois de calques plus gros échouent).
FROM nginxinc/nginx-unprivileged:1.30.5-alpine@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
COPY deploy/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY .image-staging/site/ /usr/share/nginx/html/
COPY .image-staging/img-1024/ /usr/share/nginx/html/data/patches/img/
COPY .image-staging/img-2048/ /usr/share/nginx/html/data/patches/img/
USER 101
EXPOSE 8080
```

- [ ] **Step 3 : ajouter `.image-staging/` à `.gitignore`.**

- [ ] **Step 4 : vérifier (là où Docker tourne, Mac ou cloud)** — construire avec un `site/` = `web/dist` et deux patchs factices, lancer comme sur le cluster, contrôler les en-têtes :

```bash
docker run -d --name cz --read-only --tmpfs /tmp --user 101 --cap-drop ALL --security-opt no-new-privileges -p 18080:8080 countrizz-web:essai
for u in / /index.html /healthz /sw.js /data/countries.json /textures/day-4k.ktx2 /data/patches/img/xxx-2048.ktx2; do
  curl -s -o /dev/null -w "%{http_code} %{content_type} <- $u\n" http://localhost:18080$u; done
```

Attendu : `200 text/html` (/ et /index.html, `Cache-Control: no-cache`), `200 text/plain` (/healthz), `404` (/sw.js tant que la PWA n'existe pas), `200 application/json`, `200 image/ktx2` (`max-age=3600, must-revalidate`), `404` (patch absent).

- [ ] **Step 5 : commit** `deploy : image nginx non privilégiée du site (types ktx2, cache, /healthz)`

### Task 2 : contrôle des patchs image et préparation de l'image

**Files:** Create `deploy/scripts/patchs.mjs`, `deploy/scripts/patchs.test.mjs`, `deploy/scripts/stage-image.mjs`.

- [ ] **Step 1 : écrire le test** `deploy/scripts/patchs.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nomPatch, verifierPatchs } from './patchs.mjs';

function jeu() {
  const dossier = mkdtempSync(join(tmpdir(), 'patchs-'));
  const index = { sizes: [2048, 1024], countries: {} };
  for (const cca3 of ['FRA', 'JPN']) {
    index.countries[cca3] = { files: {} };
    for (const taille of index.sizes) {
      const octets = randomBytes(taille === 1024 ? 100 : 300);
      writeFileSync(join(dossier, nomPatch(cca3, taille)), octets);
      index.countries[cca3].files[String(taille)] = { bytes: octets.length, sha256: createHash('sha256').update(octets).digest('hex') };
    }
  }
  return { dossier, index };
}

test('un jeu conforme passe', () => {
  const { dossier, index } = jeu();
  assert.deepEqual(verifierPatchs(dossier, index), { attendus: 4, erreurs: [] });
  rmSync(dossier, { recursive: true });
});

test('fichier altéré, manquant ou en trop : chaque défaut est signalé', () => {
  const { dossier, index } = jeu();
  appendFileSync(join(dossier, 'fra-2048.ktx2'), 'x');
  rmSync(join(dossier, 'jpn-1024.ktx2'));
  writeFileSync(join(dossier, 'zzz-2048.ktx2'), '');
  const { erreurs } = verifierPatchs(dossier, index);
  assert.deepEqual(erreurs, ['fra-2048.ktx2 : 301 octets au lieu de 300', 'fra-2048.ktx2 : sha256 différent', 'jpn-1024.ktx2 : fichier manquant', 'zzz-2048.ktx2 : fichier en trop']);
  rmSync(dossier, { recursive: true });
});

test('un pays sans fichier déclaré dans imagery.json est signalé', () => {
  const { dossier, index } = jeu();
  delete index.countries.JPN.files['1024'];
  assert.ok(verifierPatchs(dossier, index).erreurs.includes('jpn-1024.ktx2 : absent de imagery.json'));
  rmSync(dossier, { recursive: true });
});
```

- [ ] **Step 2 : le lancer, le voir échouer** (`node --test 'deploy/scripts/*.test.mjs'` → module introuvable).

- [ ] **Step 3 : écrire `deploy/scripts/patchs.mjs`**

```js
// Contrôle des patchs image (hors dépôt) contre l'index versionné web/public/data/imagery.json :
// chaque pays × chaque taille doit exister avec la taille et le sha256 attendus, et rien d'autre ne doit traîner.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const nomPatch = (cca3, taille) => `${cca3.toLowerCase()}-${taille}.ktx2`;

export function verifierPatchs(dossierImg, index) {
  const erreurs = [];
  const attendus = new Set();
  for (const [cca3, pays] of Object.entries(index.countries)) {
    for (const taille of index.sizes) {
      const nom = nomPatch(cca3, taille);
      attendus.add(nom);
      const meta = pays.files?.[String(taille)];
      const chemin = join(dossierImg, nom);
      if (!meta) { erreurs.push(`${nom} : absent de imagery.json`); continue; }
      if (!existsSync(chemin)) { erreurs.push(`${nom} : fichier manquant`); continue; }
      const octets = readFileSync(chemin);
      if (octets.length !== meta.bytes) erreurs.push(`${nom} : ${octets.length} octets au lieu de ${meta.bytes}`);
      if (createHash('sha256').update(octets).digest('hex') !== meta.sha256) erreurs.push(`${nom} : sha256 différent`);
    }
  }
  for (const f of existsSync(dossierImg) ? readdirSync(dossierImg) : []) if (!attendus.has(f)) erreurs.push(`${f} : fichier en trop`);
  return { attendus: attendus.size, erreurs };
}
```

- [ ] **Step 4 : relancer** → `# pass 3`, `# fail 0`.

- [ ] **Step 5 : écrire `deploy/scripts/stage-image.mjs`**

```js
// Prépare .image-staging/ pour deploy/web/Dockerfile : site/ (dist sans les patchs image), puis img-<taille>/ par
// résolution (un calque Docker chacun, < 150 Mo). Refuse de continuer si un patch manque ou diffère de imagery.json.
// Usage : node deploy/scripts/stage-image.mjs [--dist web/dist] [--imagery web/public/data/imagery.json] [--out .image-staging]
import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { verifierPatchs } from './patchs.mjs';

const arg = (nom, defaut) => { const i = process.argv.indexOf(nom); return i > 0 ? process.argv[i + 1] : defaut; };
const dist = arg('--dist', 'web/dist');
const index = JSON.parse(readFileSync(arg('--imagery', 'web/public/data/imagery.json'), 'utf8'));
const out = arg('--out', '.image-staging');
const img = join(dist, 'data/patches/img');

const { attendus, erreurs } = verifierPatchs(img, index);
if (erreurs.length) {
  console.error(`Patchs image : ${erreurs.length} problème(s) sur ${attendus} fichiers attendus :\n  ${erreurs.slice(0, 20).join('\n  ')}`);
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
cpSync(dist, join(out, 'site'), { recursive: true, filter: (src) => !src.startsWith(img) });
for (const taille of index.sizes) {
  const d = join(out, `img-${taille}`);
  mkdirSync(d, { recursive: true });
  for (const f of readdirSync(img).filter((n) => n.endsWith(`-${taille}.ktx2`))) copyFileSync(join(img, f), join(d, f));
  const total = readdirSync(d).reduce((s, f) => s + statSync(join(d, f)).size, 0);
  console.log(`img-${taille} : ${readdirSync(d).length} fichiers, ${total} octets`);
}
console.log(`Patchs image vérifiés : ${attendus} fichiers conformes à imagery.json.`);
```

- [ ] **Step 6 : sur le Mac**, après `npm run build` : `node deploy/scripts/stage-image.mjs` → `img-2048 : 197 fichiers, 140335406 octets`, `img-1024 : 197 fichiers, 43005008 octets`, `Patchs image vérifiés : 394 fichiers conformes à imagery.json.` (recopier les nombres réels ; s'ils diffèrent, c'est `imagery.json` qui fait foi).

- [ ] **Step 7 : commit** `deploy : contrôle des 394 patchs image et préparation de l'image (un calque par résolution)`

### Task 3 : chart Helm et son contrôle

**Files:** Create `deploy/helm/countrizz/Chart.yaml`, `values.yaml`, `templates/_helpers.tpl`, `templates/namespace.yaml`, `templates/deployment.yaml`, `templates/service.yaml`, `templates/pdb.yaml`, `templates/networkpolicy.yaml`, `deploy/scripts/check-chart.sh`, `.github/workflows/deploy-ci.yml`.

- [ ] **Step 1 : écrire le contrôle d'abord** `deploy/scripts/check-chart.sh` (rouge tant que le chart n'existe pas)

```bash
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
```

- [ ] **Step 2 : `Chart.yaml`**

```yaml
apiVersion: v2
name: countrizz
description: Countrizz — site statique du jeu (web seul en 2A), servi sur countrizz.fr via le proxy .60.
type: application
version: 0.1.0
appVersion: "2A"
```

- [ ] **Step 3 : `values.yaml`**

```yaml
# Valeurs de production (aucun secret). L'étiquette d'image est imposée au déploiement (--set image.tag=…).
namespace: countrizz

image:
  repository: pablohassan/countrizz-web
  tag: ""                      # obligatoire : <branche>-<sha8>-<AAAAMMJJHHMMSS>, immuable
  pullPolicy: IfNotPresent     # tags immuables : pas de nouveau tirage à chaque démarrage de pod

replicas: 2

resources:                     # modestes : les CPU demandés du parc sont saturés (DETTE 97)
  requests: { cpu: 25m, memory: 32Mi }
  limits: { cpu: 150m, memory: 128Mi }

service:
  loadBalancerIP: 192.168.1.101   # réservée dans gen-metallb-allocations.sh ; jamais patchée à la main
  port: 80

placement:
  workerClass: worker             # node.agiso.fr/class
  # Nœuds exclus. raspberrypi0 et rpi6-4b portent AUSSI class=worker (audit du 03/10) ; rpi6-4b a de plus un taint.
  # Le script de déploiement refuse tout nom absent de `kubectl get nodes` (pas de nœud fantôme).
  avoidNodes: [raspberrypi0, rpi6-4b]

networkPolicy:
  lan: 192.168.1.0/24             # proxy .60 et LAN
  podCidr: 10.42.0.0/16           # requis : SNAT de kube-proxy sur le LoadBalancer
  monitoringNamespace: monitoring
```

- [ ] **Step 4 : `templates/_helpers.tpl`**

```yaml
{{- define "countrizz.labels" -}}
app.kubernetes.io/name: countrizz
app.kubernetes.io/component: web
app.kubernetes.io/part-of: countrizz
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Values.image.tag | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}
{{- define "countrizz.selector" -}}
app.kubernetes.io/name: countrizz
app.kubernetes.io/component: web
{{- end -}}
```

- [ ] **Step 5 : `templates/namespace.yaml`**

```yaml
# Namespace géré par ce chart (la release vit dans « default ») : Pod Security Admission « restricted » —
# Kubernetes refuse tout pod root, avec élévation de privilèges, capacités ou sans seccomp (une première sur le parc,
# décision du 06/10) — et étiquette Goldilocks comme les autres namespaces applicatifs.
apiVersion: v1
kind: Namespace
metadata:
  name: {{ .Values.namespace }}
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    goldilocks.fairwinds.com/enabled: "true"
    {{- include "countrizz.labels" . | nindent 4 }}
  annotations:
    helm.sh/resource-policy: keep   # un « helm uninstall » ne supprime pas le namespace
```

- [ ] **Step 6 : `templates/deployment.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: countrizz-web
  namespace: {{ .Values.namespace }}
  labels: {{- include "countrizz.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicas }}
  revisionHistoryLimit: 3
  selector:
    matchLabels: {{- include "countrizz.selector" . | nindent 6 }}
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxUnavailable: 0, maxSurge: 1 }
  template:
    metadata:
      labels: {{- include "countrizz.labels" . | nindent 8 }}
    spec:
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 101
        runAsGroup: 101
        fsGroup: 101
        seccompProfile: { type: RuntimeDefault }
      nodeSelector:
        node.agiso.fr/class: {{ .Values.placement.workerClass }}
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/hostname
                    operator: NotIn
                    values: {{- toYaml .Values.placement.avoidNodes | nindent 22 }}
      topologySpreadConstraints:          # un drain kured n'emporte jamais les deux réplicas
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels: {{- include "countrizz.selector" . | nindent 14 }}
      containers:
        - name: web
          image: "{{ .Values.image.repository }}:{{ required "image.tag est obligatoire (tag immuable)" .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - { name: http, containerPort: 8080, protocol: TCP }
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: [ALL] }
          readinessProbe:
            httpGet: { path: /healthz, port: http }
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet: { path: /healthz, port: http }
            initialDelaySeconds: 5
            periodSeconds: 15
          resources: {{- toYaml .Values.resources | nindent 12 }}
          volumeMounts:
            - { name: tmp, mountPath: /tmp }     # pid et caches de nginx (racine en lecture seule)
      volumes:
        - name: tmp
          emptyDir: { sizeLimit: 32Mi }
```

- [ ] **Step 7 : `templates/service.yaml`, `templates/pdb.yaml`, `templates/networkpolicy.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: countrizz-web
  namespace: {{ .Values.namespace }}
  labels: {{- include "countrizz.labels" . | nindent 4 }}
spec:
  type: LoadBalancer
  loadBalancerIP: {{ .Values.service.loadBalancerIP }}   # spec.loadBalancerIP seul, sans annotation MetalLB
  selector: {{- include "countrizz.selector" . | nindent 4 }}
  ports:
    - { name: http, port: {{ .Values.service.port }}, targetPort: http, protocol: TCP }
```

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: countrizz-web
  namespace: {{ .Values.namespace }}
  labels: {{- include "countrizz.labels" . | nindent 4 }}
spec:
  minAvailable: 1
  selector:
    matchLabels: {{- include "countrizz.selector" . | nindent 6 }}
```

```yaml
# Convention du parc « namespace-isolation » : entrées depuis le namespace, le monitoring, le LAN et le CIDR des pods
# (SNAT de kube-proxy). Une règle par port exposé (8080).
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: namespace-isolation
  namespace: {{ .Values.namespace }}
  labels: {{- include "countrizz.labels" . | nindent 4 }}
spec:
  podSelector: {}
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector: {}
        - namespaceSelector:
            matchLabels: { kubernetes.io/metadata.name: {{ .Values.networkPolicy.monitoringNamespace }} }
        - ipBlock: { cidr: {{ .Values.networkPolicy.lan }} }
        - ipBlock: { cidr: {{ .Values.networkPolicy.podCidr }} }
      ports:
        - { port: 8080, protocol: TCP }
```

- [ ] **Step 8 : `deploy/scripts/check-chart.sh`** → 17 lignes `ok`, code 0. **Contre-épreuve** : `readOnlyRootFilesystem: false` dans une copie → `ÉCHEC racine en lecture seule`, code 1 ; remettre.

- [ ] **Step 9 : `.github/workflows/deploy-ci.yml`**

```yaml
name: deploy
# Contrôles statiques du déploiement (sans cluster ni image) : vérification des patchs image et chart Helm.
# L'image se construit et se déploie depuis le Mac (deploy/scripts/build-image.sh, deploy.sh).
on:
  push:
    paths: ['deploy/**', '.github/workflows/deploy-ci.yml']
  pull_request:
    paths: ['deploy/**']
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: node --test 'deploy/scripts/*.test.mjs'
      - run: deploy/scripts/check-chart.sh
```

- [ ] **Step 10 : commit** `deploy : chart Helm countrizz (namespace restricted, non root, lecture seule, .101, PDB, namespace-isolation) et son contrôle`

### Task 4 : scripts de construction et de déploiement (Mac)

**Files:** Create `deploy/scripts/build-image.sh`, `deploy/scripts/deploy.sh`.

- [ ] **Step 1 : `deploy/scripts/build-image.sh`**

```bash
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
```

- [ ] **Step 2 : `deploy/scripts/deploy.sh`**

```bash
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
```

- [ ] **Step 3 : vérifier la syntaxe** (`bash -n` sur les deux) et les deux gardes hors cluster : nœud inconnu refusé, ressource perdue détectée (voir le prototype).

- [ ] **Step 4 : commit** `deploy : construction de l'image (Mac, suite complète d'abord) et déploiement depuis rpi1 (gardes, --dry-run, --atomic)`

### Task 5 : première mise en ligne (Mac, avec l'utilisateur ; chaque écriture hors dépôt sur GO)

**Ajout du 06/10 (demande de l'utilisateur) : tout s'enchaîne par `deploy/scripts/mise-en-ligne.sh`** (une étape après l'autre, arrêt à la première erreur, « GO ? [o/N] » avant chaque écriture hors dépôt, journal `~/countrizz-mise-en-ligne-*.log`, reprise `--depuis N [--tag T]`). Mode d'emploi : `docs/infra/2026-10-06-countrizz-premiere-mise-en-ligne.md`. Les étapes ci-dessous sont celles du script.

- [ ] **Step 1 (GO)** : page `~/docs/cluster/countrizz.md` sur rpi1 — rôle, namespace `countrizz` en Pod Security **`restricted`** (première du parc : un pod root y est refusé, voulu), release dans `default`, IP `.101`, image publique, commandes `build-image.sh` / `deploy.sh`, retour arrière (`helm rollback countrizz <révision> -n default`).
- [ ] **Step 2** : `deploy/scripts/build-image.sh` → recopier l'étiquette imprimée et la durée de la suite complète.
- [ ] **Step 3** : `deploy/scripts/deploy.sh <étiquette>` → recopier la sortie (rendu, gardes, dry-run, statut, `ok` de `/healthz` sur `.101`, `HTTP/2 200` de countrizz.fr).
- [ ] **Step 4 (GO)** : `gen-metallb-allocations.sh` sur rpi1 (`.101` désormais attribuée), résultat dans la doc du cluster.
- [ ] **Step 5** (révisé le 08/10 : rien ne se déploie sur le proxy .60) : contrôle en lecture seule, `curl -sI https://countrizz.fr/textures/day-8k.ktx2` (`Content-Type: image/ktx2`).
- [ ] **Step 6** : sur le téléphone de l'utilisateur : `https://countrizz.fr` affiche le globe, les trois boutons de la démo marchent.
- [ ] **Step 7 (GO, seulement une fois le site en 200)** : cible `countrizz.fr` dans `blackbox-websites` (alertes déjà routées vers Discord), par la procédure d'upgrade de la release `prometheus`.
- [ ] **Step 8** : mettre à jour `docs/HANDOFF.md` (site en ligne, étiquette déployée, prochain plan 2A-2) ; commit.

## Après ce plan

Plan **2A-2** (données bilingues), écrit à partir du spec §6 et de `section-4-donnees-bilingues.md`. Chaque plan suivant se conclut par `build-image.sh` puis `deploy.sh`.
