"""
Point d'entrée Blender de la fabrique (spec intro vidéo §2.4), lancé par `npm run intro:<mode>` (scripts/intro/blender.ts) :
  temoins : quelques instants clés (--images, donnés par blender.ts depuis temps.ts) à pleine qualité, pour mesurer ;
  apercu  : toutes les images, définition et échantillons réduits, pour juger le rythme ;
  rendu   : toutes les images à pleine qualité (la nuit) ;
  sprite  : les vues de la petite Terre du titre (logo-terre.webp, SPRITE_VUES de scene.py), 128 × 128, sans clés.
Sortie : <cache>/frames/<mode>/<cadrage>/f_0001.png … (RGBA 8 bits, image n ↔ t = (n − 1) / 120 s) ; sprite :
<cache>/frames/sprite/f_0001.png … (vue n ↔ angle (n − 1)·360°/SPRITE_VUES). Une image entière déjà écrite est gardée
(reprise après un arrêt) ; un dossier rendu avec d'autres réglages, d'autres clés ou une autre scène (scripts de blender/,
sources, police) est refusé sans --neuf : une vidéo ne mélange ni deux qualités ni deux scènes. Toute piste des clés doit
trouver son objet dans la scène (contrat avec export-keys.ts).
"""
import hashlib
import json
import os
import shutil
import sys
import time

sys.dont_write_bytecode = True   # pas de __pycache__ à côté des scripts (dépôt)
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)

import bpy  # noqa: E402

import anim  # noqa: E402
import commun  # noqa: E402
import scene as construction  # noqa: E402

POLICE = os.path.normpath(os.path.join(ICI, '..', '..', '..', 'public', 'fonts', 'chango-latin.woff2'))   # lue telle quelle
# Les sources que lit la construction (npm run intro:sources) : la Terre (sprite compris), puis les objets posés dessus
SOURCES_TERRE = ('sources.json', 'hauteur.png', 'monde.png', 'europe.png', 'relief-fin.png')
SOURCES_OBJETS = ('reperes.json', 'frontiere.json')


def empreinte(chemins):
    """16 chiffres hexadécimaux du sha256 des fichiers donnés (nom et contenu de chacun, dans l'ordre)."""
    h = hashlib.sha256()
    for chemin in chemins:
        h.update(os.path.basename(chemin).encode() + b'\0')
        with open(chemin, 'rb') as f:
            for bloc in iter(lambda: f.read(1 << 20), b''):
                h.update(bloc)
    return h.hexdigest()[:16]


def scripts():
    """Les scripts qui construisent et règlent la scène : tous les .py de blender/, sauf les essais."""
    return [os.path.join(ICI, f) for f in sorted(os.listdir(ICI)) if f.endswith('.py') and f != 'essais.py']


def preparer_sortie(dossier, reglages, neuf):
    """Crée le dossier de sortie ; refuse d'y mêler des images faites avec d'autres réglages, d'autres clés ou une autre
    scène (sauf --neuf, qui l'efface) : après un changement de matière, d'objet ou de source, rien de périmé n'est repris."""
    fiche = os.path.join(dossier, 'reglages.json')
    if neuf and os.path.isdir(dossier):
        shutil.rmtree(dossier)
    if os.path.exists(fiche):
        with open(fiche, encoding='utf-8') as f:
            avant = json.load(f)
        if avant != reglages:
            ecarts = ', '.join(f'{k} : {avant.get(k)} → {reglages.get(k)}'
                               for k in sorted(set(avant) | set(reglages)) if avant.get(k) != reglages.get(k))
            raise SystemExit(f"[rendre] {dossier} : images faites avec d'autres réglages ({ecarts}) — relancer avec --neuf")
    os.makedirs(dossier, exist_ok=True)
    with open(fiche, 'w', encoding='utf-8') as f:
        json.dump(reglages, f)


def main():
    a = commun.lire_arguments()
    debut = time.time()
    scene = bpy.context.scene
    print(f'[rendre] périphérique : {commun.regler_metal(scene)}', flush=True)
    sources = os.path.join(a.cache, 'sources')
    terre = [os.path.join(sources, s) for s in SOURCES_TERRE]
    if a.mode == 'sprite':
        src = construction.construire(scene, sources, 'sprite', 20)
        commun.regler_cycles(scene, a, construction.SPRITE_COTE, construction.SPRITE_COTE)
        total, sortie = construction.SPRITE_VUES, os.path.join(a.cache, 'frames', 'sprite')
        fiche = {'scene': empreinte(scripts() + terre)}

        def poser(n):
            construction.vue_sprite(scene.camera, n - 1, src)
            scene.frame_set(1)   # frémissement figé : toutes les vues ont la même pâte
    else:
        chemin_cles = os.path.join(a.cache, f'keys-{a.cadrage}.json')
        with open(chemin_cles, encoding='utf-8') as f:
            cles = json.load(f)
        construction.construire(scene, sources, a.mode, cles['fovY'], POLICE)
        commun.regler_cycles(scene, a, cles['width'], cles['height'])
        courbes, absents = anim.cuire(cles)
        if absents:
            raise SystemExit(f'[rendre] pistes sans objet dans la scène ({len(absents)}) : {", ".join(absents)}')
        print(f'[rendre] {courbes} F-curves, {cles["frames"]} images', flush=True)
        total, sortie = cles['frames'], os.path.join(a.cache, 'frames', a.mode, a.cadrage)
        fiche = {'cles': empreinte([chemin_cles]),
                 'scene': empreinte(scripts() + terre + [os.path.join(sources, s) for s in SOURCES_OBJETS] + [POLICE])}
        poser = scene.frame_set
    print(f'[rendre] scène construite en {time.time() - debut:.1f} s', flush=True)
    images = a.images or list(range(1, total + 1))
    hors = [n for n in images if not 1 <= n <= total]
    if hors:
        raise SystemExit(f'[rendre] images hors de 1…{total} : {hors}')
    r = scene.render
    largeur, hauteur = r.resolution_x * r.resolution_percentage // 100, r.resolution_y * r.resolution_percentage // 100
    preparer_sortie(sortie, {'largeur': largeur, 'hauteur': hauteur, 'echantillons': scene.cycles.samples, **fiche}, a.neuf)
    gardees, durees = 0, []
    for n in images:
        chemin = os.path.join(sortie, f'f_{n:04d}.png')
        if commun.image_complete(chemin, largeur, hauteur):
            gardees += 1
            continue
        poser(n)
        r.filepath = chemin
        t = time.time()
        bpy.ops.render.render(write_still=True)
        durees.append(time.time() - t)
        print(f'[rendre] {os.path.basename(chemin)} {largeur}×{hauteur} {durees[-1]:.2f} s', flush=True)
    moyenne = sum(durees) / len(durees) if durees else 0.0
    print(f'[rendre] fini : {len(durees)} images rendues (moyenne {moyenne:.2f} s), {gardees} gardées, '
          f'{time.time() - debut:.1f} s en tout → {sortie}', flush=True)


if __name__ == '__main__':   # lancé par Blender -P ; essais.py l'importe sans rien rendre
    main()
