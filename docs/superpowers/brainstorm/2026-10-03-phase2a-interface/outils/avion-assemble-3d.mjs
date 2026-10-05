import { readFileSync, writeFileSync } from 'node:fs';
const SP = '/private/tmp/claude-501/-Users-rusmirsadikovic-projetsperso-countriz-countrizz/e34a42b7-ba8d-4856-b4cd-8f39e1367ba3/scratchpad';
const OUT = '/Users/rusmirsadikovic/projetsperso/countriz/countrizz/.superpowers/brainstorm/85531-1791104565/content/accueil-avion-3d.html';
const frag = readFileSync(`${SP}/pins/d5/fragment.html`, 'utf8').replaceAll('ASSET/', '/files/');
const open = frag.match(/<div class="d5 phone"[^>]*>/)[0];
const AV = [
  ['papier', 'A1 · Papier réaliste', "Une vraie feuille pliée : dard en papier crème #fff8e7 avec grain et ondulations, bande violette, filet jaune et rond « C » imprimés. L'avion décolle de Paris, monte, vire en douceur, relève le nez et se pose à plat devant la balise d'Athènes ; l'ombre bleu nuit suit sur le globe."],
  ['cartoon', 'A2 · Cartoon premium', "La 3D au service de l'interface : aplats à trois tons, quille violette #6225e6, contour noir épais aux bouts arrondis (comme les autocollants et les boutons), ombre nette sur le globe. Un objet de jeu mobile plutôt qu'un objet réaliste."],
  ['origami', 'A3 · Origami et effets', "Un planeur origami à plis multiples et longs winglets, chevron violet, encre noire fine ; ruban de traînée qui s'efface, deux fines traînées de condensation aux bouts d'ailes et une étincelle jaune de temps en temps."],
];
const cards = AV.map(([k, titre, desc]) => `<div class="card" data-choice="${k}" onclick="toggleSelect(this)"><div class="pw"><div class="scaler">${frag.replace(open, `${open}<canvas class="av" id="av-${k}" aria-hidden="true"></canvas>`)}</div></div><h3>${titre}</h3><p>${desc}</p></div>`).join('\n');
const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Accueil : l'avion en papier en 3D</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Chango&display=swap" rel="stylesheet">
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/"}}</script>
<style>
  html, body { margin: 0; background: #f5f5f7; color: #1d1d1f; font-family: system-ui, -apple-system, sans-serif; }
  @media (prefers-color-scheme: dark) { html, body { background: #1d1d1f; color: #f5f5f7; } .card { background: #2d2d2f !important; border-color: #424245 !important; } .card p { color: #a1a1a6 !important; } }
  main { padding: 28px 32px 60px; }
  h2 { font-size: 1.5rem; margin: 0 0 .4rem; }
  .sub { color: #86868b; margin: 0 0 1.4rem; max-width: 1150px; line-height: 1.5; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 1.4rem; align-items: start; max-width: 1200px; }
  .card { cursor: pointer; border: 2px solid #d1d1d6; border-radius: 18px; padding: 14px; background: #fff; }
  .card:hover { border-color: #0071e3; }
  .card.selected { border-color: #0071e3; box-shadow: 0 0 0 3px rgba(0,113,227,.25); }
  .card h3 { margin: 12px 0 4px; font-size: 1rem; }
  .card p { margin: 0; font-size: .84rem; color: #6e6e73; line-height: 1.45; }
  .pw { width: 300px; height: 649px; margin: 0 auto; border-radius: 36px; overflow: hidden; box-shadow: 0 0 0 8px #0b0b10, 0 10px 30px rgba(0,0,0,.4); }
  .scaler { width: 390px; height: 844px; transform: scale(.769); transform-origin: 0 0; }
  .d5 .plane, .d5 .pshadow, .d5 .trail .go { display: none !important; }
  .d5 canvas.av { position: absolute; left: 0; top: 0; width: 390px; height: 844px; z-index: 8; pointer-events: none; }
</style></head><body><main>
<h2>Accueil G5 : l'avion en papier en vraie 3D</h2>
<p class="sub">Trois avions three.js (la version du jeu, 0.186.1), chacun vérifié puis corrigé par un relecteur. Ils volent de Paris à Athènes sur le vrai grand cercle, juste au-dessus du globe, avec la caméra et le soleil exacts du jeu recalés sur la capture : l'ombre tombe réellement sur la Terre. Mesuré au pixel sur toute la boucle, ni l'avion, ni son ombre, ni la traînée ne masquent le drapeau, les étiquettes, la balise, les boutons ou le crédit. Ici rendus en WebGL ; dans le jeu, ils seraient dans la scène WebGPU du globe.</p>
<div class="cards">
${cards}
</div></main>
<script type="module">
${AV.map(([k]) => `import { mount as m_${k} } from '/files/avion-${k}.js';`).join('\n')}
${AV.map(([k]) => `try { m_${k}(document.getElementById('av-${k}')); } catch (e) { console.error('${k}', e); }`).join('\n')}
</script>
</body></html>`;
writeFileSync(OUT, html);
console.log('ok', html.length);
