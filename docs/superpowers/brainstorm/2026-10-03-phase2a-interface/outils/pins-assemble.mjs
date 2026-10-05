import { readFileSync, writeFileSync } from 'node:fs';
const SP = '/private/tmp/claude-501/-Users-rusmirsadikovic-projetsperso-countriz-countrizz/e34a42b7-ba8d-4856-b4cd-8f39e1367ba3/scratchpad/pins';
const OUT = '/Users/rusmirsadikovic/projetsperso/countriz/countrizz/.superpowers/brainstorm/85431-1791060294/content/accueil-reperes.html';
const META = [
  ['d1', 'G1 · Épingles cartoon', "Un drapeau planté à Paris avec son étiquette « France · ★ Paris », deux épingles en goutte violettes à tête de mini-drapeau (Rome, Le Caire), une épingle jaune « ? » au cœur de l'Algérie avec « Quel pays ? », et un petit avion sur une route en pointillés."],
  ['d2', 'G2 · Drapeaux plantés', "Six vrais drapeaux plantés au cœur des pays, sur des mâts dont l'ombre tombe sur le sol, avec un fanion au nom du pays ; les capitales sont des étoiles. Un drapeau mystère « ? » attend en Ukraine : le prochain pays à conquérir."],
  ['d3', 'G3 · Carnet de voyage', "L'univers du collectionneur : étiquette de bagage à Paris, timbre-poste dentelé au Caire, tampon de passeport à Rabat, petits timbres au bord du globe ; un avion relie Paris au Caire."],
  ['d4', 'G4 · Balises lumineuses', "Le langage de la balise du jeu : anneaux jaunes posés sur le sol, faisceaux et enseignes de verre nocturnes « Pays ★ capitale » ; une pastille « ? Et ici ? » au cœur de la Libye."],
  ['d5', 'G5 · Escales (direction libre)', "La planète raconte une partie : épingles-drapeaux ✓ des pays déjà trouvés (Maroc, Espagne), drapeau planté à Paris, puis un avion en papier qui file vers la prochaine question, « Grèce · ? », sous la balise du jeu."],
];
const cards = META.map(([k, titre, desc]) => {
  const frag = readFileSync(`${SP}/${k}/fragment.html`, 'utf8').replaceAll('ASSET/', '/files/');
  return `<div class="card" data-choice="${k}" onclick="toggleSelect(this)"><div class="pw"><div class="scaler">${frag}</div></div><h3>${titre}</h3><p>${desc}</p></div>`;
}).join('\n');
const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Accueil : repères ludiques</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Chango&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; background: #f5f5f7; color: #1d1d1f; font-family: system-ui, -apple-system, sans-serif; }
  @media (prefers-color-scheme: dark) { html, body { background: #1d1d1f; color: #f5f5f7; } .card { background: #2d2d2f !important; border-color: #424245 !important; } .card p { color: #a1a1a6 !important; } }
  main { padding: 28px 32px 60px; }
  h2 { font-size: 1.5rem; margin: 0 0 .4rem; }
  .sub { color: #86868b; margin: 0 0 1.4rem; max-width: 1200px; line-height: 1.5; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 1.2rem; align-items: start; }
  .card { cursor: pointer; border: 2px solid #d1d1d6; border-radius: 18px; padding: 14px; background: #fff; transition: border-color .15s; }
  .card:hover { border-color: #0071e3; }
  .card.selected { border-color: #0071e3; box-shadow: 0 0 0 3px rgba(0,113,227,.25); }
  .card h3 { margin: 12px 0 4px; font-size: 1rem; }
  .card p { margin: 0; font-size: .84rem; color: #6e6e73; line-height: 1.45; }
  .pw { width: 300px; height: 649px; margin: 0 auto; border-radius: 36px; overflow: hidden; box-shadow: 0 0 0 8px #0b0b10, 0 10px 30px rgba(0,0,0,.4); }
  .scaler { width: 390px; height: 844px; transform: scale(.769); transform-origin: 0 0; }
</style></head><body><main>
<h2>Accueil H3 : des repères ludiques sur le globe</h2>
<p class="sub">Cinq directions artistiques, chacune posée sur la vraie capture du globe, avec des repères placés aux vraies coordonnées projetées par le jeu (capitales et cœurs de pays). Les animations tournent : drapeaux qui ondulent, épingles qui tombent, balises qui pulsent, avions qui volent. Dans le jeu, les repères suivent la surface pendant la rotation : ils rapetissent et s'estompent vers le bord, et d'autres apparaissent de l'autre côté. On peut aussi en combiner plusieurs : dis-moi ce que tu prends dans chacune.</p>
<div class="cards">
${cards}
</div></main></body></html>`;
writeFileSync(OUT, html);
console.log('ok', html.length);
