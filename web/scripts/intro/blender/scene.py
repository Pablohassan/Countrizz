"""
Scène de l'intro en pâte à modeler, construite par script (spec intro vidéo §2.3) ; référence visuelle : l'ancienne scène
three.js `src/intro/scene.ts`. Tout est en coordonnées three.js (Y en haut) sous l'objet racine `monde` (rotation X +90°) :
les clés de export-keys.ts s'y appliquent telles quelles, seul l'ordre du quaternion change ([w, x, y, z]).
  monde ─ camera ─ cle, contre (lumières liées à la caméra)
        └ ecrasement_rot ─ ecrasement_echelle ─ ecrasement_retour ─ terre_groupe ─ terre
L'écrasement de l'impact est B·S·Bᵀ (B : orientation de la caméra, S : (sx, sy, sx)) : trois Empties en chaîne, sans
décomposer le cisaillement. La géométrie de la Terre est FIXE (rendu à données persistantes) : le relief est dans le
maillage, le relief fin, le frémissement et les empreintes de doigts sont dans la matière (bump).
"""
import json
import math
import os

import bpy
import numpy as np
from bpy_extras import anim_utils
from mathutils import Vector

IPS = 120
# cellules par arête de la cube-sphère : 768 → 3,5 millions de sommets, ~0,12° entre deux sommets (≈ 3 px au gros plan)
SUBDIV = {'temoins': 768, 'apercu': 384, 'rendu': 768}
# pâte « roulée à la main » (scene.ts) : bosses de 0,0022 rayon, ~8° de large
BOSSE_AMP, BOSSE_FREQ = 0.0022, 7.0
# frémissement : ondulation lente et continue de la surface (spec §3.2), dans le bump
FREMIT_AMP, FREMIT_ECHELLE, FREMIT_VITESSE = 0.0009, 5.0, 0.35
# empreintes de doigts : une cellule de Voronoi sur trois (cellules de ~1/3 de rayon) porte une empreinte de 0,12 rayon
# à 12 sillons, visibles au gros plan seulement (un sillon ≈ 17 px), à peine au bump
EMPREINTE_DENSITE, EMPREINTE_RAYON, EMPREINTE_SILLONS, EMPREINTE_AMP = 3.0, 0.36, 12.0, 0.0005


def lin(hexa):
    """Couleur CSS « #rrggbb » (sRGB) → couleur linéaire de la scène, alpha 1."""
    c = [int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


# ---------- petits outils ----------

def vide(nom, parent, quaternion=False):
    """Empty rattaché à la scène et à son parent (inverse de parenté identité : la clé s'applique telle quelle)."""
    ob = bpy.data.objects.new(nom, None)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    if quaternion:
        ob.rotation_mode = 'QUATERNION'
    return ob


def objet(nom, donnees, parent):
    ob = bpy.data.objects.new(nom, donnees)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    return ob


def math_(nt, op, a, b=None, c=None):
    """Nœud Math : a, b, c sont des sorties de nœuds ou des nombres ; rend la sortie."""
    nd = nt.nodes.new('ShaderNodeMath')
    nd.operation = op
    for i, v in enumerate((a, b, c)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            nd.inputs[i].default_value = v
        else:
            nt.links.new(v, nd.inputs[i])
    return nd.outputs[0]


def lisse(nt, x, de, a, vers0=0.0, vers1=1.0):
    """smoothstep(de, a, x) remis sur [vers0, vers1] (Map Range, interpolation SMOOTHSTEP, bornée)."""
    nd = nt.nodes.new('ShaderNodeMapRange')
    nd.interpolation_type = 'SMOOTHSTEP'
    nd.clamp = True
    nt.links.new(x, nd.inputs['Value'])
    nd.inputs['From Min'].default_value, nd.inputs['From Max'].default_value = de, a
    nd.inputs['To Min'].default_value, nd.inputs['To Max'].default_value = vers0, vers1
    return nd.outputs['Result']


def image(nt, chemin, donnees, extension):
    nd = nt.nodes.new('ShaderNodeTexImage')
    nd.image = bpy.data.images.load(chemin, check_existing=True)
    if donnees:
        nd.image.colorspace_settings.name = 'Non-Color'
    nd.interpolation = 'Linear'
    nd.extension = extension
    return nd


def anime_lineaire(socket, par_seconde):
    """Valeur d'entrée de nœud qui croît de `par_seconde` par seconde de la scène (image 1 → 0), sans fin."""
    socket.default_value = 0.0
    socket.keyframe_insert('default_value', frame=1)
    socket.default_value = par_seconde / IPS
    socket.keyframe_insert('default_value', frame=2)
    ad = socket.id_data.animation_data
    for fc in anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot).fcurves:
        fc.keyframe_points.foreach_set('interpolation', [1] * len(fc.keyframe_points))   # 1 = LINEAR
        fc.extrapolation = 'LINEAR'


def pate(nom, couleur, rugosite=0.62, sss_echelle=0.004):
    """Matière « pâte à modeler » (scene.ts : roughness 0.62, sheen 0.45 / 0.7) + diffusion sous la surface légère ;
    l'opacité vient de la couleur de l'objet (Object Info › Alpha), animée par les clés (lettres, étoiles)."""
    mat = bpy.data.materials.new(nom)
    mat.displacement_method = 'BUMP'
    nt = mat.node_tree
    nt.nodes.clear()
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Base Color'].default_value = lin(couleur) if isinstance(couleur, str) else couleur
    p.inputs['Roughness'].default_value = rugosite
    p.inputs['Sheen Weight'].default_value = 0.45
    p.inputs['Sheen Roughness'].default_value = 0.7
    p.inputs['Subsurface Weight'].default_value = 0.12
    p.inputs['Subsurface Radius'].default_value = (1.0, 0.45, 0.25)
    p.inputs['Subsurface Scale'].default_value = sss_echelle
    nt.links.new(nt.nodes.new('ShaderNodeObjectInfo').outputs['Alpha'], p.inputs['Alpha'])
    nt.links.new(p.outputs[0], nt.nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])
    return mat, nt, p


# ---------- la Terre ----------

def cube_sphere(n):
    """Directions unitaires et quadrilatères d'une cube-sphère de n × n cellules par face (sommets des arêtes partagés,
    faces tournées vers l'extérieur). Les cellules restent presque carrées partout : ni pincement aux pôles comme une
    sphère UV, ni la minute d'évaluation que celle-ci coûte (recon Blender)."""
    k = np.arange(n + 1)
    a, b = np.meshgrid(k, k, indexing='ij')
    pts, quads, m = [], [], n + 1
    i, j = np.meshgrid(np.arange(n), np.arange(n), indexing='ij')
    q = np.stack([i * m + j, (i + 1) * m + j, (i + 1) * m + j + 1, i * m + j + 1], axis=-1).reshape(-1, 4)
    for axe in range(3):
        for signe in (-1, 1):
            p = np.empty((m, m, 3), np.int64)
            p[..., axe] = signe * n
            p[..., (axe + 1) % 3] = 2 * a - n
            p[..., (axe + 2) % 3] = 2 * b - n
            quads.append((q if signe > 0 else q[:, ::-1]) + len(pts) * m * m)
            pts.append(p.reshape(-1, 3))
    pts = np.concatenate(pts)
    cote = 2 * n + 1
    uniques, inverse = np.unique(((pts[:, 0] + n) * cote + pts[:, 1] + n) * cote + pts[:, 2] + n, return_inverse=True)
    c = np.stack([uniques // (cote * cote), (uniques // cote) % cote, uniques % cote], axis=-1) - n
    # projection « à angles égaux » : tan(c·π/4) avant normalisation, des cellules de même taille au centre et aux coins
    c = np.tan(c / n * (math.pi / 4))
    return c / np.linalg.norm(c, axis=1, keepdims=True), inverse.reshape(-1)[np.concatenate(quads)]


def lire_gris16(chemin):
    """PNG gris 16 bits → tableau (hauteur, largeur) de 0 à 1, première ligne au nord (Blender range ses pixels du bas)."""
    img = bpy.data.images.load(chemin, check_existing=False)
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[::-1, :, 0].copy()


def echantillon(carte, lng, lat):
    """Lecture bilinéaire d'une carte équirectangulaire (degrés), bouclée en longitude (comme scene.ts)."""
    h, w = carte.shape
    x, y = (lng + 180) / 360 * w - 0.5, (90 - lat) / 180 * h - 0.5
    x0 = np.floor(x).astype(np.int64)
    y0 = np.clip(np.floor(y).astype(np.int64), 0, h - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    fx, fy = x - x0, np.clip(y - y0, 0, 1)
    xa, xb = x0 % w, (x0 + 1) % w
    return (carte[y0, xa] * (1 - fx) + carte[y0, xb] * fx) * (1 - fy) + (carte[y1, xa] * (1 - fx) + carte[y1, xb] * fx) * fy


def bosse(p, graine):
    """Bruit de valeur 3D lissé, de −1 à 1 : le `bruit3` de scene.ts (mêmes constantes de hachage, en entiers 32 bits)."""
    i = np.floor(p).astype(np.int64)
    f = p - i
    s = f * f * (3 - 2 * f)

    def h(dx, dy, dz):
        n = ((i[:, 0] + dx) * 374761393 + (i[:, 1] + dy) * 668265263 + (i[:, 2] + dz) * 2147483647 + graine * 1442695041) & 0xFFFFFFFF
        n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
        return (n ^ (n >> 16)) / 4294967295.0

    def m(a, b, t):
        return a + (b - a) * t

    x, y, z = s[:, 0], s[:, 1], s[:, 2]
    return m(m(m(h(0, 0, 0), h(1, 0, 0), x), m(h(0, 1, 0), h(1, 1, 0), x), y),
             m(m(h(0, 0, 1), h(1, 0, 1), x), m(h(0, 1, 1), h(1, 1, 1), x), y), z) * 2 - 1


def hauteur(carte, src, lng, lat):
    """Hauteur du relief caricaturé (rayons terrestres) : hauteur.png × hauteurMax (sources.json)."""
    return echantillon(carte, lng, lat) * src['hauteurMax']


def maillage_terre(carte, src, n):
    d, quads = cube_sphere(n)
    lng = np.degrees(np.arctan2(-d[:, 2], d[:, 0]))
    lat = np.degrees(np.arcsin(np.clip(d[:, 1], -1, 1)))
    r = 1 + hauteur(carte, src, lng, lat) + BOSSE_AMP * bosse(d * BOSSE_FREQ, 7)
    co = (d * r[:, None]).astype(np.float32)
    me = bpy.data.meshes.new('terre')
    me.vertices.add(len(co))
    me.vertices.foreach_set('co', co.ravel())
    me.loops.add(quads.size)
    me.loops.foreach_set('vertex_index', quads.astype(np.int32).ravel())
    me.polygons.add(len(quads))
    me.polygons.foreach_set('loop_start', np.arange(0, quads.size, 4, dtype=np.int32))
    me.update(calc_edges=True)
    me.shade_smooth()
    return me


def matiere_terre(dossier, src):
    """La peinture du monde, relayée par celle de l'Europe (fondu de 3° sur les bords de sa boîte), lues par la direction
    du point (pas d'UV, pas de couture au 180ᵉ méridien) ; relief fin de l'Europe, frémissement et empreintes en bump."""
    mat, nt, p = pate('pate_terre', (1, 1, 1, 1))
    co = nt.nodes.new('ShaderNodeTexCoord').outputs['Object']   # repère three de la Terre (fixe, avant l'écrasement)
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(co, xyz.inputs[0])
    norme = nt.nodes.new('ShaderNodeVectorMath')
    norme.operation = 'LENGTH'
    nt.links.new(co, norme.inputs[0])
    lon = math_(nt, 'ARCTAN2', math_(nt, 'MULTIPLY', xyz.outputs['Z'], -1.0), xyz.outputs['X'])   # atan2(−z, x)
    lat = math_(nt, 'ARCSINE', math_(nt, 'DIVIDE', xyz.outputs['Y'], norme.outputs['Value']))
    uv = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(math_(nt, 'MULTIPLY_ADD', lon, 1 / (2 * math.pi), 0.5), uv.inputs['X'])
    nt.links.new(math_(nt, 'MULTIPLY_ADD', lat, 1 / math.pi, 0.5), uv.inputs['Y'])
    monde = image(nt, os.path.join(dossier, 'monde.png'), False, 'REPEAT')
    nt.links.new(uv.outputs[0], monde.inputs['Vector'])
    # la boîte de l'Europe, en degrés
    E = src['europe']
    lng_d, lat_d = math_(nt, 'DEGREES', lon), math_(nt, 'DEGREES', lat)
    uve = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(math_(nt, 'MULTIPLY_ADD', lng_d, 1 / (E['lng1'] - E['lng0']), -E['lng0'] / (E['lng1'] - E['lng0'])), uve.inputs['X'])
    nt.links.new(math_(nt, 'MULTIPLY_ADD', lat_d, 1 / (E['lat1'] - E['lat0']), -E['lat0'] / (E['lat1'] - E['lat0'])), uve.inputs['Y'])
    europe = image(nt, os.path.join(dossier, 'europe.png'), False, 'EXTEND')
    nt.links.new(uve.outputs[0], europe.inputs['Vector'])
    bord = math_(nt, 'MINIMUM', math_(nt, 'MINIMUM', math_(nt, 'SUBTRACT', lng_d, E['lng0']), math_(nt, 'SUBTRACT', E['lng1'], lng_d)),
                 math_(nt, 'MINIMUM', math_(nt, 'SUBTRACT', lat_d, E['lat0']), math_(nt, 'SUBTRACT', E['lat1'], lat_d)))
    poids = lisse(nt, bord, 0.0, 3.0)
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(poids, mix.inputs['Factor'])
    nt.links.new(monde.outputs['Color'], mix.inputs['A'])
    nt.links.new(europe.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])
    # relief fin (rayons terrestres) : codé 0,5 + 0,5·tanh(h / S) → h = S·atanh(2v − 1), nul hors de la boîte
    rf = image(nt, os.path.join(dossier, 'relief-fin.png'), True, 'EXTEND')
    nt.links.new(uve.outputs[0], rf.inputs['Vector'])
    x = math_(nt, 'MINIMUM', math_(nt, 'MAXIMUM', math_(nt, 'MULTIPLY_ADD', rf.outputs['Color'], 2.0, -1.0), -0.999), 0.999)
    atanh = math_(nt, 'MULTIPLY', math_(nt, 'LOGARITHM', math_(nt, 'DIVIDE', math_(nt, 'ADD', x, 1.0), math_(nt, 'SUBTRACT', 1.0, x)), math.e), 0.5)
    relief = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', atanh, src['reliefFinS']), poids)
    # frémissement : bruit 4D dont la 4ᵉ dimension avance avec le temps de la scène
    fremit = nt.nodes.new('ShaderNodeTexNoise')
    fremit.noise_dimensions = '4D'
    fremit.name = 'fremissement'
    nt.links.new(co, fremit.inputs['Vector'])
    fremit.inputs['Scale'].default_value = FREMIT_ECHELLE
    fremit.inputs['Detail'].default_value = 2.0
    anime_lineaire(fremit.inputs['W'], FREMIT_VITESSE)
    onde = math_(nt, 'MULTIPLY', math_(nt, 'SUBTRACT', fremit.outputs['Fac'], 0.5), FREMIT_AMP)
    # empreintes de doigts : sillons concentriques (un peu tordus) autour des germes d'un Voronoi, une cellule sur trois
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    nt.links.new(co, vor.inputs['Vector'])
    vor.inputs['Scale'].default_value = EMPREINTE_DENSITE
    tord = nt.nodes.new('ShaderNodeTexNoise')
    nt.links.new(co, tord.inputs['Vector'])
    tord.inputs['Scale'].default_value = 60.0
    d = math_(nt, 'MULTIPLY_ADD', tord.outputs['Fac'], 0.03, vor.outputs['Distance'])
    sillons = math_(nt, 'SINE', math_(nt, 'MULTIPLY', d, 2 * math.pi * EMPREINTE_SILLONS / EMPREINTE_RAYON))
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(vor.outputs['Color'], sep.inputs[0])
    presente = math_(nt, 'GREATER_THAN', sep.outputs[0], 0.66)
    masque = math_(nt, 'MULTIPLY', lisse(nt, d, 0.55 * EMPREINTE_RAYON, EMPREINTE_RAYON, 1.0, 0.0), presente)
    empreinte = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', sillons, masque), EMPREINTE_AMP)
    bump = nt.nodes.new('ShaderNodeBump')
    nt.links.new(math_(nt, 'ADD', math_(nt, 'ADD', relief, onde), empreinte), bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return mat


# ---------- caméra, lumières, ambiance ----------

def camera(scene, monde, fov):
    """Caméra de la chronologie : champ VERTICAL de `fov` degrés (comme three), regarde son −Z local, Y en haut."""
    cd = bpy.data.cameras.new('camera')
    cd.sensor_fit = 'VERTICAL'
    cd.angle_y = math.radians(fov)
    cd.clip_start, cd.clip_end = 0.05, 3000.0
    cam = objet('camera', cd, monde)
    cam.rotation_mode = 'QUATERNION'
    scene.camera = cam
    return cam


def lumieres(cam):
    """La clé chaude en haut à gauche de l'image (ombres), le contre-jour derrière (scene.ts : 2,7 et 1,5), toutes deux
    liées à la caméra. Un soleil éclaire le long de son −Z : son +Z vise la lumière."""
    for nom, couleur, force, direction, ombre in (('cle', '#ffe9cc', 2.7, (-0.55, 0.62, 0.78), True),
                                                  ('contre', '#9cc8ff', 1.5, (3.0, 1.4, -4.0), False)):
        ld = bpy.data.lights.new(nom, 'SUN')
        ld.color = lin(couleur)[:3]
        ld.energy = force
        ld.angle = math.radians(2.0)
        ld.use_shadow = ombre
        ob = objet(nom, ld, cam)
        ob.rotation_mode = 'QUATERNION'
        ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized())


def ambiance(scene):
    """Lumière d'ambiance douce (l'hémisphère et le RoomEnvironment de scene.ts) : claire au-dessus de l'image, violette
    en dessous, prise en repère CAMÉRA comme la clé et le contre-jour. Le fond reste transparent (film)."""
    w = bpy.data.worlds.new('ambiance')
    scene.world = w
    nt = w.node_tree
    nt.nodes.clear()
    vt = nt.nodes.new('ShaderNodeVectorTransform')
    vt.vector_type, vt.convert_from, vt.convert_to = 'VECTOR', 'WORLD', 'CAMERA'
    nt.links.new(nt.nodes.new('ShaderNodeTexCoord').outputs['Generated'], vt.inputs[0])
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(vt.outputs[0], xyz.inputs[0])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(lisse(nt, xyz.outputs['Y'], -1.0, 1.0), mix.inputs['Factor'])
    mix.inputs['A'].default_value = lin('#2a2350')
    mix.inputs['B'].default_value = lin('#e6eeff')
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = 0.35
    nt.links.new(mix.outputs['Result'], bg.inputs['Color'])
    nt.links.new(bg.outputs[0], nt.nodes.new('ShaderNodeOutputWorld').inputs['Surface'])


# ---------- la scène ----------

def lire_json(dossier, nom):
    with open(os.path.join(dossier, nom), encoding='utf-8') as f:
        return json.load(f)


def construire(scene, dossier, mode, fov):
    """Vide la scène de démarrage et construit le socle : racine, caméra, lumières, ambiance, écrasement, Terre. Les
    objets animés portent les noms des pistes de keys-<cadrage>.json (anim.py)."""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    src = lire_json(dossier, 'sources.json')
    carte = lire_gris16(os.path.join(dossier, 'hauteur.png'))
    monde = vide('monde', None)
    monde.rotation_euler = (math.pi / 2, 0.0, 0.0)   # three (Y en haut) → Blender (Z en haut)
    cam = camera(scene, monde, fov)
    lumieres(cam)
    ambiance(scene)
    ecrasement = vide('ecrasement_retour', vide('ecrasement_echelle', vide('ecrasement_rot', monde, True)), True)
    groupe = vide('terre_groupe', ecrasement)
    me = maillage_terre(carte, src, SUBDIV[mode])
    me.materials.append(matiere_terre(dossier, src))
    objet('terre', me, groupe)
