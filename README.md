# Countrizz

Jeu de géographie : un globe 3D (three.js WebGPU) vole vers un pays, à toi de le reconnaître.

- Design : `docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md`
- Plans : `docs/superpowers/plans/`
- Application : `web/` — `npm install`, `npm run dev`, `npm run check`
- Données : `cd web && npm run geodata:fetch && npm run geodata && npm run test:data`
- Textures globales : `cd web && npm run textures:fetch && npm run textures` (exige `toktx` 4.x, KTX-Software)
- Contrôles headless (WebGPU et WebGL 2) : `cd web && npm run e2e` ; les 197 pays seuls : `npm run e2e:countries`
