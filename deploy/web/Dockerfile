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
