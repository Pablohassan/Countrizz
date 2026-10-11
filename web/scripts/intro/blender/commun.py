"""
Fabrique de l'intro vidéo (spec intro vidéo §2.3-2.4) : ce que partagent les scripts Blender — arguments, périphérique
Metal, réglages de Cycles par mode, contrôle des images déjà rendues. Lancé par `scripts/intro/blender.ts`, pas à la main :
  Blender -b --factory-startup [--debug-cycles] -P scripts/intro/blender/rendre.py -- --mode apercu --cadrage portrait --cache …
"""
import argparse
import sys

import bpy

MODES = ('temoins', 'apercu', 'rendu')
CADRAGES = ('portrait', 'paysage')
IPS = 120

# Réglages de Cycles par mode : échantillons, seuil adaptatif et minimum d'échantillons (sans minimum explicite,
# l'échantillonnage adaptatif ne s'arrête jamais avant 64 — recon Blender), définition en % du cadrage, flou de mouvement.
# « temoins » = « rendu » : on mesure sur les témoins le temps par image de la nuit de rendu (Task 6 règle ces valeurs).
REGLAGES = {
    'temoins': {'echantillons': 128, 'seuil': 0.02, 'minimum': 16, 'pourcent': 100, 'flou': True},
    'apercu': {'echantillons': 16, 'seuil': 0.05, 'minimum': 8, 'pourcent': 50, 'flou': True},
    'rendu': {'echantillons': 128, 'seuil': 0.02, 'minimum': 16, 'pourcent': 100, 'flou': True},
}


def lire_arguments(argv=None):
    """Arguments après « -- » (Blender garde les siens avant)."""
    argv = sys.argv if argv is None else argv
    p = argparse.ArgumentParser(prog='rendre.py')
    p.add_argument('--mode', choices=MODES, required=True)
    p.add_argument('--cadrage', choices=CADRAGES, default='portrait')
    p.add_argument('--cache', required=True, help='web/scripts/intro/.cache (sources/, keys-<cadrage>.json, frames/)')
    p.add_argument('--images', default='', help='numéros d’image « 1,600,1200 » ; sinon toutes (ou les 24 vues du sprite)')
    p.add_argument('--echelle', type=int, help='définition en % (remplace celle du mode)')
    p.add_argument('--echantillons', type=int, help='échantillons par pixel (remplace ceux du mode)')
    p.add_argument('--neuf', action='store_true', help='efface les images déjà rendues de ce mode et de ce cadrage')
    a = p.parse_args(argv[argv.index('--') + 1:] if '--' in argv else [])
    a.images = [int(x) for x in a.images.split(',') if x.strip()]
    return a


def regler_metal(scene):
    """Cycles sur le GPU du Mac (Metal) ; lève s'il n'y en a pas : un rendu sur le processeur durerait des jours."""
    cp = bpy.context.preferences.addons['cycles'].preferences
    cp.compute_device_type = 'METAL'
    cp.get_devices()
    metal = [d for d in cp.devices if d.type == 'METAL']
    if not metal:
        raise RuntimeError('aucun périphérique Metal : ' + ', '.join(f'{d.name} ({d.type})' for d in cp.devices))
    for d in cp.devices:
        d.use = d.type == 'METAL'
    scene.cycles.device = 'GPU'
    return metal[0].name


def regler_cycles(scene, a, largeur, hauteur):
    """Cycles, sortie PNG RGBA 8 bits sur fond transparent (la nuit est posée à l'encodage), vue « Standard »."""
    r, c, reg = scene.render, scene.cycles, REGLAGES[a.mode]
    r.engine = 'CYCLES'
    r.resolution_x, r.resolution_y = largeur, hauteur
    r.resolution_percentage = a.echelle or reg['pourcent']
    c.samples = a.echantillons or reg['echantillons']
    c.use_adaptive_sampling = True
    c.adaptive_threshold = reg['seuil']
    c.adaptive_min_samples = min(reg['minimum'], c.samples)
    c.use_denoising = True
    c.denoiser = 'OPENIMAGEDENOISE'
    c.denoising_use_gpu = True
    c.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    # la pâte est mate et opaque : peu de rebonds suffisent ; transparence pour les lettres et les étoiles qui s'effacent
    c.max_bounces, c.diffuse_bounces, c.glossy_bounces, c.transmission_bounces = 6, 3, 2, 2
    c.transparent_max_bounces = 8
    c.caustics_reflective = c.caustics_refractive = False
    r.film_transparent = True
    # « Standard » : les couleurs peintes restent les leurs (AgX, le défaut, les délave) ; même nuit que l'accueil
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    r.use_motion_blur = reg['flou']
    r.motion_blur_shutter = 0.5
    r.motion_blur_position = 'CENTER'
    # la géométrie de la Terre est fixe : gardée d'une image à l'autre (sinon reconstruite à chaque image)
    r.use_persistent_data = True
    r.fps, r.fps_base = IPS, 1.0
    im = r.image_settings
    im.file_format = 'PNG'
    im.color_mode = 'RGBA'
    im.color_depth = '8'
    im.compression = 15
    # reprise : rendre.py garde les images entières déjà écrites (image_complete) ; Blender n'écrase rien de lui-même
    r.use_overwrite = False
    r.use_placeholder = False


def image_complete(chemin, largeur, hauteur):
    """Une image déjà rendue est gardée si elle est entière (fin IEND) et à la définition demandée."""
    try:
        with open(chemin, 'rb') as f:
            tete = f.read(24)
            f.seek(-12, 2)
            fin = f.read(12)
    except OSError:
        return False
    return (tete[:8] == b'\x89PNG\r\n\x1a\n' and int.from_bytes(tete[16:20], 'big') == largeur
            and int.from_bytes(tete[20:24], 'big') == hauteur and fin[4:8] == b'IEND')
