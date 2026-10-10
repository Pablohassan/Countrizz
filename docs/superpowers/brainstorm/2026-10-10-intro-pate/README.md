# Intro en pâte à modeler — matière de conception (09-10/10/2026)

- `intro-pate.html` : prototype v5 validé (artifact https://claude.ai/artifact/K2h5GdvXXmaqWoCBjhtQm8). Il attend à côté
  de lui les sorties de `fabrique.cjs` et `acc-16.jpg` (capture de l'accueil, planche « Countrizz jouable »).
- `fabrique.cjs` : peintures « pâte » du monde (8192 et 4096) et de l'Europe, pentes, relief, contour de la France.
  `node fabrique.cjs <dossier web> <sortie>` ; sources : caches `web/scripts/geodata/.cache` et `web/scripts/textures/.cache`.
- `capture.cjs` : images figées (`?t=`) au format téléphone, Chromium SwiftShader, serveur local sur le port 8766.
- `captures/` : l'ancienne intro Lottie filmée (splash de `Master`, et `terre.json` « map-pin » non branché), puis les
  versions 4 et 5 du prototype.

Spec : `docs/superpowers/specs/2026-10-10-countrizz-intro-pate-accueil-design.md`.
