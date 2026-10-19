# Image du site Countrizz. Construite SUR LE MAC (arm64) par deploy/scripts/build-image.sh, à partir de
# .image-staging/ préparé par deploy/scripts/stage-image.mjs : site/ (dist sans les patchs image ni les vidéos), video/
# (vidéos de l'intro), puis les photos, réparties sur des calques de moins de 150 Mo (`CALQUES` de stage-image.mjs : les
# envois de calques plus gros échouent).
FROM nginxinc/nginx-unprivileged:1.30.5-alpine@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
COPY deploy/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY .image-staging/site/ /usr/share/nginx/html/
COPY .image-staging/video/ /usr/share/nginx/html/video/
COPY .image-staging/img-1024-0/ /usr/share/nginx/html/data/patches/img/
COPY .image-staging/img-2048-0/ /usr/share/nginx/html/data/patches/img/
COPY .image-staging/img-2048-1/ /usr/share/nginx/html/data/patches/img/
USER 101
EXPOSE 8080
