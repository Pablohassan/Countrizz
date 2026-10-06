# countrizz.fr — première mise en ligne (Task 5 du plan 2A-1), pas à pas depuis le Mac

Préparé le 06/10/2026 dans la session cloud. Les fichiers de déploiement sont sur la branche
`claude/compassionate-planck-14do24` (commits `ebd24d7` … `989c9ce`). **Chaque étape marquée GO écrit hors du dépôt :
elle attend l'accord explicite de l'utilisateur.** Recopier les sorties réelles dans `docs/HANDOFF.md` à la fin.

## 0. Préparer le Mac

```bash
cd ~/projetsperso/countriz/countrizz
git fetch countriz claude/compassionate-planck-14do24
git switch -c deploiement-2a1 countriz/claude/compassionate-planck-14do24   # ou fusionner dans newcountri
ls web/public/data/patches/img | wc -l        # attendu : 394 (patchs image hors dépôt)
docker buildx ls | grep fresh-builder          # builder arm64 utilisé par Politika
ssh pablo1@192.168.1.171 'helm version --short; kubectl get nodes -o name | wc -l'   # v3.14.4 ; 9 nœuds
deploy/scripts/check-chart.sh                  # 17 « ok »
node --test 'deploy/scripts/*.test.mjs'        # 3 tests verts
```

Note : l'étiquette d'image reprend le nom de la branche courante (`/` → `-`).

## 1. GO — page `~/docs/cluster/countrizz.md` sur rpi1 (avant le premier déploiement)

Brouillon à déposer (à relire) :

```markdown
# countrizz — site du jeu Countrizz (countrizz.fr)

- Namespace `countrizz`, **Pod Security Admission `enforce: restricted`** (première du parc) : tout pod root, avec
  élévation de privilèges, capacités ou sans seccomp y est REFUSÉ par l'API. C'est voulu. Étiquette Goldilocks.
- Release Helm `countrizz` dans le namespace **`default`** (le chart crée le namespace et pose ses étiquettes ;
  `helm.sh/resource-policy: keep` : `helm uninstall` ne le supprime pas).
- Deployment `countrizz-web` : 2 réplicas étalés par nœud, PDB minAvailable 1, nginx non root (uid 101, port 8080),
  racine en lecture seule, nœuds `class=worker` sauf raspberrypi0 et rpi6-4b.
- Service LoadBalancer `countrizz-web` sur **192.168.1.101:80** (spec.loadBalancerIP) ; proxy .60 : vhost
  `countrizz.fr.conf` → `http://192.168.1.101`.
- Image publique `pablohassan/countrizz-web:<branche>-<sha8>-<AAAAMMJJHHMMSS>` (immuable), `IfNotPresent`, tirée sans
  authentification. Construite sur le Mac après la suite complète.
- Déployer : sur le Mac, `deploy/scripts/build-image.sh` puis `deploy/scripts/deploy.sh <étiquette>`.
- Revenir en arrière : `helm history countrizz -n default` puis `helm rollback countrizz <révision> -n default`
  (après une purge du dimanche, l'ancienne image est re-tirée depuis Docker Hub).
- Dépôt : github.com/Pablohassan/Countrizz, dossier `deploy/`.
```

## 2. Construire et pousser l'image

```bash
deploy/scripts/build-image.sh
```

Durée : celle de la suite complète du Mac (e2e compris), puis le build arm64. La dernière ligne est l'étiquette. Les
lignes `img-2048 : 197 fichiers, … octets`, `img-1024 : 197 fichiers, … octets` et `Patchs image vérifiés : 394 …`
doivent apparaître ; sinon, rien n'est construit.

## 3. Déployer

```bash
deploy/scripts/deploy.sh <étiquette>
```

Attendu, dans l'ordre : image trouvée sur Docker Hub ; staging ; lint ; « Aucun nœud fantôme » ; (rien à comparer au
premier déploiement) ; essai à blanc ; `STATUS: deployed` ; `deployment "countrizz-web" successfully rolled out` ;
`ok` (sonde `/healthz` sur .101) ; `HTTP/2 200` sur countrizz.fr.

Si `--atomic` échoue : la release est désinstallée, le namespace reste. Lire `kubectl -n countrizz get events
--sort-by=.lastTimestamp` sur rpi1 (refus Pod Security, image introuvable, sonde rouge…).

## 4. GO — allocations MetalLB

Sur rpi1 : `~/docs/cluster/gen-metallb-allocations.sh` (`.101` est désormais attribuée à `countrizz/countrizz-web`) ;
recopier le résultat dans la doc du cluster.

## 5. GO — proxy .60 : pas de fichiers temporaires pour les gros KTX2

Dans le **seul** vhost `/etc/nginx/sites-available/countrizz.fr.conf`, `location /` :

```nginx
proxy_max_temp_file_size 0;
```

Puis `sudo nginx -t && sudo systemctl reload nginx`, laisser la synchronisation vers le backup .3 (toutes les 5 min),
et vérifier :

```bash
curl -sI https://countrizz.fr/textures/day-8k.ktx2 | grep -iE 'HTTP|content-type|cache-control'
# attendu : HTTP/2 200, content-type: image/ktx2, cache-control: public, max-age=3600, must-revalidate
```

## 6. Sur le téléphone

`https://countrizz.fr` : le globe s'affiche, les trois boutons de la démo marchent, le crédit EOX est visible.

## 7. GO — surveillance (seulement une fois le site en 200)

Ajouter `https://countrizz.fr` aux cibles `blackbox-websites` (alertes WebsiteDown, SSL… déjà routées vers Discord),
par la procédure d'upgrade de la release `prometheus` (valeurs lues par `helm get values`, jamais le fichier périmé).

## 8. Fin

Mettre à jour `docs/HANDOFF.md` : étiquette déployée, date, sorties, et prochain plan (2A-2, données bilingues).
