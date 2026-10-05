

######## 0
{
 "resume": "L'interface pilote le globe par un seul composant, `GlobeView` (web/src/globe/GlobeView.tsx). Il reçoit trois props : `ref`, `framing?` et `onReady?({backend, tier})`. Son handle `GlobeHandle` expose 7 méthodes : flyTo, prefetch, showQuestion, answer, clear, overview et setIdleSpin.\nL'état du globe vit dans `GlobeController` (le pays visé, les patchs, la révélation) et dans `CameraDirector` (la pose, les vols, la rotation). Cet état survit à une perte du GPU : le Canvas est alors recréé.\n\nDurées dans le code :\n- vol : de 1500 à 3500 ms, durée naturelle de van Wijk bornée. Calculé sur le vrai planificateur : FRA→JPN 2164 ms sur un téléphone 390×844, 2112 ms sur un bureau 1440×900 ; vers un voisin, 1500 ms.\n- recadrage après un redimensionnement : 300 à 600 ms.\n- vague d'apparition du pays à la question : 600 ms.\n- bonne réponse : vert et flash du contour. Mauvaise réponse : pulsation rouge à 2 Hz, sans fin tant qu'on n'appelle ni clear ni flyTo.\n- nuages : fondu de 800 ms. Patch image : fondu de 0,4 s.\n- voile de coupe en mouvement réduit : 250 ms.\n- Les 1500 ms de révélation du spec ne sont pas dans le globe : c'est au jeu de les minuter.\n\nMise en page. `GlobeView` pose un div `position:absolute; inset:0`. R3F le mesure avec react-use-measure, qui repose sur ResizeObserver. Aucun z-index nulle part : l'ordre DOM décide (Canvas, voile d'erreur, crédit, voile de coupe). index.html fixe `100dvh`, un fond #000 et `viewport-fit=cover`. Seul le crédit EOX gère une zone sûre (safe-area-inset-bottom).\n\nCrédit EOX. C'est un `<footer role=contentinfo>` monté par GlobeView, en bas à droite (right 8, bottom calc(4px + safe-area)), en sans-serif 10px blanc à 70 %. Le texte fait 111 caractères. Son encombrement réel n'a pas été mesuré.\n\nNiveaux de qualité :\n- haute : WebGPU, sans pointeur grossier, textures ≥ 8192. Textures 8K, patch 2048, bloom + TRAA, pas de résolution dynamique.\n- standard : textures 4K, patch 1024, bloom + MSAA 4, densité de pixels dynamique de 0,75 à 2.\n\nErreurs :\n- navigateur non compatible : une error boundary, qui attrape en fait toute erreur du sous-arbre.\n- échec de chargement : 3 tentatives, puis un voile #16173a avec « Réessayer ».\n- perte du GPU : le renderer est recréé et `onReady` est rappelé.\nCes textes sont codés en dur en français, et le message « non compatible » n'a aucun style : il sortirait vraisemblablement en noir sur fond noir.\n\nCalculé à partir du cadrage (modèle sténopé). En vue d'ensemble sur un téléphone 390×844, le disque terrestre a un rayon de 297,7 px : il déborde la largeur. Un pays cadré occupe un disque centré de 64,1 px de rayon (FRA, JPN) ; sur le bureau 1440×900, 141,4 px.\n\nCe qui manque pour la 2A :\n- le léger rapprochement à la révélation (spec §5) ;\n- une vitesse de rotation d'accueil par défaut ; aujourd'hui la rotation n'est pas coupée en mouvement réduit, et tout flyTo ou overview la remet à 0 ;\n- une pause du rendu à la demande (seul l'onglet caché la déclenche) ;\n- des événements de chargement, d'erreur et de recréation transmis au parent ;\n- la traduction des textes du globe ;\n- un décalage du centre de cadrage pour tenir compte du HUD ;\n- `overview()` ne retire pas le pays : il faut aussi appeler `clear()` ;\n- `prefers-reduced-motion` n'est lu qu'une fois au montage ;\n- après un onglet caché, une rotation ou un vol saute au retour.",
 "faits": [
  {
   "fait": "Interface publique GlobeHandle : flyTo(rec: CountryRecord): Promise<void> ; prefetch(rec: CountryRecord): void ; showQuestion(): void ; answer(kind: 'correct' | 'wrong'): void ; clear(): void ; overview(): Promise<void> ; setIdleSpin(degPerSec: number): void",
   "source": "web/src/globe/GlobeView.tsx:22-30"
  },
  {
   "fait": "Props de GlobeView : ref?: Ref<GlobeHandle> (ref en prop React 19), framing?: FramingParams, onReady?(info: { backend: Backend; tier: QualityTier }): void. Aucune prop onError, onLoading ni onProgress.",
   "source": "web/src/globe/GlobeView.tsx:48-52"
  },
  {
   "fait": "Branchement du handle : showQuestion et answer passent performance.now() au contrôleur ; overview appelle directement controller.director.flyToOverview() (sans passer par le contrôleur) ; setIdleSpin appelle controller.director.setIdleSpin(d)",
   "source": "web/src/globe/GlobeView.tsx:79-87"
  },
  {
   "fait": "flyTo du contrôleur : pose la cible, remet la révélation à null (pays masqué), lance le chargement du patch SDF (cache courant + suivant) et du patch image, ramène les nuages à 1, puis vole. À l'arrivée : arrived = true et les nuages s'effacent (fadeClouds(0)). La promesse se résout à l'arrivée, que le patch soit chargé, en retard ou en échec.",
   "source": "web/src/globe/controller.ts:78-97"
  },
  {
   "fait": "CameraDirector.flyTo : « la promesse se résout à l'arrivée (ou quand un autre vol la remplace) » ; flyToPose résout le vol précédent et remet la rotation au repos à 0 (spinDegPerSec = 0)",
   "source": "web/src/camera/director.ts:64-89"
  },
  {
   "fait": "prefetch(rec) : mémorise le suivant et précharge son patch SDF et son patch image (les erreurs sont avalées)",
   "source": "web/src/globe/controller.ts:99-104"
  },
  {
   "fait": "showQuestion(nowMs) crée la chronologie { questionAtMs } ; answer(kind, nowMs) n'a d'effet que si une chronologie existe (showQuestion appelé avant)",
   "source": "web/src/globe/controller.ts:121-125"
  },
  {
   "fait": "clear() : nuages ramenés à 1, cible et chronologie à null, puis apply() retire le pays, le patch image et la balise. La caméra ne bouge pas.",
   "source": "web/src/globe/controller.ts:135-140"
  },
  {
   "fait": "flyToOverview : remonte à l'altitude de vue d'ensemble au-dessus du point courant, nord en haut ; target = null côté directeur seulement (le contrôleur garde son pays)",
   "source": "web/src/camera/director.ts:71-75"
  },
  {
   "fait": "setIdleSpin : « Rotation lente au repos (degrés de longitude par seconde, vers l'ouest) ; 0 l'arrête ». Elle n'agit que hors vol (branche else-if de update) et avance de spin × dt depuis la frame précédente.",
   "source": "web/src/camera/director.ts:61-62, 123-126"
  },
  {
   "fait": "Test unitaire de la rotation : setIdleSpin(6) déplace la caméra de -6° de longitude en 1000 ms, latitude inchangée (« la Terre semble tourner vers l'est »). Aucun e2e ne couvre setIdleSpin ou overview, et la démo ne les appelle pas.",
   "source": "web/src/camera/director.test.ts:126-133 ; web/src/main.tsx:22-46"
  },
  {
   "fait": "Point de départ de la caméra : start [2.35, 30] (lng, lat), en vue d'ensemble",
   "source": "web/src/globe/controller.ts:47"
  },
  {
   "fait": "Vol : FLIGHT = { rho: Math.SQRT2, timeScale: 1, minMs: 1500, maxMs: 3500 } ; durée naturelle de d3.interpolateZoom bornée à [1500 ; 3500] ms ; temps en easeInOutCubic",
   "source": "web/src/camera/config.ts:15 ; web/src/camera/flight.ts:25, 41"
  },
  {
   "fait": "Durées calculées par planFlight (script tsx, scratchpad/durees.ts). Téléphone 390x844 : départ->FRA 1500 ms, FRA->JPN 2164 ms, JPN->FJI 2199 ms, FRA->BEL 1500 ms, FRA->LUX 1500 ms, FRA->VAT 1500 ms, RUS->CHL 2445 ms, JPN->vue d'ensemble 1500 ms. Bureau 1440x900 : FRA->JPN 2112 ms, JPN->FJI 2148 ms, RUS->CHL 2030 ms, les autres à 1500 ms.",
   "source": "calcul tsx sur web/src/camera/flight.ts:35-64 + web/src/camera/config.ts:15"
  },
  {
   "fait": "Recadrage après un changement de viewport : vol court REFRAME_MS = { minMs: 300, maxMs: 600 } ; pendant un vol, il attend l'arrivée",
   "source": "web/src/camera/director.ts:20-21, 51-56, 91-104"
  },
  {
   "fait": "Vague de révélation (apparition du pays à la question) : WAVE_MS = 600, courbe 1 - (1 - e)^3 ; après answer, reveal = 1 et state = kind",
   "source": "web/src/globe/reveal.ts:3-4, 12-17"
  },
  {
   "fait": "Couleurs du pays dans le shader : jaune vec3(1.0, 0.933, 0.012), vert vec3(0.18, 0.8, 0.44), rouge vec3(0.91, 0.3, 0.24). Mauvaise réponse : pulse sin(t·4π)·0.25 + 0.75. Bonne réponse : flash exp(-3t) vers le blanc sur le contour. Remplissage à 0.63 (+ lueur jusqu'à 0.35).",
   "source": "web/src/globe/countryLayer.ts:69-75"
  },
  {
   "fait": "Nuages : CLOUD_FADE_MS = 800 (effacement à l'arrivée, retour au vol suivant) ; CLOUD_DRIFT_TURNS_PER_S = 1 / 1800",
   "source": "web/src/globe/clouds.ts:11-14"
  },
  {
   "fait": "Patch image : fondu IMAGE_FADE_S = 0.4",
   "source": "web/src/globe/controller.ts:14-15"
  },
  {
   "fait": "Balise : BEACON_SIZE_PX = 56 ; s'affiche sous BEACON_MAX_SCREEN_PX2 = 400 px² ; pulsation fract(time·0.8) ; anneau jaune, cœur blanc, faisceau vertical",
   "source": "web/src/globe/beacon.ts:10-11, 24-39"
  },
  {
   "fait": "La balise s'affiche dès le début du vol pour un micro-État (apply() est appelé dans flyTo ; condition needsBeacon), ou si le patch est en échec, ou à l'arrivée sans patch",
   "source": "web/src/globe/controller.ts:92, 148-149"
  },
  {
   "fait": "Mise en page : GlobeView rend un div style { position: 'absolute', inset: 0 } contenant, dans l'ordre DOM, le Canvas, le voile d'erreur (si loadError), <ImageryCredit />, la feuille @keyframes et le voile de coupe. Aucun zIndex dans web/src (recherche node).",
   "source": "web/src/globe/GlobeView.tsx:91-120"
  },
  {
   "fait": "Le Canvas de R3F 9.8.1 mesure son conteneur avec useMeasure({ scroll: true, debounce: { scroll: 50, resize: 0 } }) ; react-use-measure 2.1.7 s'appuie sur window.ResizeObserver ; div enveloppe { position: 'relative', width: '100%', height: '100%', overflow: 'hidden', pointerEvents } ; canvas { display: 'block' }",
   "source": "web/node_modules/@react-three/fiber/dist/react-three-fiber.esm.js:42-49, 159-178 ; web/node_modules/react-use-measure/dist/index.js:1"
  },
  {
   "fait": "index.html : <html lang=\"fr\">, meta viewport « width=device-width, initial-scale=1.0, viewport-fit=cover », style « html, body, #root { margin: 0; height: 100dvh; background: #000; overflow: hidden; } », titre Countrizz",
   "source": "web/index.html:2-7"
  },
  {
   "fait": "Canvas : flat (pas de tone mapping), dpr initial [1, 2], camera { fov: FOV_Y_DEG, near: 0.001, far: 100 } ; FOV_Y_DEG = 50",
   "source": "web/src/globe/GlobeView.tsx:92-96 ; web/src/camera/config.ts:5"
  },
  {
   "fait": "Le viewport transmis à la caméra est la taille R3F (size.width, size.height) ; vue d'ensemble 1.4 si width >= height, sinon 2.2",
   "source": "web/src/globe/GlobeView.tsx:191 ; web/src/camera/framing.ts:25-27 ; web/src/camera/config.ts:12"
  },
  {
   "fait": "Cadrage retenu : FRAMING = { k: 1, margin: 3, floor: 0.0003, overview: { landscape: 1.4, portrait: 2.2 }, minContextDeg: 3 } — « le pays occupe 1/3 du demi-champ (m = 3) » ; le pays est toujours au centre de l'écran (caméra regardant le centre de la Terre)",
   "source": "web/src/camera/config.ts:7-12 ; web/src/globe/globe.ts:151-155"
  },
  {
   "fait": "Calculé (modèle sténopé, scratchpad/tailles.ts). 390x844 : rayon du disque terrestre en vue d'ensemble = 297.7 px ; rayon de la calotte cadrée FRA 64.1 px (alt 1.1936), JPN 64.1 px, BRA 142.0 px, RUS 220.4 px, LUX 8.2 px. 1440x900 : disque terrestre 442.3 px ; FRA 141.4 px (alt 0.5755), JPN 141.4 px, LUX 18.0 px.",
   "source": "calcul tsx sur web/src/camera/framing.ts:29-35 + web/src/camera/config.ts:5,12"
  },
  {
   "fait": "Crédit EOX : <footer role=\"contentinfo\" aria-label=\"Crédits de l’imagerie\">, style position absolute, right 8, bottom 'calc(4px + env(safe-area-inset-bottom, 0px))', maxWidth 'calc(100% - 16px)', font '10px/1.3 sans-serif', color 'rgba(255, 255, 255, 0.7)', textAlign right, textShadow '0 0 2px #000' ; lien target _blank rel noreferrer, couleur héritée",
   "source": "web/src/globe/credits.tsx:11-25"
  },
  {
   "fait": "Texte du crédit : 'EOxCloudless ' + 'https://cloudless.eox.at' + ' by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)', soit 111 caractères (compté par node)",
   "source": "web/src/globe/credits.tsx:2-8"
  },
  {
   "fait": "Le spec §9 cite l'attribution avec le préfixe « Data & Viewing Products: », absent du code (dont le commentaire dit « mot pour mot (https://cloudless.eox.at/license-non-commercial, lu le 02/10/2026) »)",
   "source": "docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md:264 ; web/src/globe/credits.tsx:1"
  },
  {
   "fait": "Le crédit est monté par GlobeView, toujours, y compris pendant le chargement et par-dessus le voile d'erreur (frère suivant dans le DOM) ; le voile de coupe noir (250 ms), frère suivant, passe au-dessus du crédit",
   "source": "web/src/globe/GlobeView.tsx:108-119"
  },
  {
   "fait": "e2e du crédit : viewport 390x844, getByRole('contentinfo', { name: 'Crédits de l’imagerie' }), texte exact, href, et la boîte tient dans 390 px. Aucun contrôle elementFromPoint (exigé pour la 2A dans le HANDOFF).",
   "source": "web/e2e/credit.spec.ts:6-16 ; docs/HANDOFF.md:15"
  },
  {
   "fait": "Niveaux : qualityTier = 'haute' si backend === 'webgpu' && !coarsePointer && maxTexture2D >= 8192, sinon 'standard' ; coarsePointer = matchMedia('(pointer: coarse)')",
   "source": "web/src/globe/renderer.ts:8-11 ; web/src/globe/GlobeView.tsx:99"
  },
  {
   "fait": "Textures globales : '8k' en haute, '4k' en standard ; surface et nuages toujours 4k ; nuages facultatifs",
   "source": "web/src/globe/textures.ts:15-27"
  },
  {
   "fait": "Patch image : 2048 en haute, 1024 en standard",
   "source": "web/src/globe/imagePatch.ts:7-8"
  },
  {
   "fait": "Post-traitement : bloom { strength: 1.2, radius: 0.4, threshold: 0 } aux deux niveaux ; traa = tier === 'haute' ; msaa = 0 en haute, 4 en standard",
   "source": "web/src/globe/postprocessing.ts:14-16"
  },
  {
   "fait": "Résolution dynamique, standard seulement : min 0.75, max min(2, max(1, devicePixelRatio)), pas 0.25, slowMs 22, fastMs 14, fenêtre 30 frames",
   "source": "web/src/globe/dynamicResolution.ts:3-5 ; web/src/globe/GlobeView.tsx:133-134"
  },
  {
   "fait": "Onglet caché : setFrameloop('never') sur visibilitychange hidden, 'always' au retour ; c'est la seule pause du rendu",
   "source": "web/src/globe/GlobeView.tsx:136-141"
  },
  {
   "fait": "Le directeur n'est mis à jour que si le globe est chargé (useFrame : if (!globe) return avant director.update) ; un vol démarre à startMs = this.now (dernière frame)",
   "source": "web/src/globe/GlobeView.tsx:212-220 ; web/src/camera/director.ts:86-88"
  },
  {
   "fait": "prefers-reduced-motion : lu une seule fois au montage (useState) ; vols et recadrages en coupe (durationMs 0, cut = true) ; voile noir qui s'efface en 250 ms ; nuages sans dérive. Ni la rotation au repos, ni la vague, ni les pulsations ne sont coupées.",
   "source": "web/src/globe/GlobeView.tsx:66-69, 115-118, 225-227 ; web/src/camera/flight.ts:36 ; web/src/camera/director.ts:115, 123-126"
  },
  {
   "fait": "Navigateur non compatible : error boundary Unsupported (getDerivedStateFromError, donc toute erreur du sous-arbre) qui rend <p className=\"globe-unsupported\">Ton navigateur ne peut pas afficher le globe : il faut WebGPU ou WebGL 2.</p> ; R3F relance vers l'extérieur toute erreur du Canvas",
   "source": "web/src/globe/GlobeView.tsx:54-62 ; web/node_modules/@react-three/fiber/dist/react-three-fiber.esm.js:60-61"
  },
  {
   "fait": "Aucune règle CSS pour .globe-unsupported dans web/src ni dans les .html (recherche node) ; index.html ne fixe pas de couleur de texte sur un fond #000",
   "source": "web/index.html:7 ; web/src/globe/GlobeView.tsx:59"
  },
  {
   "fait": "createRenderer : WebGPURenderer avec repli WebGL 2 dans init(), rejette si aucun des deux n'est disponible ; antialias false par défaut ; ?webgl dans l'URL force WebGL",
   "source": "web/src/globe/renderer.ts:13-31 ; web/src/globe/GlobeView.tsx:76"
  },
  {
   "fait": "Échec de chargement : withRetry({ attempts: 3, delayMs: 800 }) sur les textures + /data/borders.json, puis un voile role=\"alert\" plein cadre (background '#16173a', color '#f7dc6f', sans-serif) « Le globe n’a pas pu se charger (réseau ?). » et un bouton non stylé « Réessayer » qui recrée le renderer",
   "source": "web/src/globe/GlobeView.tsx:108-113, 157-164 ; web/src/globe/retry.ts:1-13"
  },
  {
   "fait": "Perte du GPU : renderer.onDeviceLost = regenerate (dpr remis à [1, 2], generation + 1, nouveau Canvas) ; le contrôleur garde la partie ; onReady est rappelé quand le nouveau globe est prêt",
   "source": "web/src/globe/GlobeView.tsx:75, 100-101, 157-164"
  },
  {
   "fait": "e2e perte du GPU : même projection de la balise FRA à moins de 1 px et toujours vert après recréation",
   "source": "web/e2e/flight.spec.ts:47-58"
  },
  {
   "fait": "Aucun pays (patch absent) : la manche continue, la balise prend le relais (cœur blanc > 220)",
   "source": "web/e2e/flight.spec.ts:37-45 ; web/e2e/slow-patch.spec.ts:10-26"
  },
  {
   "fait": "Crochets de dev : window.__globe (backend, generation, frames, cloudOpacity, dpr(), frameMsOverride, project(lngLat), simulateDeviceLost()) en import.meta.env.DEV seulement ; window.__demo { arrived, done } posé par la démo",
   "source": "web/src/globe/GlobeView.tsx:32-46, 193-210 ; web/src/main.tsx:7, 30-46"
  },
  {
   "fait": "Page de démo actuelle : GlobeView + trois boutons (« Pays suivant », « Bonne réponse », « Mauvaise réponse ») et le nom du pays, en position absolute left 12, bottom 12 ; ?demo=FRA,JPN,FJI enchaîne prefetch → flyTo → showQuestion → 700 ms → answer('correct') → 600 ms",
   "source": "web/src/main.tsx:22-59"
  },
  {
   "fait": "Spec §5 : « Rotation : aucune pendant une question (seuls les nuages dérivent) ; rotation lente au repos sur l'écran d'accueil. Léger rapprochement pendant la révélation. prefers-reduced-motion : fondu + coupe. » ; §5 conservé : « 1500 ms de révélation »",
   "source": "docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md:157, 173"
  },
  {
   "fait": "Spec §6.3 : « Un seul canvas plein écran (ResizeObserver) ; couche React au-dessus » ; portrait : score et chrono en haut, réponses 2×2 en bas, zones sûres, 100dvh, cibles ≥ 48 px",
   "source": "docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md:191-192"
  },
  {
   "fait": "public/data/credits.json a pour clés naturalEarth, mledoze, wikidata, geoBoundaries, note (ni EOX ni NASA)",
   "source": "web/public/data/credits.json (lu par node)"
  }
 ],
 "contraintes_interface": [
  "Monter GlobeView UNE fois, pour toute la session, en fond plein écran (div absolute inset 0, Canvas mesuré par ResizeObserver) : le démonter recharge textures et renderer, et fait disparaître le crédit EOX.",
  "La couche React se pose en frère APRÈS GlobeView. Sans z-index, elle peint au-dessus de tout le globe, crédit compris : le HUD doit réserver le coin bas-droit (right 8 px, bottom 4 px + safe-area-inset-bottom, police 10 px, 111 caractères, maxWidth 100 % - 16 px), ou bien le crédit doit remonter dans la couche UI.",
  "Grille 2×2 en bas sur téléphone : elle ne doit pas recouvrir le crédit. Il faut maquetter la grille au-dessus du crédit (marge basse) ou déplacer le crédit (en haut, ou dans la barre), puis vérifier par elementFromPoint (exigé en 2A).",
  "Le pays visé est toujours cadré au CENTRE du canvas. Calcul : disque de 64,1 px de rayon pour FRA/JPN sur 390×844 (centre à y ≈ 422 px), 141,4 px sur 1440×900. Le HUD du haut et la grille du bas doivent laisser libre la bande centrale.",
  "Accueil sur téléphone en portrait : en vue d'ensemble (altitude 2,2), le disque terrestre fait 297,7 px de rayon, donc il déborde les 390 px de largeur. À prévoir dans la maquette, ou à changer (altitude d'accueil propre).",
  "Ordre d'une manche : prefetch(suivant), puis await flyTo(pays) (réponses masquées, chrono en pause), puis showQuestion() (vague de 600 ms), puis answer(kind), puis 1500 ms de révélation minutées par le jeu, puis flyTo(suivant). answer() n'a aucun effet sans showQuestion() préalable.",
  "Retour à l'accueil après une partie : appeler clear() ET overview() (overview seul laisse le pays allumé), puis setIdleSpin(v). Tout flyTo ou overview remet la rotation à 0, et la rotation ne démarre qu'à la fin du vol.",
  "Ne jamais lancer deux flyTo qui se chevauchent : la promesse du premier se résout quand le second le remplace, comme une arrivée.",
  "La pulsation rouge d'une mauvaise réponse ne s'arrête pas d'elle-même : clear() ou flyTo la terminent.",
  "Le jeu doit couper lui-même la rotation au repos sous prefers-reduced-motion (le globe ne le fait pas) et accepter que les vols y deviennent des coupes avec un voile noir de 250 ms.",
  "onReady peut être appelé plusieurs fois (après « Réessayer » et après une perte du GPU) : le traiter de façon idempotente. Pendant une recréation, le globe disparaît et les vols sont gelés.",
  "Textes du globe en français codé en dur (non compatible, échec de chargement, Réessayer, aria-label du crédit) : la 2A bilingue doit les sortir vers i18n ou les reprendre dans la couche UI. L'attribution EOX reste en anglais, mot pour mot.",
  "Écran « navigateur non compatible » : à styler, au fond #16173a et au texte #f7dc6f comme le voile d'erreur. Dans l'état actuel, le texte n'a aucune couleur sur un fond #000.",
  "Distinguer visuellement le jaune du pays (shader vec3(1.0, 0.933, 0.012), commenté #ffee03, rempli à 0.63) du jaune de l'interface #f7dc6f, ainsi que le vert et le rouge de révélation du shader des couleurs des boutons de réponse.",
  "Le globe n'a aucune interaction au pointeur (caméra verrouillée), mais le div enveloppe de R3F a pointerEvents 'auto' : la couche UI gère seule les clics et le toucher.",
  "Le chrono doit se mettre en pause onglet caché, comme le rendu (frameloop 'never'). Au retour, un vol en cours se termine d'un coup."
 ],
 "questions_ouvertes": [
  "Rotation lente de l'accueil : quelle vitesse (aucune constante dans config.ts ; le test unitaire utilise 6°/s) ? Arrêtée sous prefers-reduced-motion ?",
  "« Léger rapprochement pendant la révélation » (spec §5) : on le construit en 2A (nouvelle méthode du directeur, avec son amplitude et sa durée) ou on le reporte ?",
  "Crédit EOX : on le garde dans GlobeView en bas à droite et le HUD l'évite, ou on le déplace dans la couche UI (en haut, ou dans une barre propre) pour que la grille 2×2 garde le bas d'écran ?",
  "Préfixe « Data & Viewing Products: » : le spec §9 l'inclut, le code non. Lequel fait foi ?",
  "Altitude de l'accueil sur téléphone : on garde 2,2 (globe plus large que l'écran, 297,7 px de rayon sur 390 px de large) ou on prévoit une altitude d'accueil propre ?",
  "Décaler le centre de cadrage (centre utile entre le HUD du haut et la grille du bas) ou garder le pays au centre géométrique du canvas ?",
  "Pause du rendu pendant les écrans qui couvrent tout le globe (scores, crédits) : faut-il une méthode pause/reprise dans GlobeHandle ?",
  "Le 3-2-1 : en DOM au-dessus du globe en 2A, ou « dans la scène » comme le dit le spec §6.4 (donc en 2B) ?",
  "Messages d'erreur du globe (non compatible, échec de chargement) : GlobeView les garde, traduits, ou les remonte au parent (onError, onLost) pour que l'UI les dessine dans le style cartoon ?",
  "Faut-il un retour de chargement (écran d'attente avant onReady) en 2A, alors que l'intro qui sert d'écran de chargement est en 2B ?",
  "Le paramètre ?webgl (forcer WebGL) reste-t-il actif en production ?",
  "Que doit dire `<html lang=\"fr\">` en mode anglais (à mettre à jour par l'i18n) ?"
 ]
}

######## 1
{
 "resume": "Le cadrage centre toujours le pays sur le canvas entier et ne sait pas viser une sous-zone de l'écran. La caméra est placée en dir·(1+altitude) et regarde le centre de la Terre (globe.ts:151-160). Le Viewport ne porte que {width, height, fovYDeg} (framing.ts:1). Le code ne contient ni setViewOffset, ni inset, ni zone sûre ; la seule exception est le crédit EOX, posé en bas à droite au-dessus de safe-area-inset-bottom. Le viewport vient de la taille du canvas R3F, qui occupe tout l'écran (GlobeView.tsx:91, 129, 191).\n\nLa formule : α = min(demi-champ vertical 25°, atan(tan 25° · W/H)). Le plafond (vue d'ensemble) vaut 1,4 si W ≥ H, sinon 2,2. C'est la seule détection du portrait ou du paysage. L'altitude vaut k·(cos θ + sin θ / tan(α/m)) − 1, avec θ = max(θ_calotte, θ_min), bornée à [plancher ; vue d'ensemble]. Le réglage retenu est « B » : k 1, m 3, plancher 0,0003, θ_min 3°.\n\nCe que donnent les calculs en 390×844 portrait (formule appliquée à public/data/countries.json) :\n- α = 12,1598° et α/m = 4,0533°.\n- Pour un pays non plafonné, la calotte mesure toujours 128,3 px de diamètre : 15,2 % de la hauteur, 32,9 % de la largeur. C'est le cas de la France, du Japon, de l'Italie et de l'Égypte.\n- 92 pays sur 197 ont θ < 3°. Ils sont cadrés comme une calotte de 3° à l'altitude 0,7372, et le pays lui-même est plus petit : Luxembourg 16,3 px, Suisse 68,5 px.\n- Au-delà de θ = 9,0195°, 24 pays restent à l'altitude plafond 2,2 et occupent de 162,6 px (Norvège) à 440,7 px (Russie, 52,2 % de la hauteur). La calotte de la Russie dépasse les 390 px de large.\n- Ce même calcul compte 38 balises en portrait, contre 30 dans le 960×600 des e2e.\n\nPour centrer le pays dans la zone libre, il faut décaler l'axe optique de Δ = (hauteur du HUD bas − hauteur du HUD haut)/2 vers le haut. Trois voies, à confirmer par un essai :\n- **Projection décentrée** (setViewOffset). La formule reste exacte si l'on calcule α sur la zone libre. Mais le TRAA du niveau « haute » réécrit le décalage de vue à chaque image (TRAANode.js:301-331) : il faudrait passer par une sous-classe de caméra.\n- **Visée décalée** (lookAt d'un autre point que le centre de la Terre). La formule ne serait plus qu'approchée.\n- **Canvas réduit à la zone libre.** Cela contredit le spec §6.3.\n\nChanger m pour faire de la place au HUD obligerait à régénérer les patchs image : leur emprise dépend de m (patchImage.ts:12-14 ; imagery.test.ts:27-28).\n\nLa page calibrate.html accepte dans l'URL `country`, `k`, `margin`, `floor`, `ctx` et `nopanel`, plus `webgl` via GlobeView. Elle n'a ni HUD fantôme ni paramètre de zone libre.",
 "faits": [
  {
   "fait": "Champ vertical de la caméra : FOV_Y_DEG = 50",
   "source": "web/src/camera/config.ts:5"
  },
  {
   "fait": "Cadrage retenu (réglage « B », 02/10) : FRAMING = { k: 1, margin: 3, floor: 0.0003, overview: { landscape: 1.4, portrait: 2.2 }, minContextDeg: 3 }",
   "source": "web/src/camera/config.ts:12"
  },
  {
   "fait": "Vol : FLIGHT = { rho: Math.SQRT2, timeScale: 1, minMs: 1500, maxMs: 3500 }",
   "source": "web/src/camera/config.ts:15"
  },
  {
   "fait": "Demi-champ limitant : halfV = fovY/2 ; halfH = atan(tan(halfV) · width/height) ; α = min(halfV, halfH). Il est vertical en paysage et horizontal en portrait.",
   "source": "web/src/camera/framing.ts:19-23"
  },
  {
   "fait": "Portrait ou paysage n'est décidé que par width >= height, dans overviewAltitude : 1,4 si W ≥ H, sinon 2,2. Le code n'interroge ni l'orientation de l'appareil ni matchMedia.",
   "source": "web/src/camera/framing.ts:26-27"
  },
  {
   "fait": "frameAltitude : θ = max(capRadiusDeg, minContextDeg) ; altitude = k·(cos θ + sin θ / tan(α / margin)) − 1 ; résultat = min(overview, max(floor, altitude))",
   "source": "web/src/camera/framing.ts:30-35"
  },
  {
   "fait": "Le Viewport ne porte que { width, height, fovYDeg } : aucun champ d'inset, de décalage ou de zone sûre",
   "source": "web/src/camera/framing.ts:1"
  },
  {
   "fait": "Le viewport transmis au cadrage est la taille du canvas R3F : controller.setViewport({ width: size.width, height: size.height, fovYDeg: FOV_Y_DEG })",
   "source": "web/src/globe/GlobeView.tsx:191"
  },
  {
   "fait": "Le conteneur du canvas couvre tout l'écran (position absolute, inset 0)",
   "source": "web/src/globe/GlobeView.tsx:91"
  },
  {
   "fait": "La caméra est placée en dir·(1+altitude), avec camera.up = pose.up et camera.lookAt(0, 0, 0) : le point visé tombe au centre exact du canvas. near = max(altitude·0,2 ; 1e-5), far = d + 60, et updateProjectionMatrix est appelé à chaque image.",
   "source": "web/src/globe/globe.ts:151-160"
  },
  {
   "fait": "flyTo vise le centre de la calotte, à l'altitude frameAltitude(cap.radiusDeg, viewport courant, framing), nord en haut",
   "source": "web/src/camera/director.ts:65-69"
  },
  {
   "fait": "setViewport ne réagit qu'à un changement de width, height ou fovYDeg. Pendant un vol, le recadrage attend l'arrivée ; au repos, un vol court de 300 à 600 ms recadre aussitôt.",
   "source": "web/src/camera/director.ts:20-21,51-56,92-104"
  },
  {
   "fait": "Le directeur expose setViewport, setFraming, setIdleSpin, flyTo, flyToOverview et update. Le « léger rapprochement pendant la révélation » du spec §5 n'existe pas dans le code caméra.",
   "source": "web/src/camera/director.ts:51-128 ; docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md:173"
  },
  {
   "fait": "Une recherche dans web/src, web/scripts, web/e2e et les .html ne trouve ni setViewOffset, ni viewOffset, ni clearViewOffset. La seule zone sûre du code est le crédit EOX : right 8, bottom calc(4px + env(safe-area-inset-bottom, 0px)).",
   "source": "web/src/globe/credits.tsx:17"
  },
  {
   "fait": "Dans three 0.186.1, setViewOffset fixe aspect = fullWidth/fullHeight. updateProjectionMatrix décale ensuite le frustum : top -= offsetY·height/fullHeight. Un offsetY = Δ > 0 avec fullHeight = H remonte donc l'axe optique de Δ px à l'écran.",
   "source": "web/node_modules/three/src/cameras/PerspectiveCamera.js:304-331,362-371"
  },
  {
   "fait": "filmOffset ne décale le frustum qu'horizontalement (left += near·skew/filmWidth)",
   "source": "web/node_modules/three/src/cameras/PerspectiveCamera.js:374-375"
  },
  {
   "fait": "À chaque image, le TRAANode réécrit le décalage de vue de la caméra : il appelle setViewOffset avec offsetX/offsetY = 0 + jitter de Halton, et clearViewOffset après le pipeline. Il garde aussi la projection précédente pour la passe de vitesse. Un décalage posé par le jeu serait donc écrasé.",
   "source": "web/node_modules/three/examples/jsm/tsl/display/TRAANode.js:290-331,446-463"
  },
  {
   "fait": "Le TRAA n'est actif qu'au niveau « haute » (WebGPU sur bureau) ; le niveau « standard » (mobile) utilise du MSAA 4×",
   "source": "web/src/globe/postprocessing.ts:15,29"
  },
  {
   "fait": "R3F 9.8.1 : au redimensionnement, updateCamera fixe aspect = width/height et appelle updateProjectionMatrix (sauf camera.manual). Il ne touche pas à camera.view.",
   "source": "web/node_modules/@react-three/fiber/dist/events-9ce18a08.esm.js:523-536"
  },
  {
   "fait": "La balise est décidée par needsBeacon : altitude ≤ plancher, ou surface au centre de l'image < 400 px². La conversion km/px vaut 2·tan(fovY/2)·altitude·R/height.",
   "source": "web/src/globe/beacon.ts:10,14-22"
  },
  {
   "fait": "L'emprise d'un patch image vaut max(θ, θ_min)·m·viewFactor, plafonnée à 30°, avec viewFactor = 2.2. Un test exige que l'index ait été généré avec le margin et le minContextDeg de FRAMING : changer m impose `npm run imagery`.",
   "source": "web/scripts/imagery/lib/patchImage.ts:12-14 ; web/scripts/imagery/config.ts:19 ; web/scripts/imagery/__tests__/data/imagery.test.ts:27-28"
  },
  {
   "fait": "calibrate.html : paramètres d'URL k, margin, floor et ctx (θ_min) lus par framingFromUrl ; country (cca3) cadre ce pays une fois le globe prêt ; nopanel masque le panneau",
   "source": "web/src/calibrate/main.tsx:9-13,21,36-40,52"
  },
  {
   "fait": "Le paramètre d'URL webgl force le repli WebGL 2 sur toute page qui monte GlobeView, calibrate.html comprise",
   "source": "web/src/globe/GlobeView.tsx:76"
  },
  {
   "fait": "Curseurs de calibration : k de 0,8 à 2 (pas 0,01), margin de 1 à 3 (pas 0,05 ; la valeur retenue 3 est le maximum), floor de 0,0001 à 0,002, minContextDeg de 0 à 10 (pas 0,25)",
   "source": "web/src/calibrate/main.tsx:56-59"
  },
  {
   "fait": "Le panneau de calibration est en haut à gauche (top 8, left 8, maxWidth 360) et masque presque toute la largeur d'un téléphone de 390 px. L'altitude affichée est calculée sur innerWidth × innerHeight.",
   "source": "web/src/calibrate/main.tsx:29-31,52,60"
  },
  {
   "fait": "Pays de référence de la page de calibration : RUS, FRA, CHL, LUX, MLT, VAT, KIR, BRA, EGY, JPN, ITA, IDN",
   "source": "web/src/calibrate/main.tsx:16"
  },
  {
   "fait": "calibrate.html : meta viewport avec viewport-fit=cover ; html, body et #root à height 100dvh, overflow hidden",
   "source": "web/calibrate.html:5,7"
  },
  {
   "fait": "La page de sonde accepte cca3, mode=game, w, h, img, k, margin et ctx. Elle peut rendre le plan d'arrivée exact d'un pays en 390×844, à utiliser comme fond de maquette.",
   "source": "web/src/probe/main.ts:29-47"
  },
  {
   "fait": "Le contrôle e2e des 197 pays ne tourne qu'en paysage 960×600 : aucun contrôle en portrait",
   "source": "web/e2e/countries.spec.ts:9"
  },
  {
   "fait": "Test unitaire : sur un téléphone 390×844, α = atan(tan 25° × 390/844) = 12,1598°",
   "source": "web/src/camera/framing.test.ts:6,13-15"
  },
  {
   "fait": "Spec §6.3 : un seul canvas plein écran (ResizeObserver) avec la couche React au-dessus ; en portrait, score et chrono en haut, réponses en grille 2×2 en bas ; zones sûres, 100dvh, cibles ≥ 48 px",
   "source": "docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md:191-192"
  },
  {
   "fait": "Passation 2A : pendant le vol, chrono en pause et réponses masquées ; le crédit EOX ne doit jamais être recouvert par le HUD (credit.spec par elementFromPoint)",
   "source": "docs/HANDOFF.md:14-15"
  },
  {
   "fait": "Calcul en 390×844 au réglage B : α = 12,1598°, α/m = 4,0533°, tan(α/m)/tan 25° = 0,15196. Tout pays non plafonné a une calotte de 128,3 px de diamètre à l'arrivée, soit 15,2 % de la hauteur et 0,3290 de la largeur.",
   "source": "web/src/camera/framing.ts:30-35 appliqué à web/public/data/countries.json (calcul node)"
  },
  {
   "fait": "Arrivée en 390×844 : France θ 4,866°, altitude 1,1936, calotte 128,3 px (15,2 % H). Japon θ 8,838°, altitude 2,1563, 128,3 px. Italie θ 5,557°, altitude 1,3618, 128,3 px. Égypte θ 7,133°, altitude 1,7446, 128,3 px.",
   "source": "web/public/data/countries.json + web/src/camera/framing.ts:30-35 (calcul node)"
  },
  {
   "fait": "Petits pays en 390×844 (cadrés comme une calotte de 3°, altitude 0,7372) : Luxembourg θ 0,381°, 16,3 px (1,9 % H) ; Malte 8,5 px ; Kiribati θ 1,538°, 65,9 px (7,8 %) ; Suisse 68,5 px ; Belgique 56,1 px ; Vatican 0,2 px",
   "source": "web/public/data/countries.json + web/src/camera/framing.ts:30-35 (calcul node)"
  },
  {
   "fait": "Grands pays plafonnés à l'altitude 2,2 en 390×844 : Russie θ 35,521°, 440,7 px (52,2 % H, au-delà des 390 px de large) ; Indonésie 321,6 px (38,1 %) ; Chine 307,3 ; Canada 303,1 ; États-Unis 289,3 ; Brésil 284,1 (33,7 %) ; Chili 257,9 (30,6 %) ; Norvège 162,6 (19,3 %)",
   "source": "web/public/data/countries.json + web/src/camera/framing.ts:30-35 (calcul node)"
  },
  {
   "fait": "Répartition des 197 pays : 92 ont θ < 3° (θ_min s'applique) ; θ minimum 0,005° (Vatican), médiane 3,228°, maximum 35,521° (Russie)",
   "source": "web/public/data/countries.json (calcul node)"
  },
  {
   "fait": "Seuil du plafond : au-delà de θ = 9,0195° en 390×844, l'altitude reste à 2,2 (24 pays : ARG AUS BRA CAN CHL CHN COD DZA FSM IDN IND IRN KAZ MEX MMR MNG MOZ MYS NOR PER RUS SAU SDN USA). En 1300×750, le seuil est θ = 12,0217° (13 pays).",
   "source": "web/src/camera/framing.ts:26-35 appliqué à web/public/data/countries.json (calcul node)"
  },
  {
   "fait": "Balises (needsBeacon) : 38 pays en 390×844 contre 30 en 960×600. Les 8 de plus en portrait : BHS, BRN, CYP, GMB, LBN, PSE, SLB, TTO.",
   "source": "web/src/globe/beacon.ts:19-22 appliqué à web/public/data/countries.json (calcul node)"
  },
  {
   "fait": "Vue d'ensemble : en portrait 390×844 (altitude 2,2), le disque terrestre mesure 595,4 px, soit 152,7 % de la largeur ; en 1300×750 (altitude 1,4), il mesure 737,2 px, soit 98,3 % de la hauteur",
   "source": "web/src/camera/framing.ts:26-27 (calcul node)"
  },
  {
   "fait": "Bureau 1300×750 : α = 25°. Un pays non plafonné a une calotte de 235,6 px, soit 31,4 % de la hauteur.",
   "source": "web/src/camera/framing.ts:19-35 (calcul node)"
  },
  {
   "fait": "Hauteurs de HUD HYPOTHÉTIQUES (non décidées) en 390×844, haut/bas : 100/260 donne une zone libre de 484 px centrée à y = 342, à décaler de 80 px vers le haut ; 120/300 donne 424 px et 90 px ; 140/340 donne 364 px et 100 px. Dans ce dernier cas la zone est plus large que haute : α tomberait à 11,3710° et l'altitude de la France passerait de 1,1936 à 1,2769, si le viewport passé au cadrage était la zone libre.",
   "source": "web/src/camera/framing.ts:19-35 (calcul node, hypothèses de HUD)"
  }
 ],
 "contraintes_interface": [
  "Sans changement de code, le pays visé tombe au centre exact du canvas plein écran (y = 422 sur 844). Le HUD du haut et la grille 2×2 doivent laisser libre la bande [422 − r ; 422 + r]. Pour un pays courant, r = 64 px (calotte de 128,3 px, bande de 358 à 486 px). Pour les 24 grands pays plafonnés, r monte jusqu'à 160,8 px (Indonésie) et 220 px (Russie).",
  "La calotte est un majorant : le pays lui-même peut être plus petit. 92 pays sur 197 sont cadrés comme une calotte de 3° et occupent bien moins de 128 px (Luxembourg 16,3 px). Les 38 pays à balise sont montrés par un sprite de 56 px au pôle d'inaccessibilité, qui doit rester visible hors du HUD.",
  "Le crédit EOX (bas droite, au-dessus de safe-area-inset-bottom) ne doit jamais être recouvert. La grille 2×2 de réponses en bas doit donc lui laisser sa place, ou le crédit doit être déplacé avec son contrôle elementFromPoint.",
  "Pendant le vol, les réponses sont masquées. Si le centrage dépend du HUD visible, la zone libre change entre vol et question : il faut soit réserver la zone pendant toute la manche, soit animer le décalage. Un changement de viewport déclenche aujourd'hui un recadrage de 300 à 600 ms.",
  "Ne pas compter sur un changement de m pour libérer de la place : m pilote aussi l'emprise des patchs image. Tout changement de FRAMING.margin ou de minContextDeg impose de régénérer les patchs (`npm run imagery`) et casse le test imagery.",
  "Le centrage dans une sous-zone par camera.setViewOffset est incompatible tel quel avec le TRAA du niveau « haute », qui réécrit et efface le décalage de vue à chaque image. Il faut un mécanisme qui survive au TRAA ; filmOffset ne décale qu'en horizontal.",
  "Si le cadrage est calculé sur la zone libre, le demi-champ limitant reste horizontal en portrait tant que la zone libre est plus haute que large (390 px). En dessous, α baisse et overviewAltitude bascule à 1,4 (paysage) puisqu'il compare width et height : le plafond doit garder l'orientation du canvas.",
  "À l'accueil en portrait (altitude 2,2), le globe déborde la largeur (595,4 px pour 390). La maquette d'accueil doit faire avec un globe coupé sur les côtés et centré sur le canvas.",
  "En portrait, la calotte de la Russie (440,7 px) dépasse la largeur de 390 px même sans HUD.",
  "La mise en page doit tenir en 100dvh avec viewport-fit=cover, des zones sûres et des cibles ≥ 48 px (spec §6.3). Le canvas reste unique et plein écran sous la couche React.",
  "Le panneau de calibrate.html (top 8, left 8, maxWidth 360) recouvre presque tout un écran de 390 px. Pour juger le cadrage avec le HUD, il faut nopanel ou un HUD fantôme : la page n'en a pas aujourd'hui."
 ],
 "questions_ouvertes": [
  "Centrer le pays dans la zone libre entre les HUD (décalage d'environ (bas − haut)/2, soit 80 à 100 px avec des HUD hypothétiques), ou garder le centre du canvas ? La calotte standard de 128 px y tient déjà si les HUD ne dépassent pas y = 358 en haut et y = 486 en bas.",
  "Quel mécanisme de décalage ? Projection décentrée (exacte pour la formule, mais à protéger du TRAA, par exemple par une sous-classe de PerspectiveCamera dont updateProjectionMatrix ajoute le décalage) ; visée décalée (lookAt d'un point autre que le centre de la Terre, formule approchée) ; ou canvas limité à la zone libre (contredit le spec §6.3).",
  "Le cadrage (α, plafond) doit-il se calculer sur la zone libre ou sur le canvas entier ? Et le choix 1,4 ou 2,2 doit-il rester fondé sur l'orientation du canvas ?",
  "Pendant le vol (réponses masquées), réserve-t-on la même zone libre que pendant la question, pour éviter un recadrage, ou anime-t-on le décalage ?",
  "Quelles sont les hauteurs réelles, safe-area comprise, du bandeau score/chrono et de la grille 2×2 en portrait ? En paysage ou sur bureau, la grille va-t-elle en bas ou sur le côté (décalage horizontal) ?",
  "Les 24 grands pays plafonnés à 2,2 en portrait (Russie qui déborde la largeur, Indonésie 321,6 px) : accepter, relever le plafond en portrait, ou leur appliquer une autre marge ?",
  "Faut-il ajouter à calibrate.html un paramètre de zone libre (par exemple inset=haut,bas) et un HUD fantôme, pour calibrer avec la gêne réelle, et un contrôle e2e en portrait (aujourd'hui 960×600 seulement) ?",
  "Les 8 balises de plus en portrait (BHS, BRN, CYP, GMB, LBN, PSE, SLB, TTO) sont-elles acceptables ?",
  "Le « léger rapprochement pendant la révélation » du spec §5 n'est pas implémenté. Entre-t-il dans la 2A ? Il change la taille du pays sous le HUD pendant 1,5 s.",
  "Les maquettes doivent-elles utiliser de vrais rendus du globe ? La page de sonde rend le plan d'arrivée exact d'un pays en 390×844 (cca3, mode=game, w, h), ce qui suppose un serveur de dev, hors du périmètre de cette tâche en lecture seule."
 ]
}

######## 2
{
 "resume": "Périmètre : les tests e2e et ce qu'ils exigent de la page. J'ai tout lu en lecture seule (59 lignes de config, les 25 specs et helpers de web/e2e, plus e2e-budget/first-load.spec.ts, main.tsx, GlobeView.tsx, credits.tsx, probe/main.ts et calibrate/main.tsx). Aucune écriture, aucun test ni serveur lancé.\n\nTrois pages servent de cible :\n- probe.html (src/probe/main.ts), sans React et sans interface, avec le crochet window.__probe. C'est la cible de 17 fichiers : beacon, beacon-horizon, borders, clouds (4 tests sur 5), countries, country-edge, earth, image-patch, msaa-edge, patch, post, reveal, shader-uniformity, sun, visual, et les helpers probe-page/sdf-check. Elle sert aussi de sonde de démarrage au webServer.\n- calibrate.html : calibrate.spec, et rien d'autre.\n- index.html (la démo de main.tsx) : 10 specs e2e et la spec du budget.\n\nSur index.html, 8 specs dépendent de ce qui est propre à la démo :\n- le paramètre ?demo= : clouds « en jeu », flight, image-flight, reduced-motion, slow-patch ;\n- le crochet window.__demo : les mêmes, plus dynamic-resolution ;\n- le bouton « Pays suivant », qui sert de signal « globe prêt » : dynamic-resolution, load-failure, rerender.\nCela fait 18 tests, plus first-load (budget) qui tourne sur le build de production. HANDOFF.md:24 annonce « 4 specs » : c'est faux.\n\ncredit.spec et unsupported.spec n'utilisent que des éléments de GlobeView (le pied de page du crédit, le message « non compatible »). Leur place naturelle est la vraie page du jeu.\n\nIl n'y a aucun bloc projects dans la config : un seul projet Chromium. Le choix WebGPU ou WebGL 2 se fait par le paramètre &webgl. Les tailles d'écran sont fixées test par test :\n- téléphone : 360×640 et 390×844 ;\n- bureau : 800×450 et 960×600 ;\n- extrême : 480×300.\nAucun test n'émule le tactile. La langue par défaut de Playwright est en-US.\n\nIl y a 24 captures de référence, toutes en -darwin. Elles ne montrent que le globe, rendu par la sonde : 6 plans × 2 moteurs de rendu × 2 écrans (800×450 et 360×640). Elles peuvent servir de fond aux maquettes.\n\ncredit.spec vérifie quatre choses : le pied de page « Crédits de l'imagerie » est visible, le texte est mot pour mot, le lien a le bon href, et la boîte tient dans 390 px de large. Il ne vérifie pas que le crédit n'est pas recouvert : pour Playwright, « visible » veut seulement dire une boîte non vide et pas de visibility:hidden.\n\nDéplacer la démo vers demo.html :\n- changer 12 lignes goto (`/?…` devient `/demo.html?…`) ;\n- déplacer la déclaration de Window.__demo, que tsc vérifie aussi dans e2e ;\n- traiter le budget : le build ne contient que index.html et Vite répond 200 en text/html sur un fichier absent. Il faut donc soit ajouter demo.html aux entrées du build, soit mesurer le vrai parcours du jeu.\n\nSpecs que l'interface 2A appellera :\n- parcours complet du jeu, avec graine et durée réglables ;\n- credit.spec étendu par elementFromPoint, sur chaque écran et aux deux formats ;\n- i18n FR/EN (locale de Playwright, choix mémorisé, html lang) ;\n- clavier 1-4 et aria-live ;\n- pause du chrono pendant le vol, la révélation et quand l'onglet est caché ;\n- bouton Quitter ;\n- scores locaux et « Nouveau record ! » ;\n- cibles ≥ 48 px dans la grille 2×2 en 360×640 ;\n- rerender et dynamic-resolution « survit aux re-rendus » portés sur la page du jeu, où le chrono fait re-rendre l'appli chaque seconde ;\n- load-failure et unsupported sur la page du jeu ;\n- éventuellement des références visuelles de l'interface.",
 "faits": [
  {
   "fait": "Config Playwright : testDir 'e2e', timeout 180_000 en CI sinon 60_000, workers 2 en CI sinon 1, baseURL http://localhost:5174, webServer `npm run dev -- --port 5174 --strictPort` qui attend `http://localhost:5174/probe.html`, reuseExistingServer: !process.env.CI. Aucun bloc `projects`.",
   "source": "web/playwright.config.ts:11-22"
  },
  {
   "fait": "Options de lancement Chromium communes : ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-vulkan=swiftshader'].",
   "source": "web/playwright.config.ts:8"
  },
  {
   "fait": "Valeurs par défaut de Playwright, lues dans node_modules : browserName « Defaults to `'chromium'` », viewport « Defaults to an 1280x720 viewport », locale « Defaults to `en-US` » (agit sur navigator.language), hasTouch « Defaults to false », isMobile « Defaults to `false` », deviceScaleFactor « Defaults to `1` », reducedMotion « Defaults to `'no-preference'` ».",
   "source": "web/node_modules/playwright/types/test.d.ts:6959, 7752, 7577, 7475, 7538, 7398, 7658"
  },
  {
   "fait": "Pour Playwright, 'visible' = « non-empty bounding box and no `visibility:hidden` ». Le recouvrement par un autre élément n'est donc pas détecté par toBeVisible.",
   "source": "web/node_modules/playwright-core/types/types.d.ts:17282-17283"
  },
  {
   "fait": "Config du budget : testDir 'e2e-budget', baseURL http://localhost:5175, webServer `npm run build && npx vite preview --port 5175 --strictPort` (build de production), timeout 360_000 en CI sinon 120_000.",
   "source": "web/playwright.budget.config.ts:6-10"
  },
  {
   "fait": "first-load.spec : viewport 390×844, goto '/?demo=FRA&webgl', attend `window.__demo?.arrived.includes('FRA') === true` avec timeout: 0, puis networkidle. Budget FIRST_LOAD_BUDGET.standard = 8_000_000 octets (texte compté en gzip niveau 9).",
   "source": "web/e2e-budget/first-load.spec.ts:7, 28-31, 36"
  },
  {
   "fait": "Dernière mesure du budget : 6617449 ≤ 8000000 (suite complète après 71a302b : check 186/186, test:data 57/57, e2e 493 passed).",
   "source": "/Users/rusmirsadikovic/projetsperso/countriz/countrizz/.superpowers/sdd/2026-10-03-countrizz-phase1b-rendu/progress.md:53"
  },
  {
   "fait": "Mineur reporté : en CI, la branche « patch 404 compté par l'index » du budget est morte, parce que Vite répond 200 text/html à un fichier absent.",
   "source": ".superpowers/sdd/2026-10-03-countrizz-phase1b-rendu/progress.md:40"
  },
  {
   "fait": "Le build de production existant (web/dist) ne contient que assets, basis, data, index.html et textures : ni probe.html ni calibrate.html. vite.config.ts ne déclare aucune entrée multi-pages : `defineConfig({ plugins: [react()] })`.",
   "source": "ls web/dist (sortie de commande) ; web/vite.config.ts:4"
  },
  {
   "fait": "helper shoot() : setViewportSize (960×600 par défaut), goto `/probe.html?${query}&w=..&h=..` (+ '&webgl' pour webgl2), attend window.__probe, contrôle que __probe.backend vaut le backend demandé, capture le clip, et fournit `at()` via __probe.project.",
   "source": "web/e2e/probe-page.ts:9-24"
  },
  {
   "fait": "helper checkCountry() : goto `/probe.html?cca3=..&w=..&h=..` (+ &webgl, + query), attend window.__probe (30_000), puis compare une grille 32×32 et la balise au patch SDF PNG via __probe.project/unproject.",
   "source": "web/e2e/sdf-check.ts:23-51"
  },
  {
   "fait": "Specs sur probe.html via shoot() : beacon-horizon (`mode=game&at=2.35,30&alt=1.4` ± beacon), beacon (`mode=game&at=179.2,-8.5&alt=0.25&beacon=..`), borders (`&borders`, alt 1.4 et 0.02), clouds (4 tests `clouds=1`, alt 1.4 et 0.15), earth (Sahara, Pacifique, nuit `sun=`, halo), image-patch (`mode=game&cca3=FRA&img=2048` + route img), post (bloom `&post`, tier), reveal (`reveal=0|1`, `state=correct&t=2`, `state=wrong&t=0.125`), sun (`at=0,0&alt=4&sun=180,16.86`).",
   "source": "web/e2e/beacon-horizon.spec.ts:6-8 ; beacon.spec.ts:10,14 ; borders.spec.ts:21-24 ; clouds.spec.ts:13-14,24-25 ; earth.spec.ts:10-29 ; image-patch.spec.ts:18,31-33 ; post.spec.ts:38-39 ; reveal.spec.ts:8-11 ; sun.spec.ts:8,22"
  },
  {
   "fait": "Specs sur probe.html via checkCountry() : countries (197 pays × webgpu/webgl2 en 960×600) et patch (FRA, USA, RUS, FJI, KIR, VAT avec `k=1&margin=1.6&ctx=0` en 960×600 ; FRA et CHL en 390×844).",
   "source": "web/e2e/countries.spec.ts:9-21 ; web/e2e/patch.spec.ts:10-21"
  },
  {
   "fait": "Specs avec un goto direct sur probe.html : country-edge (LUX webgpu 800×450 ; SWZ webgl2 360×640 ; `state=correct&t=0`), msaa-edge (360×640, `cca3=FRA&post&tier=standard`), post (800×450, `&post&aa`), shader-uniformity (360×640, `cca3=JPN&state=correct&t=1&img&clouds=1&borders&beacon=137,38`, utilise __probe.fragmentShaders), visual (`&post&tier=..&w=..&h=..`).",
   "source": "web/e2e/country-edge.spec.ts:12-16 ; msaa-edge.spec.ts:16-17 ; post.spec.ts:15-16 ; shader-uniformity.spec.ts:11-15 ; visual.spec.ts:29"
  },
  {
   "fait": "probe.html ne monte que src/probe/main.ts, qui crée un canvas seul (aucune interface React). Paramètres documentés : cca3, at, alt, mode=game, tier=haute, sun, w, h, webgl, reveal, state, t, borders, beacon, k, margin, ctx, img, clouds, post, frames, aa. window.__probe expose backend, cca3, project, unproject, fragmentShaders.",
   "source": "web/probe.html:9 ; web/src/probe/main.ts:17-42, 48-49, 106-127"
  },
  {
   "fait": "calibrate.spec : goto '/calibrate.html?webgl' en 960×600, clic sur le bouton 'FRA' (timeout 120_000), textes /^France : θ = 4\\.866°, altitude = / et 'export const FRAMING: FramingParams = {k: 1, margin: 3, floor: 0.0003' ; puis '/calibrate.html?webgl&country=LUX&k=1&margin=3&ctx=3' → 'Luxembourg : θ = 0.381°, altitude = ${expected} rayon' et 'minContextDeg: 3'.",
   "source": "web/e2e/calibrate.spec.ts:4-17"
  },
  {
   "fait": "clouds.spec « en jeu » (index.html) : viewport 960×600, goto '/?demo=FRA&webgl', attend window.__globe.frames > 0, exige __globe.cloudOpacity > 0.99 pendant le vol, puis __demo.arrived inclut 'FRA', puis cloudOpacity === 0.",
   "source": "web/e2e/clouds.spec.ts:31-39"
  },
  {
   "fait": "credit.spec (index.html) : viewport 390×844, goto '/?webgl', getByRole('contentinfo', { name: 'Crédits de l’imagerie' }) visible (timeout 120_000), toContainText de 'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)', lien de nom 'https://cloudless.eox.at' avec href 'https://cloudless.eox.at', boundingBox x ≥ 0 et x + width ≤ 390. Aucun contrôle de recouvrement ni du bord bas.",
   "source": "web/e2e/credit.spec.ts:4-15"
  },
  {
   "fait": "Le crédit est un <footer role=\"contentinfo\" aria-label=\"Crédits de l’imagerie\"> en position absolue : right 8, bottom 'calc(4px + env(safe-area-inset-bottom, 0px))', maxWidth 'calc(100% - 16px)', police '10px/1.3 sans-serif', couleur rgba(255,255,255,0.7). Il est rendu dans GlobeView, donc sur toute page qui monte le globe.",
   "source": "web/src/globe/credits.tsx:13-24 ; web/src/globe/GlobeView.tsx:114"
  },
  {
   "fait": "Arbitrage de la revue 1B : « crédit EOX masqué sur téléphone » laissé en mineur, parce que ce sont les boutons PROVISOIRES de la démo. À EXIGER en phase 2 : crédit jamais recouvert par le HUD, et credit.spec qui le vérifie (elementFromPoint). Autres mineurs : licence CC BY-NC-SA 4.0 affichée nulle part, credits.json lu par personne (critère d'acceptation de la page Crédits).",
   "source": ".superpowers/sdd/2026-10-03-countrizz-phase1b-rendu/progress.md:33, 35"
  },
  {
   "fait": "Boutons de la démo : bloc en position absolue left 12, bottom 12, avec 'Pays suivant' (désactivé tant que !ready, choisit un pays au hasard), 'Bonne réponse', 'Mauvaise réponse' et le nom du pays en #f7dc6f.",
   "source": "web/src/main.tsx:52-57"
  },
  {
   "fait": "main.tsx déclare `interface Window { __demo?: { arrived: string[]; done: boolean } }`, sans garde DEV. __demo est créé une fois le globe prêt et les pays chargés. `?demo=A,B` enchaîne : flyTo, arrived.push, showQuestion, 700 ms, answer('correct'), 600 ms. Puis done = true.",
   "source": "web/src/main.tsx:7, 30-46, 22-28"
  },
  {
   "fait": "window.__globe (backend, generation, frames, cloudOpacity, dpr(), frameMsOverride, project, simulateDeviceLost) n'est posé qu'en développement : `if (!import.meta.env.DEV) return;`.",
   "source": "web/src/globe/GlobeView.tsx:33-46, 193-210"
  },
  {
   "fait": "GlobeView lit lui-même `?webgl` dans l'URL : `new URLSearchParams(location.search).has('webgl')`.",
   "source": "web/src/globe/GlobeView.tsx:76"
  },
  {
   "fait": "Textes en français écrits en dur dans GlobeView et testés : 'Ton navigateur ne peut pas afficher le globe : il faut WebGPU ou WebGL 2.' (unsupported.spec), 'Le globe n’a pas pu se charger (réseau ?).' et le bouton 'Réessayer' (load-failure.spec).",
   "source": "web/src/globe/GlobeView.tsx:59, 110-111 ; web/e2e/unsupported.spec.ts:8 ; web/e2e/load-failure.spec.ts:10,12"
  },
  {
   "fait": "dynamic-resolution.spec (index.html) : viewport 480×300 et deviceScaleFactor 1 ; ready() = goto `/${query}` ('?webgl' ou '') puis bouton 'Pays suivant' activé (120_000). Utilise __globe.dpr/frameMsOverride/frames. Le test « survit aux re-rendus » clique 'Pays suivant' et attend __demo.arrived.length === 1. Le test « onglet caché » redéfinit document.visibilityState et émet visibilitychange.",
   "source": "web/e2e/dynamic-resolution.spec.ts:5-11, 23-34, 44-60"
  },
  {
   "fait": "flight.spec (index.html, 960×600, webgpu et webgl2) : '/?demo=FRA,JPN,FJI' → __demo.done, arrived = ['FRA','JPN','FJI'], __globe.backend ; '/?demo=FRA' + route `**/data/patches/sdf/fra.png` en 404 → cœur blanc de la balise ; '/?demo=FRA' + __globe.simulateDeviceLost → generation === 1, projection identique à 1 px près, toujours vert.",
   "source": "web/e2e/flight.spec.ts:21-58"
  },
  {
   "fait": "image-flight.spec (index.html, 960×600) : route `**/data/patches/img/*.ktx2` vers la fixture quadrants.ktx2, goto `/?demo=FRA` (+&webgl), attend arrived FRA puis 800 ms. Fichiers demandés attendus : [`fra-2048.ktx2`] en webgpu, [`fra-1024.ktx2`] en webgl2.",
   "source": "web/e2e/image-flight.spec.ts:13-27"
  },
  {
   "fait": "load-failure.spec (index.html, 960×600) : route `**/textures/night-*.ktx2` en 503, goto '/?webgl', texte 'Le globe n’a pas pu se charger', clic 'Réessayer', puis bouton 'Pays suivant' activé et message disparu.",
   "source": "web/e2e/load-failure.spec.ts:3-14"
  },
  {
   "fait": "reduced-motion.spec (index.html) : viewport 960×600, reducedMotion 'reduce', goto '/?demo=FRA&webgl', arrived FRA, 1000 ms, luminance moyenne de la capture > 30.",
   "source": "web/e2e/reduced-motion.spec.ts:5-16"
  },
  {
   "fait": "rerender.spec (index.html, 960×600) : compte les requêtes `/textures/(day|night|surface)-`, goto '/?webgl', 'Pays suivant' activé, 3 clics espacés de 1500 ms : aucune nouvelle requête de texture. Second test : aucune erreur console contenant 'same key'.",
   "source": "web/e2e/rerender.spec.ts:3-30"
  },
  {
   "fait": "slow-patch.spec (index.html, 960×600) : route `**/data/patches/sdf/fra.png` retenue jusqu'à la capture, goto '/?demo=FRA&webgl', arrived FRA, 300 ms, pixel de la balise (via __globe.project) > 220 sur les trois canaux.",
   "source": "web/e2e/slow-patch.spec.ts:7-25"
  },
  {
   "fait": "unsupported.spec : launchOptions args ['--disable-webgl'] au niveau du fichier, goto '/', texte 'Ton navigateur ne peut pas afficher le globe' (timeout 30_000), sans viewport fixé.",
   "source": "web/e2e/unsupported.spec.ts:4-8"
  },
  {
   "fait": "visual.spec : 6 plans rendus par la sonde, sur 2 écrans (bureau 800×450, telephone 360×640) et 2 moteurs de rendu. Tier 'haute' seulement pour webgpu bureau. toHaveScreenshot(`${plan}-${backend}-${screen}.png`, { maxDiffPixels: 20, threshold: 0.1 }). Plans : accueil 'mode=game&at=10,20&alt=1.4&clouds=1', nuit 'mode=game&at=10,45&alt=1.4&sun=-170,-45', question 'mode=game&cca3=FRA', bonne-reponse 'mode=game&cca3=JPN&state=correct&t=1', micro-etat 'mode=game&cca3=VAT&beacon=12.4533,41.9029', lever-de-soleil 'mode=game&at=0,0&alt=4&sun=180,16.86'.",
   "source": "web/e2e/visual.spec.ts:11-35"
  },
  {
   "fait": "web/e2e/visual.spec.ts-snapshots contient 24 PNG, tous suffixés -darwin : {accueil, bonne-reponse, lever-de-soleil, micro-etat, nuit, question} × {webgl2, webgpu} × {bureau 800x450, telephone 360x640}. Ajoutés par f30fedf (2026-10-03).",
   "source": "ls + lecture IHDR (node) de web/e2e/visual.spec.ts-snapshots ; git log f30fedf"
  },
  {
   "fait": "Tier : 'haute' si webgpu ET pas de pointeur grossier ET maxTexture2D ≥ 8192, sinon 'standard'. GlobeView calcule coarsePointer par matchMedia('(pointer: coarse)').",
   "source": "web/src/renderer.ts n/a → web/src/globe/renderer.ts:9-11 ; web/src/globe/GlobeView.tsx:99"
  },
  {
   "fait": "index.html : `<html lang=\"fr\">` en dur, meta viewport 'width=device-width, initial-scale=1.0, viewport-fit=cover', style `html, body, #root { margin: 0; height: 100dvh; background: #000; overflow: hidden; }`, monte /src/main.tsx.",
   "source": "web/index.html:2, 5, 7, 11"
  },
  {
   "fait": "tsc couvre aussi les tests : include ['src', 'scripts', 'types', 'e2e', 'e2e-budget', …]. Les types Window.__demo, __globe et __probe des specs viennent des `declare global` de main.tsx, GlobeView.tsx et probe/main.ts.",
   "source": "web/tsconfig.json:16 ; web/src/main.tsx:7 ; web/src/globe/GlobeView.tsx:46 ; web/src/probe/main.ts:27"
  },
  {
   "fait": "Vitest 'unit' : environment 'node', include 'src/**/*.test.ts' (pas de .tsx). Ni jsdom ni testing-library dans les devDependencies. Les écrans React ne se testent donc qu'en Playwright, ou par leur logique TS pure.",
   "source": "web/vitest.config.ts:7-10 ; web/package.json:34-60"
  },
  {
   "fait": "Aucun data-testid ni getByTestId dans e2e/ : les sélecteurs sont des rôles et noms accessibles (button 'Pays suivant', 'Réessayer', 'FRA' ; contentinfo 'Crédits de l’imagerie' ; link) et des textes.",
   "source": "web/e2e/*.spec.ts (lus en entier) ; recensement node getByRole/getByText"
  },
  {
   "fait": "public/ contient basis, data et textures ; data/flags contient des SVG (afg.svg, ago.svg, alb.svg…). Pas de dossier public/fonts : la police Chango n'est pas encore dans le dépôt.",
   "source": "ls web/public web/public/data web/public/data/flags web/public/fonts"
  },
  {
   "fait": "Décision 2A : « démo déplacée dans `demo.html` (les e2e qui la pilotent suivent) ; aucun nouveau paquet ». À exiger en 2A : « crédit EOX jamais recouvert par le HUD (+ `credit.spec` qui le vérifie par `elementFromPoint`) ».",
   "source": "docs/HANDOFF.md:13, 15"
  },
  {
   "fait": "HANDOFF annonce « page de démo à déplacer (4 specs e2e en dépendent) ». Décompte réel : 8 specs dépendent du propre de la démo (clouds, dynamic-resolution, flight, image-flight, load-failure, reduced-motion, rerender, slow-patch), plus first-load (budget). credit et unsupported chargent aussi '/'.",
   "source": "docs/HANDOFF.md:24 ; recensement node des goto/hooks/sélecteurs de web/e2e et web/e2e-budget"
  },
  {
   "fait": "Lignes goto à réécrire si la démo passe dans demo.html : clouds.spec.ts:34, dynamic-resolution.spec.ts:9, flight.spec.ts:28, 39, 48, image-flight.spec.ts:24, load-failure.spec.ts:9, reduced-motion.spec.ts:8, rerender.spec.ts:9, 27, slow-patch.spec.ts:16, e2e-budget/first-load.spec.ts:29 (12 lignes).",
   "source": "recensement node goto (sortie de commande)"
  },
  {
   "fait": "Suite complète du Mac, CI de référence : `npm run check && npm run test:data && npm run e2e && npm run budget`. GitHub ne lance que `npm run check`.",
   "source": "docs/HANDOFF.md:22 ; .github/workflows/web-ci.yml:24"
  },
  {
   "fait": "Spec §6.3 : réponses en grille 2×2 en bas, à portée de pouce ; zones sûres, 100dvh, cibles ≥ 48 px ; aucun effet au survol ; clavier 1–4 ; aria-live. Crédit EOX affiché dans la vue du globe.",
   "source": "docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md:192-194"
  }
 ],
 "contraintes_interface": [
  "Le crédit EOX, déjà rendu en bas à droite par GlobeView (right 8, bas = 4 px + safe-area), n'est jamais recouvert, sur aucun écran (accueil, mode, 3-2-1, vol, question, révélation, fin, scores) ni à aucun format (360×640, 390×844, 800×450, 960×600). Les maquettes réservent une bande sous ou au-dessus de la grille 2×2 du bas. Le nouveau credit.spec le contrôlera par elementFromPoint, en exigeant que l'élément touché soit le crédit lui-même ou l'un de ses descendants.",
  "Le crédit garde role=contentinfo, son nom accessible 'Crédits de l’imagerie' (ou credit.spec est modifié en même temps), le texte d'attribution mot pour mot en anglais (jamais traduit), le lien href 'https://cloudless.eox.at', et tient dans 390 px de large.",
  "La page du jeu continue d'honorer ?webgl, que GlobeView lit dans location.search : un routage ou un nettoyage d'URL ne doit pas le perdre. Le paramètre ?demo= n'a plus de sens sur la page du jeu.",
  "GlobeView reste monté sans interruption de l'accueil aux scores. La clé du Canvas ne dépend que de la génération du renderer. Les re-rendus d'App (chrono à chaque seconde, changement de manche) ne rechargent aucune texture globale et ne réinitialisent pas la densité de pixels : ce sont les garanties de rerender.spec et de dynamic-resolution « survit aux re-rendus », à porter sur la page du jeu.",
  "Le jeu expose un signal DOM de « globe prêt », par exemple un bouton 'Jouer' activé seulement après onReady. Il joue le rôle de 'Pays suivant' pour les équivalents de load-failure, rerender et dynamic-resolution. Après « Réessayer », ce signal revient.",
  "Les boutons ont un rôle et un nom accessible stables (la suite actuelle n'utilise que getByRole/getByText, aucun data-testid). Les réponses 2×2 sont des <button> joignables aussi par les touches 1-4.",
  "Playwright tourne en locale en-US par défaut. Si l'interface suit la langue du navigateur, les tests qui cherchent des textes français ('Crédits de l’imagerie', 'Le globe n’a pas pu se charger', 'Réessayer', 'Ton navigateur ne peut pas afficher le globe', 'Pays suivant') verraient de l'anglais. Il faut fixer locale 'fr-FR' (dans la config ou par spec) ou laisser ces chaînes hors de l'i18n.",
  "document.documentElement.lang suit la langue choisie (index.html écrit aujourd'hui lang=\"fr\" en dur).",
  "Mobile d'abord, sur la plus petite surface testée : 360×640 en densité 1, safe-area (viewport-fit=cover déjà présent), 100dvh, cibles ≥ 48 px, aucun effet au survol. Le format paysage extrême 480×300 (dynamic-resolution.spec) ne doit pas casser la mise en page.",
  "En build de production, window.__globe n'existe pas (posé seulement en DEV). Tout signal dont le budget a besoin doit être un état du DOM ou un crochet non soumis à DEV.",
  "La police Chango (absente de public/) et les drapeaux SVG chargés avant l'arrivée sur le premier pays comptent dans le budget de 8 000 000 octets. Marge à la dernière mesure : 8 000 000 − 6 617 449 = 1 382 551 octets.",
  "probe.html reste en place, sans interface : c'est l'URL de démarrage du webServer de Playwright et la cible de 17 fichiers, dont les 24 références visuelles. L'interface 2A ne doit pas s'y monter.",
  "La déclaration `Window.__demo` suit la démo dans son nouveau fichier sous src/ : tsc vérifie aussi e2e et e2e-budget."
 ],
 "questions_ouvertes": [
  "demo.html reste-t-il une page de développement hors build (comme probe.html et calibrate.html, absents de dist) ? Ou entre-t-il dans le build via des entrées multi-pages, au prix d'une démo publiée en production ?",
  "Budget du premier chargement : faut-il garder la mesure sur la démo (ce qui oblige à mettre demo.html dans le build), ou mesurer le vrai parcours du jeu (accueil, Jouer, mode, 3-2-1, arrivée sur le premier pays), qui suppose un signal DOM de production et un pays imposé ? Et le seuil de 8 000 000 octets est-il gardé ?",
  "Quels specs restent sur la démo et lesquels passent sur la page du jeu ? Proposition : flight, image-flight, slow-patch, reduced-motion et clouds « en jeu » sur demo.html ; credit, unsupported, load-failure, rerender et dynamic-resolution « survit aux re-rendus » sur la page du jeu, voire sur les deux.",
  "Les messages de GlobeView (« non compatible », « n’a pas pu se charger », « Réessayer ») et le nom accessible du crédit deviennent-ils bilingues ? Si oui, fixe-t-on locale 'fr-FR' dans playwright.config, ou ajoute-t-on un projet 'en' qui rejoue les specs d'interface en anglais ?",
  "Quels crochets de test pour le jeu : un paramètre ?seed= pour le tirage, une durée raccourcie ou une horloge pilotable (60 s nettes, trop longues avec SwiftShader et ses vols d'environ 1 min en WebGL 2 sur CI), un window.__game réservé au DEV qui expose l'état et la bonne réponse ? Ou bien les tests lisent-ils la bonne réponse dans le DOM ?",
  "Faut-il des références visuelles de l'interface : nouvelles captures -darwin des écrans, avec le canvas masqué (option mask de toHaveScreenshot) ou en composite complet, en 360×640 et 800×450 comme les plans du globe ?",
  "Faut-il un projet Playwright « téléphone tactile » (hasTouch/isMobile) ? Attention : un pointeur grossier fait passer le niveau en 'standard' même en WebGPU, ce qui change le rendu par rapport aux tests actuels.",
  "Critère exact du credit.spec elementFromPoint : combien de points (coins, centre, chaque ligne du texte qui passe sur plusieurs lignes à 360 px), quels écrans, et compte-t-on le voile de coupe du mouvement réduit (un div plein écran en pointer-events:none, posé après le crédit) ?",
  "Le crédit doit-il rester visible sur les écrans sans globe visible (scores, page Crédits), ou seulement « dans la vue du globe » comme dit le spec §6.3 et §9 ?",
  "Corriger HANDOFF.md:24, qui annonce « 4 specs » alors que 8 specs plus le budget dépendent de la démo ?"
 ]
}

######## 3
{
 "resume": "Ce que l'interface de la 2A peut afficher aujourd'hui (lecture seule, rien n'a été modifié).\n\nDONNÉES PAYS : web/public/data/countries.json contient 197 enregistrements qui ont tous les mêmes 16 clés. Seuls le nom (`name`) et la capitale de jeu (`capital`) sont en français. `region` et `subregion` sont des libellés anglais de mledoze (5 régions, 24 sous-régions) : il faudra les traduire s'ils sont affichés. Le contrat `CountryRecord` n'a aucun champ anglais.\n\nLONGUEURS FR, qui dimensionnent la grille 2×2 :\n- Noms : médiane 8 caractères, p95 18, maximum 31 (« Saint-Vincent-et-les-Grenadines »). 6 noms font 20 caractères ou plus.\n- Capitales : médiane 7, p95 12, maximum 19 (« Bandar Seri Begawan » et « Sri Jayawardenapura »).\n- Le plus long segment qu'on ne peut pas couper (coupure aux espaces et aux traits d'union) fait 14 caractères pour un nom (« centrafricaine ») et 15 pour une capitale (« Jayawardenapura »).\n- Deux noms contiennent des parenthèses : « Congo (Rép. dém.) » et « Palaos (Palau) ».\n\nLONGUEURS EN (cache mledoze, déjà sur le disque) : maximum 32 caractères pour un nom (« Saint Vincent and the Grenadines ») et 19 pour une capitale.\n\nCAPITALES EN : quatre pays ont, en anglais, une AUTRE ville que la capitale de jeu FR :\n- LKA : Colombo (FR : Sri Jayawardenapura) ;\n- PSE : Ramallah (FR : Jérusalem-Est) ;\n- SWZ : Lobamba (FR : Mbabane) ;\n- GNQ : Malabo (FR : Ciudad de la Paz). GNQ n'est pas dans les arbitrages d'`overrides.json` : il faut demander à l'utilisateur.\n\nAu total, 57 capitales s'écrivent différemment en FR et en EN (par exemple Kiev / Kyiv).\n\nGLYPHES : la police devra couvrir ș, ă (Chișinău) et ʻ U+02BB (Nukuʻalofa), en plus des accents latins courants.\n\nDRAPEAUX : 197 SVG de mledoze (3 626 847 octets au total ; le Mexique pèse 345 548 octets). Leurs proportions vont de 0,8203 (Népal) à 2,5455 (Qatar), avec 26 rapports distincts ; 3:2 (86) et 2:1 (55) dominent. Deux pièges :\n- qat.svg a un viewBox en 75×18 mais un `preserveAspectRatio=\"none\"` en 1400×550 ;\n- afg.svg n'a pas de viewBox.\n\nLa licence des drapeaux n'est indiquée nulle part.\n\nPOLICE : aucun fichier de police dans le dépôt, aucun paquet de police, rien dans index.html. L'ancien code chargeait Chango (et Poppins 900i) depuis Google Fonts. La licence de Chango est absente.\n\nCRÉDITS : data/credits.json existe (Natural Earth, mledoze, Wikidata sans licence, et 66 pays geoBoundaries sous 9 licences distinctes). textures/credits.json a 5 couches. imagery.json porte la licence CC BY-NC-SA 4.0 et l'attribution EOX. Le crédit EOX actuel est en 10px sans-serif, en bas à droite. Plusieurs textes français sont codés en dur dans GlobeView et credits.tsx.",
 "faits": [
  {
   "fait": "CountryRecord a 16 champs : id, cca3, cca2, name, capital, capitals, region, subregion, neighbors, areaKm2, cap, beacon, beaconClearanceKm, flag, outlineSource, patch. Aucun champ en anglais (pas de nameEn ni de capitalEn).",
   "source": "web/src/data/types.ts:46-65"
  },
  {
   "fait": "parseCountries exige exactement PLAYABLE_COUNT = 197 pays et vérifie cca3 (unique), patch.sdf, cap et beacon. Il ne vérifie ni name, ni capital, ni flag.",
   "source": "web/src/data/countries.ts:3,8,11-14"
  },
  {
   "fait": "loadCountries récupère `${baseUrl}data/countries.json` (baseUrl par défaut '/').",
   "source": "web/src/data/countries.ts:19-22"
  },
  {
   "fait": "countries.json : un tableau de 197 enregistrements, avec un seul jeu de clés (16) commun à tous ; fichier indenté de 8287 lignes.",
   "source": "web/public/data/countries.json:1"
  },
  {
   "fait": "name vient de mledoze : `c.translations.fra?.common ?? c.name.common`. region et subregion sont recopiés tels quels de mledoze (en anglais).",
   "source": "web/scripts/geodata/build.ts:100,103-104"
  },
  {
   "fait": "Exemple FRA : name \"France\", capital \"Paris\", capitals [\"Paris\"], region \"Europe\", subregion \"Western Europe\", flag \"flags/fra.svg\", areaKm2 635743.97, beaconClearanceKm 288.676, outlineSource \"naturalearth\".",
   "source": "web/public/data/countries.json:2459-2469,2493"
  },
  {
   "fait": "Exemple VAT : name \"Cité du Vatican\", capital \"Vatican\", neighbors [\"ITA\"], areaKm2 0.51, beaconClearanceKm 0.323, patch.extentRad 0.00034906585039886593, outlineSource \"geoboundaries\".",
   "source": "web/public/data/countries.json:7872-7876"
  },
  {
   "fait": "Exemple KIR : name \"Kiribati\", capital \"Tarawa-Sud\", region \"Oceania\", subregion \"Micronesia\", neighbors [], beaconClearanceKm 7.375.",
   "source": "web/public/data/countries.json:3856-3860"
  },
  {
   "fait": "Valeurs distinctes de region : ['Asia','Africa','Europe','Americas','Oceania']. subregion a 24 valeurs anglaises (ex. 'Western Europe', 'South-Eastern Asia', 'Australia and New Zealand'). Mesuré avec node -e sur countries.json.",
   "source": "web/public/data/countries.json:2468-2469"
  },
  {
   "fait": "Les 10 noms FR les plus longs, en caractères : 31 VCT \"Saint-Vincent-et-les-Grenadines\" ; 26 KNA \"Saint-Christophe-et-Niévès\" ; 25 CAF \"République centrafricaine\" ; 25 PNG \"Papouasie-Nouvelle-Guinée\" ; 22 DOM \"République dominicaine\" ; 20 STP \"São Tomé et Príncipe\" ; 19 ARE \"Émirats arabes unis\" ; 18 ATG \"Antigua-et-Barbuda\" ; 18 BIH \"Bosnie-Herzégovine\" ; 18 GNQ \"Guinée équatoriale\".",
   "source": "web/public/data/countries.json:7914,3896,1190,5840,2043,6741,178,2841"
  },
  {
   "fait": "Statistiques des noms FR : min 4, p50 8, p90 14, p95 18, max 31, moyenne 8.71. 6 noms font 20 caractères ou plus, 17 en font 15 ou plus.",
   "source": "web/public/data/countries.json (node -e sur le champ name des 197)"
  },
  {
   "fait": "Les 10 capitales FR les plus longues : 19 BRN \"Bandar Seri Begawan\" ; 19 LKA \"Sri Jayawardenapura\" ; 18 AND \"Andorre-la-Vieille\" ; 16 GNQ \"Ciudad de la Paz\" ; 14 DOM \"Saint-Domingue\" ; 14 HTI \"Port-au-Prince\" ; 14 TTO \"Port-d'Espagne\" ; 13 GRD \"Saint-Georges\" ; 13 PSE \"Jérusalem-Est\" ; 12 ARG \"Buenos Aires\".",
   "source": "web/public/data/countries.json:1067,4267,138,2842,2044,3135,3367,6051"
  },
  {
   "fait": "Statistiques des capitales FR : min 4, p50 7, p90 11, p95 12, max 19, moyenne 7.75. 4 capitales font 15 caractères ou plus, 16 en font 12 ou plus.",
   "source": "web/public/data/countries.json (node -e sur le champ capital)"
  },
  {
   "fait": "Plus long segment qu'on ne peut pas couper (coupure aux espaces ET aux traits d'union) : noms FR 14 « centrafricaine » (CAF), 13 « Liechtenstein », 12 « Kirghizistan » et « Turkménistan » ; capitales FR 15 « Jayawardenapura » (LKA), 12 « Yamoussoukro » et « Antananarivo ». Si on ne coupe qu'aux espaces, VCT forme un seul mot de 31 caractères. Un nom FR compte au plus 5 mots.",
   "source": "web/public/data/countries.json (node -e)"
  },
  {
   "fait": "Noms FR avec parenthèses ou abréviation : COD \"Congo (Rép. dém.)\" et PLW \"Palaos (Palau)\". COG s'appelle simplement \"Congo\".",
   "source": "web/public/data/countries.json:1503,5802,1551"
  },
  {
   "fait": "9 pays ont plusieurs capitales dans capitals[] : BEN, BOL, LKA, MYS, PAK, PSE, SWZ, YEM, ZAF (ZAF en a 3 : Bloemfontein, Le Cap, Pretoria). Pour 6 d'entre eux (BEN, BOL, LKA, SWZ, YEM, ZAF), capital n'est pas capitals[0].",
   "source": "web/public/data/countries.json:556-560,8152-8156"
  },
  {
   "fait": "Arbitrages des capitales de jeu (FR) : BEN Porto-Novo, BOL Sucre, LKA Sri Jayawardenapura, MYS Kuala Lumpur, PAK Islamabad, PSE Jérusalem-Est, SWZ Mbabane, YEM Sanaa, ZAF Pretoria. Aucune version EN n'existe encore.",
   "source": "web/scripts/geodata/overrides.json:12-22"
  },
  {
   "fait": "Caractères hors ASCII des libellés FR : É é ' ï ô ( . ) Î è ë ș(U+0219) ă(U+0103) ã í ʻ(U+02BB) ê. En EN : ' - í é á . ș ă ó ã ü. ș et ă viennent de « Chișinău », ʻ de « Nukuʻalofa ».",
   "source": "web/scripts/geodata/data-src/capitals.fr.json:331,532"
  },
  {
   "fait": "web/public/data/flags contient 197 fichiers, tous en .svg, nommés `flags/<cca3 en minuscules>.svg` (même forme pour les 197 champs flag). Total 3626847 octets (du : 4,0M) ; min 175 (fra.svg), médiane 764, max 345548 (mex.svg). Les plus lourds : mex 345548, ecu 279168, smr 270808, srb 270594, dom 251500, esp 235175 ; vat.svg pèse 167173.",
   "source": "web/public/data/flags/ (ls, node -e statSync)"
  },
  {
   "fait": "Proportions des drapeaux (largeur/hauteur, prises sur width/height s'ils sont présents, sinon sur le viewBox) : 26 rapports distincts. 1.500×86, 2.000×55, 1.667×17, 1.600×6, 1.333×4, 1.900×4, puis des rapports à 1 ou 2 drapeaux. Plus étroits : npl 0.8203, che 1, vat 1, bel 1.1538, ner 1.1667. Plus larges : qat 2.5455, puis tuv, uzb, wsm, zwe à 2.",
   "source": "web/public/data/flags/*.svg (node -e sur la balise <svg>)"
  },
  {
   "fait": "npl.svg : viewBox \"-17.582 -4.664 71.571 87.246\", width 726, height 885 (rapport 0.8203, plus haut que large).",
   "source": "web/public/data/flags/npl.svg:3"
  },
  {
   "fait": "che.svg : viewBox \"0 0 32 32\", width 1000, height 1000 (carré).",
   "source": "web/public/data/flags/che.svg:1"
  },
  {
   "fait": "vat.svg : viewBox \"0 0 2500 2500\", width 500, height 500 (carré) ; fichier de 2132 lignes.",
   "source": "web/public/data/flags/vat.svg:13"
  },
  {
   "fait": "qat.svg : viewBox \"0 0 75 18\" (rapport 4.1667) mais width 1400, height 550 et preserveAspectRatio=\"none\". Affiché comme image, le drapeau prend donc le rapport 2.5455. C'est le seul drapeau dont le viewBox contredit width/height.",
   "source": "web/public/data/flags/qat.svg:2"
  },
  {
   "fait": "fra.svg : viewBox \"0 0 3 2\", sans width ni height (175 octets).",
   "source": "web/public/data/flags/fra.svg:1"
  },
  {
   "fait": "afg.svg n'a PAS de viewBox, seulement width=\"1000\" et height=\"500\". C'est le seul dans ce cas.",
   "source": "web/public/data/flags/afg.svg:1"
  },
  {
   "fait": "Les drapeaux sont téléchargés depuis mledoze @ c2ac0049c14edcf2436c7aa1b2493222a020b462 (data/<cca3>.svg), puis copiés par le pipeline dans public/data/flags.",
   "source": "web/scripts/geodata/config.ts:2,8-9 ; web/scripts/geodata/build.ts:93-94"
  },
  {
   "fait": "La licence des drapeaux SVG de mledoze et celle de Wikidata sont encore « à confirmer ».",
   "source": "docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md:267 ; docs/HANDOFF.md:92"
  },
  {
   "fait": "Aucun fichier de police dans le dépôt : find (woff, woff2, ttf, otf, *chango*, OFL*) hors node_modules et .git ne renvoie rien. Aucune dépendance de police dans package.json. index.html ne charge aucune police.",
   "source": "web/package.json:27-61 ; web/index.html:7"
  },
  {
   "fait": "L'ancienne interface chargeait Chango par Google Fonts (`@import url(\"https://fonts.googleapis.com/css2?family=Chango&display=swap\")`), et aussi Poppins 900i pour les boutons.",
   "source": "2d62fc2:frontend/src/App.css:1 ; 2d62fc2:frontend/src/assets/css/ButtonPlay.css:1"
  },
  {
   "fait": "Styles de l'ancienne interface : fond #16173a, texte #f7dc6f (variables :root), bouton .cta en Chango 30px, blanc sur #6225e6, box-shadow 6px 6px 0 black, skewX(-15deg), effets au survol. Le titre de mode était à 55px et tombait à 20px sous 390px de large.",
   "source": "2d62fc2:frontend/src/App.css:3-6 ; 2d62fc2:frontend/src/assets/css/ButtonPlay.css:8-19,27-30 ; 2d62fc2:frontend/src/assets/css/Modejeu.css:1-11,26-33"
  },
  {
   "fait": "Les constantes reprises par le spec : police Chango, fond #16173a, texte #f7dc6f, boutons #6225e6 en skewX(-15deg) avec ombre 6px 6px 0 black, titres en text-shadow 5px 2px 1px black. Portrait d'abord, réponses en 2×2 en bas, cibles d'au moins 48 px, rien qui dépende du survol, clavier 1–4, aria-live.",
   "source": "docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md:190-194"
  },
  {
   "fait": "web/public/data/credits.json existe (412 lignes) : naturalEarth (domaine public), mledoze (ODbL 1.0), wikidata (URL seule, sans licence), et geoBoundaries (66 entrées, une par pays dont le contour vient de geoBoundaries). Note finale : « countries.json et les contours dérivés sont publiés sous ODbL 1.0. »",
   "source": "web/public/data/credits.json:2-12,13-410,411"
  },
  {
   "fait": "Les 66 entrées geoBoundaries relèvent de 9 licences : ODbL 1.0 ×35, Public Domain ×14, CC BY 2.5 ×4, CC BY 4.0 ×4 (et ×4 sous le libellé « International »), CC BY-SA 2.0 ×2 (SLV, UNK), CC BY 3.0 ×1 (BTN), CC BY 3.0 IGO ×1 (FSM), CC0 ×1 (NLD). La note « tout sous ODbL » est donc fausse pour SLV et UNK.",
   "source": "web/public/data/credits.json:315-318,380-384 ; docs/HANDOFF.md:92"
  },
  {
   "fait": "credits.json est réécrit à chaque génération par le pipeline, avec un contenu fixe et les entrées geoBoundaries.",
   "source": "web/scripts/geodata/build.ts:126-132"
  },
  {
   "fait": "web/public/textures/credits.json : 5 couches (jour, nuit, relief, océans, nuages), chacune avec son texte d'attribution (EOxCloudless CC BY-NC-SA 4.0 + Blue Marble ; Black Marble 2016 ; GEBCO/NASA ; Natural Earth ; Blue Marble Clouds).",
   "source": "web/public/textures/credits.json:2-21"
  },
  {
   "fait": "imagery.json : layer \"s2cloudless-2025\", year 2025, license \"CC BY-NC-SA 4.0\", attribution \"EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)\", sizes [2048, 1024]. 197 pays, chacun avec ses deux tailles. Total 43005008 octets en 1024 et 140335406 octets en 2048.",
   "source": "web/public/data/imagery.json:2-13"
  },
  {
   "fait": "Les patchs image (394 .ktx2 sur disque, en 1024 et 2048) sont ignorés par git. Les 197 patchs SDF PNG sont versionnés.",
   "source": ".gitignore:7 ; git ls-files web/public/data/patches"
  },
  {
   "fait": "Le crédit EOX actuel (ImageryCredit) est positionné en absolu à right 8 et bottom calc(4px + env(safe-area-inset-bottom)), en 10px/1.3 sans-serif, couleur rgba(255,255,255,0.7), avec un lien. Son aria-label est en français codé en dur : « Crédits de l’imagerie ».",
   "source": "web/src/globe/credits.tsx:13-24"
  },
  {
   "fait": "Textes français codés en dur dans GlobeView : « Ton navigateur ne peut pas afficher le globe : il faut WebGPU ou WebGL 2. », « Le globe n’a pas pu se charger (réseau ?). » et « Réessayer ». L'écran d'erreur utilise #f7dc6f sur #16173a.",
   "source": "web/src/globe/GlobeView.tsx:59,109-111"
  },
  {
   "fait": "API GlobeHandle disponible pour l'interface : flyTo(rec): Promise<void>, prefetch(rec), showQuestion(), answer('correct'|'wrong'), clear(), overview(): Promise<void>, setIdleSpin(degPerSec).",
   "source": "web/src/globe/GlobeView.tsx:22-30"
  },
  {
   "fait": "index.html : lang=\"fr\", viewport avec viewport-fit=cover, html/body/#root en 100dvh, fond #000, overflow hidden.",
   "source": "web/index.html:2,5,7"
  },
  {
   "fait": "La page actuelle (main.tsx) est une démo avec 3 boutons (« Pays suivant », « Bonne réponse », « Mauvaise réponse ») et le nom du pays en #f7dc6f, en sans-serif.",
   "source": "web/src/main.tsx:52-57"
  },
  {
   "fait": "Des données EN existent déjà sur le disque, sans rien télécharger : le cache mledoze web/scripts/geodata/.cache/mledoze-countries.json (ignoré par git, 43238 lignes, 250 entrées, dont les 197 jouables). Il fournit name.common (EN), name.official, capital[] (EN), translations (24 langues, sans 'eng' : l'anglais est dans name), demonyms.",
   "source": ".gitignore:4 ; web/scripts/geodata/.cache/mledoze-countries.json:1"
  },
  {
   "fait": "Le type MledozeCountry du pipeline déclare déjà name.common, translations et capital: string[]. Le pipeline lit donc déjà les valeurs EN, mais ne les écrit pas dans countries.json.",
   "source": "web/scripts/geodata/lib/playable.ts:1-13"
  },
  {
   "fait": "La requête Wikidata demande les libellés en « fr,en » (avec repli sur l'anglais), mais n'écrit que data-src/capitals.fr.json. data-src ne contient aucun fichier de capitales EN.",
   "source": "web/scripts/geodata/fetch-capitals.ts:14,38"
  },
  {
   "fait": "Les 10 noms EN (mledoze name.common) les plus longs : 32 VCT \"Saint Vincent and the Grenadines\" ; 24 CAF \"Central African Republic\" ; 22 BIH \"Bosnia and Herzegovina\" ; 21 KNA \"Saint Kitts and Nevis\" ; 21 STP \"São Tomé and Príncipe\" ; 20 ARE \"United Arab Emirates\" ; 19 ATG \"Antigua and Barbuda\" ; 19 TTO \"Trinidad and Tobago\" ; 18 DOM \"Dominican Republic\" ; 17 GNQ \"Equatorial Guinea\". Statistiques : min 4, p50 7, p90 12, p95 17, max 32.",
   "source": "web/scripts/geodata/.cache/mledoze-countries.json (node -e)"
  },
  {
   "fait": "Les 10 capitales EN les plus longues : 19 BRN \"Bandar Seri Begawan\" ; 18 SMR \"City of San Marino\" ; 16 AND \"Andorra la Vella\" ; 15 USA \"Washington D.C.\" ; 14 GTM \"Guatemala City\" ; 14 HTI \"Port-au-Prince\" ; 13 DOM \"Santo Domingo\" ; 13 TTO \"Port of Spain\" ; 12 ARG \"Buenos Aires\" ; 12 ATG \"Saint John's\". Statistiques de la 1re capitale EN : min 4, p50 7, p90 11, p95 12, max 19. Plus long segment EN qu'on ne peut pas couper : 12 (Yamoussoukro, Antananarivo).",
   "source": "web/scripts/geodata/.cache/mledoze-countries.json (node -e)"
  },
  {
   "fait": "Capitale EN de mledoze ≠ capitale de jeu FR (ville différente, pas seulement une autre graphie) : LKA EN [\"Colombo\"] contre FR Sri Jayawardenapura ; PSE EN [\"Ramallah\"] contre FR Jérusalem-Est ; SWZ EN [\"Lobamba\"] contre FR Mbabane ; GNQ EN [\"Malabo\"] contre FR Ciudad de la Paz. GNQ n'est PAS arbitré dans overrides.json : Wikidata FR ne renvoie que Ciudad de la Paz.",
   "source": "web/scripts/geodata/.cache/mledoze-countries.json:22617,31852,36275,15299 ; web/scripts/geodata/data-src/capitals.fr.json:206"
  },
  {
   "fait": "YEM : EN \"Sana'a\" et FR \"Sanaa\" désignent la même ville avec deux graphies. ZAF : EN [\"Pretoria\",\"Bloemfontein\",\"Cape Town\"].",
   "source": "web/scripts/geodata/.cache/mledoze-countries.json:42439"
  },
  {
   "fait": "57 capitales de jeu s'écrivent autrement que la 1re capitale EN de mledoze, une fois les accents et la ponctuation retirés. Exemples : UKR FR \"Kiev\" / EN \"Kyiv\" ; KIR \"Tarawa-Sud\" / \"South Tarawa\" ; VAT \"Vatican\" / \"Vatican City\" ; SMR \"Saint-Marin\" / \"City of San Marino\" ; TTO \"Port-d'Espagne\" / \"Port of Spain\" ; USA \"Washington\" / \"Washington D.C.\".",
   "source": "web/scripts/geodata/data-src/capitals.fr.json:556 ; web/scripts/geodata/.cache/mledoze-countries.json:39711"
  },
  {
   "fait": "Noms EN de mledoze qui demandent un choix éditorial : CIV \"Ivory Coast\" (officiel \"Republic of Côte d'Ivoire\"), TUR \"Türkiye\", CZE \"Czechia\", CPV \"Cape Verde\" (officiel \"Republic of Cabo Verde\"), TLS \"Timor-Leste\", MMR \"Myanmar\", COD \"DR Congo\", VAT \"Vatican City\", PLW \"Palau\".",
   "source": "web/scripts/geodata/.cache/mledoze-countries.json (node -e)"
  },
  {
   "fait": "Les plus petites distances de la balise au bord (micro-États où le globe ne montre guère que la balise) : MHL 0.188 km, VAT 0.323, MCO 0.349, TUV 0.599, MDV 0.713, NRU 2.199, SYC 3.076, SMR 3.194.",
   "source": "web/public/data/countries.json (champ beaconClearanceKm, node -e)"
  },
  {
   "fait": "39 pays n'ont aucun voisin jouable ; le maximum est de 14 voisins. Les surfaces vont de 0.51 km² (VAT) à 16859281.08 km². outlineSource : naturalearth 131, geoboundaries 66.",
   "source": "web/public/data/countries.json (node -e)"
  },
  {
   "fait": "Décisions de la 2A déjà prises : modes Drapeau (4 drapeaux), Pays (4 noms), Capitale (4 capitales) ; meilleur score affiché ; 3-2-1 ; vol / question 2×2 avec touches 1-4 / révélation de 1,5 s ; fin à 60 s nettes ; top 10 local par mode ; nom et capitale EN pris dans mledoze, et versions EN des capitales arbitrées placées dans overrides.json ; aucun nouveau paquet ; i18n dans web/src/i18n/ (fr.ts, en.ts).",
   "source": "docs/HANDOFF.md:10,13-15"
  }
 ],
 "contraintes_interface": [
  "Les boutons de réponse 2×2 doivent tenir un nom FR de 31 caractères (VCT) et un nom EN de 32 caractères (VCT). Il faut au moins 2 lignes, ou une police réduite par libellé : à mobile ~360 px, une demi-largeur de ~170 px ne tient pas 31 caractères Chango sur une ligne. La médiane fait 8 (FR) et 7 (EN) caractères : prévoir une taille par défaut confortable et une règle de réduction pour les ~6 noms de 20 caractères ou plus.",
  "Le retour à la ligne doit pouvoir couper aux traits d'union (les noms FR avec traits d'union y comptent pour beaucoup). Le segment le plus long qu'on ne peut pas couper fait alors 14 caractères pour un nom (« centrafricaine ») et 15 pour une capitale (« Jayawardenapura ») : ces mots doivent tenir sur UNE ligne de bouton sans débordement ni césure forcée.",
  "Les capitales vont jusqu'à 19 caractères en FR comme en EN (« Bandar Seri Begawan », « Sri Jayawardenapura ») : la grille Capitale peut garder une police un peu plus grande que la grille Pays.",
  "Les libellés contiennent des parenthèses et des abréviations (« Congo (Rép. dém.) », « Palaos (Palau) ») : la mise en page ne doit pas les couper n'importe où.",
  "La police cartoon doit avoir les glyphes ș (U+0219), ă (U+0103), ʻ (U+02BB), ã, í, á, ó, ü, ï, ë, ê, Î, É. Sinon il faut une police de repli explicite, vérifiée sur « Chișinău » et « Nukuʻalofa ».",
  "Chango doit être hébergée avec le site (aucun fichier dans le dépôt aujourd'hui). La PWA « jouable hors ligne » (spec §6.5) exclut de dépendre de fonts.googleapis.com comme le faisait l'ancien code.",
  "Les cases du mode Drapeau doivent accepter des rapports de 0.8203 (Népal, plus haut que large) à 2.5455 (Qatar) : cadre de rapport fixe avec object-fit: contain (sans rogner ni déformer), fond neutre, et des drapeaux carrés (CHE, VAT) qui restent lisibles.",
  "Afficher les drapeaux en <img> (ou via un cadre CSS) plutôt qu'en inline SVG en se fiant au viewBox : qat.svg n'a le bon rapport (2.5455) qu'à travers width/height + preserveAspectRatio=\"none\", et afg.svg n'a pas de viewBox. Les deux cas sont à vérifier visuellement sur les maquettes.",
  "Poids des drapeaux : 4 drapeaux par manche ; certains dépassent 250 Ko (mex 345548, ecu 279168, smr 270808 octets). Il faut précharger les 4 drapeaux de la manche suivante pendant le vol, comme le patch.",
  "Le libellé de région et de sous-région, s'il est affiché (ex. indice ou récapitulatif), est en anglais dans les données : il faut un catalogue de traduction pour 5 régions et 24 sous-régions.",
  "Aucun champ EN dans countries.json : l'interface bilingue dépend d'une extension du contrat CountryRecord (et de parseCountries, qui ne contrôle aujourd'hui ni nom ni capitale).",
  "Le crédit EOX (10px, en bas à droite, au-dessus de la zone sûre) ne doit jamais être recouvert par la grille 2×2 du bas. Il faut lui réserver une bande sous la grille ou le déplacer, et le traduire (aria-label FR codé en dur).",
  "La page « Crédits » doit présenter : Natural Earth, mledoze (ODbL), Wikidata, 66 attributions geoBoundaries sous 9 licences, les 5 couches de textures, EOX CC BY-NC-SA 4.0. Elle doit aussi corriger la note « tout sous ODbL », fausse pour SLV et UNK (CC BY-SA 2.0).",
  "Les écrans d'erreur existants (navigateur non compatible, échec de chargement, « Réessayer ») sont en français codé en dur dans GlobeView : ils doivent passer par les catalogues i18n.",
  "Mobile d'abord avec viewport-fit=cover déjà en place : la grille et le HUD doivent utiliser env(safe-area-inset-*) et 100dvh, comme credits.tsx le fait déjà."
 ],
 "questions_ouvertes": [
  "GNQ : capitale de jeu « Ciudad de la Paz » (Wikidata FR) ou « Malabo » (mledoze EN) ? Les deux sources se contredisent et le pays n'est pas arbitré dans overrides.json.",
  "Versions EN des capitales arbitrées qui divergent de mledoze : LKA (« Sri Jayawardenepura Kotte » ou forme courte, contre Colombo), PSE (« East Jerusalem » contre Ramallah), SWZ (« Mbabane » contre Lobamba). Quelle graphie EN retenir ?",
  "UKR : garder « Kiev » en FR (Wikidata) ou passer à « Kyiv » comme en EN (déjà signalé dans HANDOFF:97) ?",
  "Noms EN à valider : « Ivory Coast » ou « Côte d'Ivoire », « Türkiye » ou « Turkey », « Czechia », « Cape Verde » ou « Cabo Verde », « DR Congo », « Vatican City », « Timor-Leste », « Myanmar ».",
  "Noms FR à retoucher pour les boutons ? « Congo (Rép. dém.) » et « Palaos (Palau) » ont des parenthèses ; « Îles du Cap-Vert » ; « Saint-Vincent-et-les-Grenadines » (31 caractères). Faut-il un « nom court d'affichage » distinct du nom officiel ?",
  "Capitales EN à « City » : « Mexico City », « Panama City », « Guatemala City », « Kuwait City », « City of San Marino », « Washington D.C. ». Les garder telles quelles ou les raccourcir ?",
  "Police : confirmer Chango (licence à vérifier sur la source avant de l'embarquer ; aucune trace dans le dépôt). Vérifier sa couverture de ș, ă et ʻ, et choisir la police de repli. Faut-il garder Poppins 900i, utilisée par l'ancien bouton, ou une seule police ?",
  "Mode Drapeau : cadre de rapport fixe (3:2 ? 4:3 ?) avec letterbox pour Népal et Qatar, ou cases aux proportions libres ?",
  "Licence des drapeaux SVG de mledoze : à confirmer avant la mise en ligne (spec §9:267). Faut-il une ligne de crédit dédiée dans la page Crédits ?",
  "Région et sous-région : sont-elles affichées quelque part (indice, révélation, écran de fin) ? Si oui, il faut traduire 5 + 24 libellés.",
  "Révélation : afficher quoi en plus de la bonne réponse (nom + capitale + drapeau ensemble ?). Les trois sont disponibles pour les 197 pays."
 ]
}

######## 4
{
 "resume": "J'ai lu en entier l'ancienne interface figée au commit 2d62fc2 (React 17, react-router 6, globe.gl, Lottie) : index.html, App.jsx/App.css (2932 lignes), les 7 feuilles de assets/css, toutes les pages et tous les composants d'écran. J'ai aussi extrait par node les métadonnées et les couleurs des animations Lottie, et lu le tri des scores côté backend. Rien n'a été écrit dans le dépôt ; les fichiers de travail sont dans le scratchpad.\n\nParcours de l'époque : Splash de 8 s (« Countrizz », « Le Grupetto vous presente », globe et vélo en Lottie) → Accueil (titre, champ « Entrez votre nom » qui clignote, bouton « LET'S GO ») → « Choisis ton mode de jeu! » (3 boutons Niv 1/2/3 avec étoiles) → compte à rebours Lottie « 3 2 1 GO » → jeu (en-tête nom + « score N », pastille de chrono orange, question en jaune, grille 2×2 de réponses violettes arrondies, modale Bravo/Loose avec GIF Rick & Morty) → Congrate (Lottie Morty + « Congrats », 7 s) → « Top Scores » (tableau à bordures jaunes, bouton « Rejouer »).\n\nStyle cartoon, avec ses sources : Chango chargée par @import Google Fonts dans App.css ; fond #16173a ; jaune #f7dc6f ; violet #6225e6 ; boutons .cta inclinés skewX(-15deg), label contre-incliné skewX(15deg), ombre 6px 6px 0 black (5px 7px 0 black sous 500 px), survol en ombre jaune 10px 10px 0 ; trois chevrons SVG blancs qui s'écartent au survol et clignotent en jaune (color_anim 1s, délais 0.2/0.4/0.6s). Les grands titres portent text-shadow -6px 4px 2px rgb(11, 13, 15). La valeur 5px 2px 1px black que le spec §6.3 attribue aux titres est en réalité celle du score, de la question et de l'en-tête mobile. Le chrono est un cercle #ff5722. Les réponses ne sont pas inclinées : #6225e6be, rayon 10 à 15px, ombre 3px 3px 0 black. Verte ou rouge à la révélation, avec seulement une transition de 1 s.\n\nCe qui ne marchait pas, surtout sur mobile :\n- quatre globes de taille fixe choisis par des media queries JS qui se chevauchent à 390, 460 et 677 px ;\n- des points de rupture différents dans chaque fichier CSS ;\n- une mise en page faite de translations en pixels (translateY(-320px), margin-left 300px, body à 360px) ;\n- aucune règle d'orientation, ni dvh, ni safe-area, ni toucher : les effets ne marchent qu'au survol, et le contour de focus est supprimé ;\n- les classes Tailwind de la modale sont inertes, car aucune config n'existe ;\n- le compte à rebours est coupé avant la fin du « GO » (animation de 5 s, navigation à 4,05 et 4,25 s) ;\n- le chrono démarre à 61 et tourne pendant le vol ;\n- sur une erreur, la bonne réponse n'est jamais montrée en vert ;\n- l'écran de fin affiche « score 0 » (remise à zéro avant la navigation) ;\n- textes en français seulement, avec des fautes, et un nom de pays en anglais dans la révélation ;\n- le Lottie de l'accueil pèse 12 383 671 octets.",
 "faits": [
  {
   "fait": "index.html : <html lang=\"en\">, favicon href=\"/src/favicon.svg\" (le fichier est en réalité frontend/src/assets/favicon.svg), viewport \"width=device-width, initial-scale=1.0\", <title>Vite App</title>",
   "source": "2d62fc2:frontend/index.html:2,5,6,7"
  },
  {
   "fait": "Chango est chargée uniquement par @import url(\"https://fonts.googleapis.com/css2?family=Chango&display=swap\"); en ligne 1 d'App.css. Aucun <link> dans index.html",
   "source": "2d62fc2:frontend/src/App.css:1"
  },
  {
   "fait": "La police est écrite tantôt \"Chango\", cursive (titres, footer), tantôt \"chango\" sans police de repli (boutons, questions, réponses, chrono)",
   "source": "2d62fc2:frontend/src/App.css:105,115,125,162 ; 2d62fc2:frontend/src/assets/css/ButtonPlay.css:12"
  },
  {
   "fait": "ButtonPlay.css importe Poppins:900i (fonts.googleapis.com/css?family=Poppins:900i), qui n'est utilisée nulle part",
   "source": "2d62fc2:frontend/src/assets/css/ButtonPlay.css:1"
  },
  {
   "fait": "Jetons :root : --background-color #16173a ; --Main-Font-Color #f7dc6f ; --Button-backgroud-color #d4e6f1 ; --Button-font-color #212121",
   "source": "2d62fc2:frontend/src/App.css:3-7"
  },
  {
   "fait": "body : fond var(--background-color), flex en colonne centré, max-height 90vh",
   "source": "2d62fc2:frontend/src/App.css:94-101"
  },
  {
   "fait": "Routes : / Splash ; /home Home ; /modejeu ModeJeu (déclarée trois fois) ; /countdown, /countdownPays, /countdownCity ; /jeu JeuDrapeaux ; /jeuPays ; /jeuCity ; /congrate ; /scores. Repli de Suspense : <div>Loading...</div>",
   "source": "2d62fc2:frontend/src/App.jsx:66-139"
  },
  {
   "fait": "Splash, dans l'ordre : div.containersplash (Lottie boucleterre, en boucle), h1.titre-splash « Countrizz  » (espace final), div.container2 (Lottie velo, loop false), h2.slide-in-left «  Le Grupetto vous presente  ». Passage à /home après 8000 ms par un setTimeout placé dans le corps du rendu",
   "source": "2d62fc2:frontend/src/components/Splash.jsx:35-46"
  },
  {
   "fait": "Accueil, dans l'ordre : div.container (Lottie boucleterre, en boucle), h1.titre «  Countrizz » (espace initial), champ du nom, ButtonPlay « LET'S GO » vers /modejeu, Footer",
   "source": "2d62fc2:frontend/src/pages/Home.jsx:22-36"
  },
  {
   "fait": "Champ du nom : input.ChooseName, placeholder « Entrez votre nom », maxLength 12, attribut required mais sans formulaire (le bouton est un Link, donc un nom vide passe), size 90",
   "source": "2d62fc2:frontend/src/components/NomDuJoueur.jsx:5-16"
  },
  {
   "fait": ".ChooseName (base) : Chango large, couleur #f7dc6f, fond #16173a, bordure pleine #f7dc6f, rayon 2px, text-shadow 2px 5px 4px black, margin-top 15%, max-width 270px. Animation clignoter 2.5s infinie : opacité 1 → 0 (à 40 %) → 1",
   "source": "2d62fc2:frontend/src/App.css:188-219"
  },
  {
   "fait": ".ChooseName mobile. Sous 390px : fond #232657, 15px, max-width 215px, border 0, text-shadow 1px 2px 4px black, clignoter 2s. De 390 à 460px : fond #313486, max-width 240px. De 460 à 686px : fond #313486, max-width 270px",
   "source": "2d62fc2:frontend/src/App.css:2345-2364 ; 1627-1641 ; 921-935"
  },
  {
   "fait": "Choix du mode : lien li.homeLink «  Home  » vers « / » (le Splash de 8 s, pas /home), h1.titreModejeu « Choisis ton mode de jeu! », puis trois ButtonPlay : « Niv 1 Trouve le  Drapeau ⭐ » (double espace dans la source) vers /countdown ; « Niv 2 Trouve le Pays ⭐⭐ » vers /countdownPays ; « Niv 3 trouve la capitale ⭐⭐⭐ » vers /countdowncity ; Footer",
   "source": "2d62fc2:frontend/src/pages/Modejeu.jsx:9-36 ; 2d62fc2:frontend/src/App.jsx:78"
  },
  {
   "fait": ".titreModejeu : 55px, margin-top 100px, #f7dc6f, text-shadow -6px 4px 2px rgb(11, 13, 15). 29px de 421 à 686px, 21px de 390 à 420px, 20px sous 390px (margin-top 80px)",
   "source": "2d62fc2:frontend/src/assets/css/Modejeu.css:1-12,33,68,102"
  },
  {
   "fait": ".BtnContainer : colonne, width 90%, gap 20px (18px dans les trois media queries)",
   "source": "2d62fc2:frontend/src/assets/css/Modejeu.css:14-22,54,89,123"
  },
  {
   "fait": "Animation titreModejeu : 0.7s cubic-bezier(0.25, 0.46, 0.45, 1.24) both, de translateZ(700px) translateY(-300px) opacity 0 à translateZ(0) translateY(0) opacity 1. Elle s'applique aussi à .wrapper, donc à chaque ButtonPlay",
   "source": "2d62fc2:frontend/src/App.css:620-653"
  },
  {
   "fait": "Bouton .cta : display flex, padding 10px 20px, Chango 30px, blanc, fond #6225e6, transition 1s, box-shadow 6px 6px 0 black, transform skewX(-15deg), margin 10px, max-width 800px. Le label .BtnPlay est contre-incliné en skewX(15deg)",
   "source": "2d62fc2:frontend/src/assets/css/ButtonPlay.css:8-21,42-44"
  },
  {
   "fait": "Au survol de .cta : box-shadow 10px 10px 0 var(--Main-Font-Color) (transition 0.5s), et le second span passe de margin-right 0 à 45px",
   "source": "2d62fc2:frontend/src/assets/css/ButtonPlay.css:27-40"
  },
  {
   "fait": "Chevrons : SVG 66×43 (viewBox 0 0 66 43), trois paths remplis en #FFFFFF, de classes one, two et three. Au repos : path.one en translateX(-60%) (transition 0.4s), path.two en translateX(-30%) (transition 0.5s). Au survol : translateX(0%) et animation color_anim 1s infinite, avec un délai de 0.2s pour three, 0.4s pour two et 0.6s pour one",
   "source": "2d62fc2:frontend/src/components/ButtonPlay.jsx:11-35 ; 2d62fc2:frontend/src/assets/css/ButtonPlay.css:53-75"
  },
  {
   "fait": "@keyframes color_anim : 0 % fill white ; 50 % fill var(--Main-Font-Color) ; 100 % fill white",
   "source": "2d62fc2:frontend/src/assets/css/ButtonPlay.css:77-89"
  },
  {
   "fait": "Le conteneur des chevrons est ciblé par un sélecteur global span:nth-child(2) : width 20px, margin-left 30px, position relative, top 12%. Sous 500px : margin-left 20px, top 5%",
   "source": "2d62fc2:frontend/src/assets/css/ButtonPlay.css:46-51,133-138"
  },
  {
   "fait": "Deux blocs @media (max-width: 500px) se suivent. Le second l'emporte : font-size 22px, padding 10px 15px, box-shadow 5px 7px 0 black, margin 8px (le premier disait 25px et 6px 6px 0 black)",
   "source": "2d62fc2:frontend/src/assets/css/ButtonPlay.css:90-108,178-196"
  },
  {
   "fait": ".cta:focus { outline: none; } supprime tout contour de focus visible",
   "source": "2d62fc2:frontend/src/assets/css/ButtonPlay.css:23-25"
  },
  {
   "fait": "Grands titres : .titre en Chango 4rem #f7dc6f, text-shadow -6px 4px 2px rgb(11, 13, 15). Taille 3.8rem au-dessus de 686px et de 460 à 686px, 3.4rem de 390 à 460px, 3rem sous 390px",
   "source": "2d62fc2:frontend/src/App.css:103-113,759,839,1545,2261"
  },
  {
   "fait": ".titre-splash : 4rem et même text-shadow -6px 4px 2px rgb(11, 13, 15) ; 2.7rem de 460 à 686px et de 390 à 460px ; 2.6rem sous 390px",
   "source": "2d62fc2:frontend/src/App.css:114-122,848,1554,2273"
  },
  {
   "fait": "Animations des titres. titre : 1s cubic-bezier(0.25, 0.46, 0.45, 1.54) 0.5s both, de translateX(-1000px) opacity 0 à translateX(0) opacity 1. titre-splash : 1s cubic-bezier(0.25, 0.46, 0.45, 1.14) 4s both, de -1000px à 50px. slide-in-left (sous-titre du Splash, Chango 16px) : 1s cubic-bezier(0.25, 0.46, 0.45, 1.14) 1s both, de -1000px à 0",
   "source": "2d62fc2:frontend/src/App.css:557-616 ; 362-400"
  },
  {
   "fait": "Compte à rebours : CountdownAnimation.json, nm « 3 2 1 GO », 300×300, 30 images/s, op 150, soit 5,000 s, sans boucle. Calques : « 3 » images 0–42, « 2 » 30–73, « 1 » 60–103, « GO » 90–150 (le GO commence à 3,0 s). Couleurs : chiffres #bf76ff, reflet #d6a4f8, ombre « dark » #f7dc6f",
   "source": "2d62fc2:frontend/src/assets/Images/CountdownAnimation.json (nm, fr, op, layers[].ip/op, remplissages fl — extraits par node)"
  },
  {
   "fait": "La navigation part après 4050 ms (Niv 1) ou 4250 ms (Niv 2 et 3), donc avant la fin de l'animation de 5 s : le « GO » est coupé",
   "source": "2d62fc2:frontend/src/components/Countdown.jsx:24-26 ; CountdownPays.jsx:23-25 ; ContdownCity.jsx:24-26"
  },
  {
   "fait": ".container3 (écran du compte à rebours). Au-dessus de 686px : absolute, 100 %×100 %, fond #16173a, padding-top 50px, z-index 5000, fondu container3 de 1s cubic-bezier(0.1, 0.46, 0.45, 1.14) avec 4s de délai (opacité 1 → 0). Sous 686px : height 700px, margin-top -49px, délai 3s (le GO s'efface pendant qu'il apparaît)",
   "source": "2d62fc2:frontend/src/App.css:764-809 ; 1379-1392 ; 2085-2096 ; 2806-2817"
  },
  {
   "fait": "Countdown.css (.BtnCountdown : cercle #6225e6 de 250×200, Chango 100px blanc, text-shadow 2px 1px 5px black, box-shadow 6px 6px 0 black ; 80px et 200×180 sous 500px) n'est importé nulle part : style mort",
   "source": "2d62fc2:frontend/src/assets/css/Countdown.css:1-50 (recherche node : 0 import)"
  },
  {
   "fait": "En-tête de jeu : p.playerName {nom}, puis p.playerScore « score {score} » en minuscules",
   "source": "2d62fc2:frontend/src/components/Header.jsx:6-10"
  },
  {
   "fait": "header : Chango x-large #f7dc6f, flex justify-content flex-end, padding-right 10%, margin-left 300px, translateY(60px). Sous 425px et de 425 à 676px : margin-left 50px, max-width 300px, text-shadow 5px 2px 1px black",
   "source": "2d62fc2:frontend/src/assets/css/Header.css:1-14,51-66,124-139"
  },
  {
   "fait": "Chrono GameCountdown : useState(61), -1 par seconde par setInterval, onFinished() appelé à l'intérieur d'un updater setState, intervalle coupé quand paused. Il n'affiche que le nombre, sans unité",
   "source": "2d62fc2:frontend/src/components/GameCountdown.jsx:31-55"
  },
  {
   "fait": ".BtnGameCountdown (base, au-dessus de 686px) : absolute, top 65%, left 8%, Chango 35px blanc, text-shadow 2px 1px 5px black, fond #ff5722, box-shadow 6px 6px 0 black, 50×50, border-radius 100%, padding 10px 2px, z-index 4000. Sous 686px : top 15% (25% sous 390px), left 2%, 25px, 25×25 + padding 14px 18px, box-shadow 6px 6px 2px black",
   "source": "2d62fc2:frontend/src/App.css:154-174 ; 877-896 ; 1583-1602 ; 2302-2321"
  },
  {
   "fait": "Score : +10 par bonne réponse, rien sur une erreur. La manche suivante démarre après 1500 ms dans les deux cas",
   "source": "2d62fc2:frontend/src/pages/Jeu.jsx:153-170"
  },
  {
   "fait": "Déroulé d'une manche : pointOfView à l'altitude 1.4 (bureau) ou 2.2 (mobile) en 1500 ms ; à +400 ms, pointOfView vers le pays en 2500 ms et affichage des 4 réponses ; boutons actifs à +800 ms, alors que le vol dure encore. setIsPaused(false) relance le chrono dès le début de la manche",
   "source": "2d62fc2:frontend/src/pages/Jeu.jsx:115-146"
  },
  {
   "fait": "Pays cible surligné : polygonCapColor \"#ffee03a1\", polygonStrokeColor \"#111\", polygonAltitude 0.004, Antarctique (AQ) exclu",
   "source": "2d62fc2:frontend/src/pages/Jeu.jsx:199-208"
  },
  {
   "fait": "Quatre <Globe> à tailles fixes : 360×680 (sous 390), 390×820 (390 à 460), 650×800 (460 à 677), 1300×750 (677 et plus). Les useMediaQuery min/max sont inclusifs et se chevauchent à 390, 460 et 677 px : deux globes y sont montés sur le même ref",
   "source": "2d62fc2:frontend/src/pages/Jeu.jsx:49-52,185-288"
  },
  {
   "fait": "Textes des questions : Niv 1 « Quel est le drapeau de ce pays :  » ; Niv 2 « Trouve le nom de ce pays?   » ; Niv 3 « Trouve la capitale de  ». Le nom du pays est commenté, donc la phrase du Niv 3 reste incomplète",
   "source": "2d62fc2:frontend/src/pages/JeuDrapeaux.jsx:21-22 ; JeuPays.jsx:15 ; JeuCity.jsx:13-14"
  },
  {
   "fait": "Contenu des réponses : Niv 1 <img src={country.flags.svg} alt=\"name\" height={70} /> ; Niv 2 country.translations.fra.common ; Niv 3 country.capital",
   "source": "2d62fc2:frontend/src/pages/JeuDrapeaux.jsx:25-27 ; JeuPays.jsx:18 ; JeuCity.jsx:17"
  },
  {
   "fait": ".champsQst : Chango 30px #f7dc6f, text-shadow 5px 2px 1px black, transform translateY(-320px), max-width 1100px. 26px de 500 à 676px (max-width 650px) ; 22px sous 500px, avec text-shadow 5px 2px 2px black et max-width 380px",
   "source": "2d62fc2:frontend/src/assets/css/Questions.css:1-37"
  },
  {
   "fait": "Grille des réponses : 2 colonnes et 2 rangées (repeat(2, 1fr)), column-gap 15px en base et 8px dans les media queries. Placée par translateY : -320px (678px et plus), -280px (460 à 677), -270px (390 à 460), -300px (.responses-mobile, sous 390)",
   "source": "2d62fc2:frontend/src/assets/css/Reponse.css:1-19,99-113,194-208,290-304,385-399"
  },
  {
   "fait": "Bouton de réponse .ctaRep, non incliné : Chango, blanc, text-shadow 2px 1px 5px black, fond #6225e6be (base) ou #6225e6c2 (media), box-shadow 3px 3px 0 black, rayon 15px (base) ou 10px (media), transition 1s. Base : 20px, max-width 290px, max-height 85px. Largeur 250px (678 et plus), 210 à 245px (460 à 677), 170 à 200px (390 à 460), 155 à 160px (sous 390, 16px). min-height 95px",
   "source": "2d62fc2:frontend/src/assets/css/Reponse.css:27-42,120-135,215-230,311-326,406-422"
  },
  {
   "fait": "Révélation : .greenBtn fond green (base) ou rgba(0, 128, 0, 0.801) (media), box-shadow 6px 6px 0 black, rayon 15px ; .redBtn fond red ou rgba(255, 0, 0, 0.801), rayon 15px (base) ou 10px (media). Aucune animation keyframes sur les boutons, seulement transition: 1s",
   "source": "2d62fc2:frontend/src/assets/css/Reponse.css:67-97,161-192"
  },
  {
   "fait": "Logique des couleurs : success = bonne réponse ET bouton = pays cible ; fail = mauvaise réponse ET bouton ≠ pays cible. Sur une erreur, les trois mauvais boutons (y compris celui cliqué) virent au rouge, et la bonne réponse reste violette, jamais verte",
   "source": "2d62fc2:frontend/src/components/Reponses.jsx:18-23 ; 2d62fc2:frontend/src/components/ButtonReponse.jsx:17"
  },
  {
   "fait": "Modales de révélation. Bravo : « Tu déchire!! la réponse était bien {namePaysBravo} » + rick-and-morty-rtj.gif (1 243 840 octets). Loose : « Oh non! tu t' es trompé,la réponse était {namePaysLoose} » + rickandmortyloose.gif (561 016 octets). Le nom affiché est countryToGuess.name.common, alors que les réponses du Niv 2 sont en translations.fra.common",
   "source": "2d62fc2:frontend/src/components/Bravo.jsx:19-25 ; Loose.jsx:20-26 ; pages/Jeu.jsx:176-182 ; git ls-tree -l 2d62fc2"
  },
  {
   "fait": ".modale : fond #2121219c, position absolute, top 100px, 100 %×100 %, z-index 1000000, transition 300ms. Le texte (.namepaysbravo/.namepaysloose) est x-large, centré, #f7dc6f, chango. .imagebravo : 60 % (min 300px, max 600px), rayon 2 %, animation imagebravo 1.9s cubic-bezier(0.25, 0.46, 0.45, 1.24) both, de translateX(-20px) à 0. .imageloose n'a pas d'animation",
   "source": "2d62fc2:frontend/src/App.css:15-87"
  },
  {
   "fait": "Bravo et Loose utilisent des classes Tailwind (fixed inset-0 bg-gray-500 bg-white rounded-lg shadow-xl…). Aucun tailwind.config ni postcss.config n'existe dans l'arbre du commit (291 fichiers) et App.css n'a aucune directive @tailwind : ces classes sont sans effet",
   "source": "2d62fc2:frontend/src/components/Bravo.jsx:12-29 ; git ls-tree -r 2d62fc2 (0 fichier tailwind/postcss)"
  },
  {
   "fait": "Les ARIA aria-labelledby=\"modal-title\" et aria-modal=\"true\" n'apparaissent que dans Bravo et Loose. Aucun élément ne porte id=\"modal-title\"",
   "source": "2d62fc2:frontend/src/components/Bravo.jsx:8-10 ; Loose.jsx:8-10"
  },
  {
   "fait": "Fin de partie : onGameEnd attend addScores, puis fait setScore(0), puis navigate(\"/congrate\"). La route /congrate reçoit playerScore={score}, si bien que l'écran de fin affiche « score 0 »",
   "source": "2d62fc2:frontend/src/App.jsx:58-62,83-86"
  },
  {
   "fait": "Congrate, dans l'ordre : <br/>, Header (nom + score), div.mortydance (Lottie Morty en boucle, 60 images/s, 0,45 s), div.congratulations (Lottie « Congrats » 512×512, 3 s, couleurs #f7dc6f, #ffffff, contour #0c1977), Footer. Passage à /scores après 7000 ms",
   "source": "2d62fc2:frontend/src/pages/Congrate.jsx:36-49 ; congratulations.json, mortydance.json (node)"
  },
  {
   "fait": ".mortydance : height 250px, animation mortydance 20s cubic-bezier(0.1, 0.46, 0.45, 1.14) 1s both (traversée de -900/-1000px à 900/1000px). .congratulations : height 500px, translateY(-180px). Les media queries écrivent .congratations (faute de frappe), donc seule la règle de base s'applique",
   "source": "2d62fc2:frontend/src/App.css:682-732,1374"
  },
  {
   "fait": "Scores, dans l'ordre : div.finalScore > h1 « Top Scores » > table (une ligne nom | score) > ButtonPlay « Rejouer » vers /home > Footer. Le composant ignore playerName et playerScore : le score du joueur n'est ni affiché ni mis en évidence",
   "source": "2d62fc2:frontend/src/pages/TableauScores.jsx:6-31 ; 2d62fc2:frontend/src/App.jsx:133-138"
  },
  {
   "fait": "Le classement est unique, tous modes confondus : « select * from ${this.table} order by score desc limit 10 »",
   "source": "2d62fc2:backend/src/models/ScoreManager.js:20-24"
  },
  {
   "fait": "Tableau : table en display grid, bordure 4px solid #f7dc6f, rayon 10px, padding 4% ; th bordure 3px solid #f7dc6f, rayon 7px ; td bordure 4px solid #f7dc6f, rayon 8px ; tr en grille de 2 colonnes. Sous 460px : bordure 3px, max-width 350px, margin-left -35px, td 16px",
   "source": "2d62fc2:frontend/src/App.css:223-308 ; 2132-2210 ; 2853-2931"
  },
  {
   "fait": ".finalScore et .playerScore : Chango, #f7dc6f, text-shadow 5px 2px 1px black",
   "source": "2d62fc2:frontend/src/assets/css/Header.css:33-49"
  },
  {
   "fait": "Pied de page « Le Gruppetto 2022 » : Chango x-large #f7dc6f (large sous 686px), .footer margin-top 10%. Le Splash écrit « Grupetto »",
   "source": "2d62fc2:frontend/src/components/footer.jsx:5 ; App.css:123-129 ; assets/css/footer.css:1-7 ; components/Splash.jsx:45"
  },
  {
   "fait": "Points de rupture différents selon le fichier : App.css 390/460/686 ; ButtonPlay.css et Countdown.css 500 ; Header.css 425/676 ; Modejeu.css 390/420/421/686 ; Questions.css 500/676 ; Reponse.css 390/460/677/678 ; Jeu.jsx (JS) 390/460/677",
   "source": "2d62fc2:frontend/src/App.css:734,814,1507,2215 ; assets/css/*.css (18 @media relevées par node) ; pages/Jeu.jsx:49-52"
  },
  {
   "fait": "Aucune media query d'orientation ou de hauteur, aucun dvh/svh, aucun env(safe-area-*), aucun :active ni règle tactile, aucun gestionnaire clavier, aucun prefers-reduced-motion. Les seules unités de viewport sont max-height 90vh (body) et width 100vw (.homeLink)",
   "source": "recherche node sur 2d62fc2:frontend/src ; App.css:100 ; assets/css/Header.css:20"
  },
  {
   "fait": "Sous 390px : body en width 360px et max-height 680px ; :root en translateY(30px) et max-height 650px ; .Jeu en width 360px et translateY(-80px)",
   "source": "2d62fc2:frontend/src/App.css:2215-2253"
  },
  {
   "fait": ".homeLink (hors media) : width 100vw + margin-right 350px + translateY(-35px)",
   "source": "2d62fc2:frontend/src/assets/css/Header.css:16-26"
  },
  {
   "fait": "Le Lottie boucleterre.json pèse 12 383 671 octets et se charge sur le Splash et sur l'Accueil. Couleurs en dégradé : continents de #5db432 à #329700, océan de #a8d0fe à #004797, halo #00ccff",
   "source": "git ls-tree -l 2d62fc2 -- frontend/src/assets/Images/ ; components/Splash.jsx:4 ; pages/Home.jsx:4 ; boucleterre.json (gf, node)"
  },
  {
   "fait": "Valeurs CSS invalides, ignorées par le navigateur : .modale translateY(-300) ; translateY(300), translateY(-1300) et translateX(1000) sans unité dans les keyframes ; translate3D(-1000px) avec un seul argument ; -webkit-animation « container2 3, 5s » ; transition: 1100 ; animation-duration: 1000 ; min-width: 290x",
   "source": "2d62fc2:frontend/src/App.css:31,330,349-350,471-472,496 ; assets/css/Reponse.css:14,39 ; assets/css/Questions.css:12"
  },
  {
   "fait": "Navigations par setTimeout dans le corps du composant, sans useEffect ni nettoyage, sur Splash, sur les trois comptes à rebours et sur Congrate",
   "source": "2d62fc2:frontend/src/components/Splash.jsx:35-37 ; Countdown.jsx:24-26 ; pages/Congrate.jsx:36-38"
  },
  {
   "fait": "Code mort jamais routé ni importé : JeuNomPays, pages/Score.jsx, ButtonPlayCity/Flag/Pays (SVG vide), Earth.jsx (WebGPU), Countdown.css. Assets non référencés : splash-screen-animation.json, terre.json, fondbleu.png, rickmorty.svg, logo.svg",
   "source": "recherche node des imports sur 2d62fc2:frontend/src (0 référence)"
  },
  {
   "fait": "Le spec §6.3 attribue aux titres text-shadow: 5px 2px 1px black. Dans l'ancien code, les grands titres (.titre, .titre-splash, .titreModejeu) portent -6px 4px 2px rgb(11, 13, 15) ; 5px 2px 1px black est l'ombre du score, de l'en-tête mobile et de la question",
   "source": "docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md:190 ; 2d62fc2:frontend/src/App.css:112,121 ; assets/css/Modejeu.css:11 ; assets/css/Header.css:42,48,61 ; assets/css/Questions.css:10"
  },
  {
   "fait": "Le passage déroulé de la 2A prévoit une révélation de 1,5 s, vert + flash ou rouge + pulsation, avec la bonne réponse montrée, puis une fin à 60 s nettes et le libellé « Jouer » à l'accueil",
   "source": "docs/HANDOFF.md:14"
  }
 ],
 "contraintes_interface": [
  "Reprendre les valeurs exactes : fond #16173a, jaune #f7dc6f, violet #6225e6, skewX(-15deg) avec label contre-incliné skewX(15deg), box-shadow 6px 6px 0 black, ombre jaune 10px 10px 0 #f7dc6f comme état actif, chevrons blancs à trois paths animés en jaune (color_anim 1s, délais 0.2/0.4/0.6s).",
  "Charger Chango en local et la mettre en précache (PWA jouable hors ligne, spec §6.5) au lieu de l'@import Google Fonts d'App.css:1 ; écrire une seule déclaration avec une police de repli ; supprimer l'import inutile de Poppins.",
  "Déclencher au toucher ou au focus tout ce que l'ancien réservait au :hover (chevrons, ombre jaune), et garder un focus visible : l'ancien faisait outline: none sur .cta:focus.",
  "Un seul canvas plein écran qui suit la taille réelle (ResizeObserver, spec §6.3) : aucune taille de globe en dur et aucune media query qui se chevauche (l'ancien montait deux globes à 390, 460 et 677 px).",
  "Une seule échelle de points de rupture partagée entre CSS et JS. Aucune mise en page par translations en pixels (translateY(-320px), margin-left 300px, body à 360px). Utiliser 100dvh et env(safe-area-inset-*), et prévoir le paysage téléphone : l'ancien, piloté par la seule largeur, y basculait en mise en page bureau.",
  "Révélation : sur une erreur, montrer la bonne réponse en vert en plus du choix rouge (l'ancien laissait la bonne réponse violette). Ne pas masquer le pays sur le globe (l'ancienne modale couvrait tout à partir de top:100px). Annoncer le résultat en aria-live (spec §6.3).",
  "Compte à rebours : jouer la séquence en entier, « GO » compris (l'ancien coupait une animation de 5 s à 4,05 ou 4,25 s et commençait le fondu à 3 s sous 686 px).",
  "Chrono : afficher 60 au départ (pas 61), en pause pendant le vol et la révélation, et réponses actives seulement à la fin du vol. L'ancien relançait le chrono et activait les boutons à +800 ms pendant un vol de 2,5 s.",
  "Écran de fin : afficher le score de la partie avant toute remise à zéro (l'ancien affichait « score 0 »), sans jamais attendre l'envoi au serveur (spec §8).",
  "Classement : par mode, top 10 (spec §7), en mettant en évidence la ligne du joueur. L'ancien mélangeait les modes et ignorait le score du joueur.",
  "Nom du joueur : maxLength 12, aligné sur l'API (name ≤ 12, spec §7), mémorisé localement. Un nom vide doit être traité explicitement : l'ancien laissait passer un champ vide.",
  "Bilingue : toutes les chaînes inventoriées passent par fr.ts / en.ts, y compris les fautes à corriger (« Tu déchire!! », « tu t' es trompé,la », « Le Grupetto vous presente ») et le « LET'S GO » anglais de l'UI française. Le nom du pays révélé doit être dans la langue de l'interface (l'ancien mélangeait phrase française et name.common anglais). L'attribut lang de <html> doit suivre la langue, et le titre doit être « Countrizz » (l'ancien : lang=\"en\" et « Vite App »).",
  "Retirer, comme décidé au spec §1 : GIF Rick & Morty, Lottie (boucleterre.json à 12 383 671 octets), vélo, « Le Gruppetto ». Ne plus mélanger Tailwind et CSS : l'ancien utilisait des classes Tailwind sans configuration.",
  "Respecter prefers-reduced-motion pour les entrées animées héritées : glissement de -1000px avec dépassement cubic-bezier(…, 1.54), chute translateZ(700px) translateY(-300px), clignotement du champ nom.",
  "Cibles tactiles ≥ 48 px et grille 2×2 en bas d'écran (spec §6.3). L'ancien avait déjà des réponses de min-height 95px, mais placées par translateY sur le globe."
 ],
 "questions_ouvertes": [
  "Ombre des titres : reprendre la valeur réelle de l'ancien code (-6px 4px 2px rgb(11, 13, 15), décalée vers la gauche) ou celle du spec §6.3 (5px 2px 1px black, en fait celle du score et des questions) ? Le spec est à corriger dans un cas comme dans l'autre.",
  "Boutons de réponse : garder l'ancien style arrondi et non incliné (#6225e6 à 75 % d'opacité, rayon 10 à 15px, ombre 3px 3px 0) ou les aligner sur les boutons inclinés skewX(-15deg) de l'accueil et du choix du mode ?",
  "Chrono : garder la pastille ronde orange #ff5722 (seule couleur hors palette) ou passer au jaune ou au violet ? Faut-il ajouter une unité ou une jauge ?",
  "Compte à rebours 3-2-1 dans la scène : reprendre les couleurs du Lottie (chiffres #bf76ff, reflet #d6a4f8, ombre #f7dc6f) ou le cercle violet #6225e6 en 100px du style .BtnCountdown, jamais branché ?",
  "Questions des niveaux 1 et 3 : nommer le pays dans la phrase (« Trouve la capitale de la France ») ou s'en remettre au seul surlignage du globe, comme le faisait l'ancien par accident (nom commenté) ?",
  "Champ du nom : garder le clignotement (opacité 0 à 40 %, gênant pendant la saisie) ou le remplacer par un halo ou un curseur ?",
  "Libellés des modes : garder « Niv 1/2/3 » et les étoiles ⭐/⭐⭐/⭐⭐⭐, ou n'afficher que Drapeau / Pays / Capitale, avec le meilleur score comme le prévoit le handoff ?",
  "Ton des messages de révélation : garder le registre familier (« Tu déchires ! », « Oh non ! ») corrigé, avec un équivalent anglais à écrire, ou passer à un registre neutre ?",
  "Paysage sur téléphone : quelle disposition des réponses (colonne à droite du globe, ou grille 2×2 en bas malgré la faible hauteur) ? L'ancien n'avait aucune règle pour ce cas.",
  "Animations d'entrée de l'ancien (titres qui glissent avec dépassement, boutons qui tombent) : les reprendre telles quelles, les adoucir, ou les réserver à l'accueil ?"
 ]
}