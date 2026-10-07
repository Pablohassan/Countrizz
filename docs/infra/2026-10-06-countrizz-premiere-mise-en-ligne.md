# countrizz.fr — première mise en ligne (Task 5 du plan 2A-1), pas à pas depuis le Mac

Préparé le 06/10/2026 dans la session cloud (qui n'a jamais vu l'infra), **révisé le 08/10/2026 sur le Mac** après
confrontation de `deploy/` aux règles écrites du cluster et à l'état réel (lecture seule : `~/docs/cluster/*` dont
`DETTE.md`, `kubectl`, `helm list -A`, vhost de .60, Docker Hub). **Chaque écriture hors du dépôt (Docker Hub, rpi1,
cluster, proxy .60) affiche la commande exacte et attend un GO ; un refus arrête tout** (`deploy/scripts/go.sh`).
Recopier les sorties réelles dans `docs/HANDOFF.md` à la fin.

## État réel relevé le 07-08/10 (avant la mise en ligne)

- K3s **v1.33.5+k3s1** (et non v1.31.6, version du prototype cloud), 9 nœuds Ready ; Helm **v3.14.4** sur rpi1 ;
  `kubectl` de rpi1 vise `127.0.0.1:6443` (apiserver de rpi1 seul).
- `node.agiso.fr/class=worker` sur raspberrypi0, 4, 5, 7, 8 et rpi6-4b ; rpi6-4b porte en plus le taint
  `role=reverse-proxy-backup:NoSchedule` → nœuds éligibles : rpi4, rpi5, rpi7, rpi8.
- MetalLB **v0.14.8**, pool `.70–.169` ; `.101`/`.102` réservées au registre, portées par aucun Service ;
  `spec.loadBalancerIP` honoré (mecapilot sur `.98`).
- Les **23 releases Helm** vivent chacune dans **leur** namespace ; aucune dans `default`, aucun chart ne crée le sien.
- Aucun namespace applicatif n'a d'étiquette Pod Security (3 namespaces système en `privileged`) : `countrizz` en
  `restricted` est une **première**, décidée par l'utilisateur le 08/10 (dette 16 « à trancher »).
- Proxy .60 : porte les VIP `.200` et `.208`, sudo sans mot de passe, `nginx` dans `/usr/sbin` ; vhost
  `countrizz.fr.conf` (md5 `70433c3d…`) lié dans `sites-enabled`, deux `location /` (redirection HTTP et relais HTTPS),
  locations de cache du gabarit (dette 40) ; poussée vers .3 toutes les 5 min (`/etc/cron.d/nginx-sync`) ;
  certificat valide jusqu'au 31/12/2026, renouvellement webroot ; sauvegardes des vhosts dans `sites-archive/`.
- Docker : builder `fresh-builder` (arm64) en marche ; Mac identifié sur Docker Hub en `pablohassan` ;
  `pablohassan/countrizz-web` n'existe pas encore (créé au premier envoi).

## Décisions de l'utilisateur du 08/10 appliquées au code

| Point | Décision | Où |
|---|---|---|
| Release Helm | dans le namespace `countrizz` (règle du parc), le chart ne crée plus son namespace | `deploy.sh`, chart |
| Namespace | créé par `deploy.sh` avant Helm, sur GO, avec `pod-security…/enforce=restricted`, `enforce-version=latest`, `goldilocks…/enabled=true` | `deploy.sh` |
| Racine en lecture seule | **retirée** (aucun front du parc ne la pose) | chart |
| Vhost .60 | **option (c)** : plus de locations de cache dans le bloc HTTPS, le Cache-Control du pod passe tel quel et les en-têtes de sécurité restent (dette 40) ; **`proxy_max_temp_file_size 0`** dans `location /` (dette 13) | `vhost.mjs` (+ test sur la copie exacte du vhost) |
| GO | sur chaque écriture, commande exacte affichée, refus = arrêt | `go.sh` |
| Image | essayée en local avant l'envoi (uid 101, `/healthz`, types `ktx2`), puis linux/arm64 et lecture **anonyme** contrôlés | `build-image.sh`, `image-controle.mjs` |
| Nœuds fantômes | test du chart sur le modèle `politika/tests/helmAffinity.test.ts` (dette 5), en plus du contrôle live | `chart.test.mjs` |

## En une commande (recommandé)

```bash
cd ~/projetsperso/countriz/countrizz          # branche newcountri (la branche cloud y est fusionnée depuis le 07/10)
deploy/scripts/mise-en-ligne.sh
```

Le script enchaîne les étapes 0 à 7 en attendant la fin de chacune et s'arrête à la première erreur ou au premier GO
refusé. Journal : `~/countrizz-mise-en-ligne-*.log`. Reprise : `deploy/scripts/mise-en-ligne.sh --depuis <étape>
[--tag <étiquette déjà poussée>]`.

| Étape | Ce qui se passe | GO |
|---|---|---|
| 0 | Prérequis, lecture seule : arbre propre, 394 patchs (`npm run imagery:fetch` sinon), `fresh-builder`, ssh rpi1 (Helm, nœuds), ssh .60 (vhost lisible, `sites-archive/`, sudo), `check-chart.sh`, tests `node --test` | — |
| 1 | Page `~/docs/cluster/countrizz.md` sur rpi1, écrite **avant** d'agir (affichée, ou diff si elle existe) | **oui** |
| 2 | `build-image.sh` : suite complète du Mac, build, contrôle des patchs, image arm64 chargée et essayée en local, puis **envoi sur Docker Hub**, puis contrôles arm64 + anonyme | **oui** (envoi) |
| 3 | `deploy.sh <étiquette>` : contrôles de l'image ; staging par scp dans `/tmp/countrizz-deploy-staging` (patron Politika) ; sur rpi1, sans écrire sur le cluster : lint, rendu, nœuds fantômes, ressources perdues, essai `--dry-run` ; **création du namespace** s'il est absent (ou contrôle de ses étiquettes) ; **`helm upgrade --install … -n countrizz --atomic`** ; rollout, sonde `.101/healthz`, `https://countrizz.fr/` | **oui** (namespace, Helm) |
| 4 | `bash ~/docs/cluster/gen-metallb-allocations.sh` sur rpi1 | **oui** |
| 5 | Vhost .60 : copie lue, transformée par `vhost.mjs`, diff affiché ; sauvegarde dans `sites-archive/countrizz.fr.conf.bak.<date>`, remplacement, `nginx -t`, rechargement ou restauration ; contrôle d'un drapeau (un seul Cache-Control, HSTS présent) et de `day-8k.ktx2` | **oui** |
| 6 | Vérification sur ton téléphone (globe, boutons de la démo, crédit EOX) | validation |
| 7 | Supervision : cibles `blackbox-websites` affichées ; ajout de `https://countrizz.fr` par la procédure de `monitoring-prometheus.md` (valeurs **live**, `~/helm-values/prometheus.yaml` est périmé), une fois le site en 200 | à part, **sur GO** |

Si `--atomic` échoue : la release est annulée, le namespace reste (il n'appartient pas à la release). Lire
`kubectl -n countrizz get events --sort-by=.lastTimestamp` sur rpi1 (refus Pod Security, image introuvable, sonde…).

## Points non vérifiables avant la mise en ligne

- Démarrage réel des pods sous `restricted`, chaîne `.60 → .101`, en-têtes servis : contrôlés par les étapes 3 et 5.
- Le fichier de renouvellement du certificat ne liste que `www` dans `[[webroot_map]]` (avec `webroot_path`) : probablement
  normal ; seul un `certbot renew --dry-run --cert-name countrizz.fr` sur .60 le confirmerait (sur GO).

## Fin

Mettre à jour `docs/HANDOFF.md` : étiquette déployée, date, sorties, et prochain plan (2A-2, données bilingues).
