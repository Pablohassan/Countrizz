"""
Scène de l'intro en pâte à modeler, construite par script (spec intro vidéo §2.3) ; référence visuelle : l'ancienne scène
three.js `src/intro/scene.ts`. Tout est en coordonnées three.js (Y en haut) sous l'objet racine `monde` (rotation X +90°) :
les clés de export-keys.ts s'y appliquent telles quelles, seul l'ordre du quaternion change ([w, x, y, z]).
  monde ─ camera ─ cle, contre (lumières liées à la caméra) ; etoile_00…45, logo_00…07, titre_00…07 (plan de l'image)
        └ ecrasement_rot ─ ecrasement_echelle ─ ecrasement_retour ─ terre_groupe ─ terre, nuages, frontiere, perle,
          repere (point, drapeau)
L'écrasement de l'impact est B·S·Bᵀ (B : orientation de la caméra, S : (sx, sy, sx)) : trois Empties en chaîne, sans
décomposer le cisaillement. La géométrie de la Terre est FIXE (rendu à données persistantes) : le relief est dans le
maillage, le relief fin, le frémissement et les empreintes de doigts sont dans la matière (bump).
"""
import json
import math
import os

import bmesh
import bpy
import numpy as np
from bpy_extras import anim_utils
from mathutils import Matrix, Quaternion, Vector

IPS = 120
# cellules par arête de la cube-sphère : 768 → 3,5 millions de sommets, ~0,12° entre deux sommets (≈ 3 px au gros plan)
SUBDIV = {'temoins': 768, 'apercu': 384, 'rendu': 768, 'sprite': 384}
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


# ---------- les objets posés sur la Terre (scene.ts l.148-188) ----------

MAT_HM = 0.135   # hauteur du mât (timeline.ts)
NUAGES = ((-35, 22, 1), (75, -12, 0.85), (160, 42, 0.9), (-120, -32, 0.8), (30, -45, 0.7), (-80, 52, 0.75), (110, 10, 0.8))
BOULES = ((0, 0, 0, 0.07), (0.075, -0.01, 0.01, 0.052), (-0.075, -0.012, 0, 0.048), (0.025, 0.04, 0, 0.05))
TOILE_L, TOILE_H, TOILE_E = 0.088, 0.058, 0.0042
TOILE_COLONNES = 30   # multiple de 3 : les trois bandes tombent sur des arêtes, aux couleurs nettes
FRONTIERE_RAYON = 0.0026


def vers(lng, lat, r=1.0):
    """lng/lat (°) → point du repère three (lng 0 → +X, lng 90 → −Z, pôle Nord → +Y), comme toVec de geo/vec.ts."""
    l, p = math.radians(lng), math.radians(lat)
    return Vector((math.cos(p) * math.cos(l) * r, math.sin(p) * r, -math.cos(p) * math.sin(l) * r))


def boule(nom, mat, rayon=1.0):
    """Sphère lisse 40 × 28 (la SphereGeometry de scene.ts), centrée, de rayon `rayon`."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=28, radius=rayon)
    me = bpy.data.meshes.new(nom)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    me.materials.append(mat)
    return me


def nuages(groupe):
    """Sept nuages de quatre boules à 1,24 rayon ; `nuages` tourne sur l'axe des pôles et rétrécit (clés)."""
    mat = pate('pate_nuage', '#ffffff', rugosite=0.75)[0]
    me = boule('boule_nuage', mat)
    tout = vide('nuages', groupe)
    for k, (lng, lat, s) in enumerate(NUAGES):
        d = vers(lng, lat)
        g = vide(f'nuage_{k}', tout, True)
        g.location = d * 1.24
        g.rotation_quaternion = Vector((0, 1, 0)).rotation_difference(d)
        g.scale = (s, s, s)
        for j, (x, y, z, r) in enumerate(BOULES):
            b = objet(f'nuage_{k}_{j}', me, g)
            b.location = (x, y, z)
            b.scale = (r * 1.15, r * 0.9, r)


def ondulation(L):
    """Geometry Nodes : la toile ondule avec le temps de la scène (scene.ts l.251) — z += 0,009·u·sin(6,5u − 6,5t),
    y −= 0,004·u², u = (x − 0,003) / L, t = (image − 1) / 120. Évalué aussi entre deux images (flou de mouvement)."""
    ng = bpy.data.node_groups.new('ondulation', 'GeometryNodeTree')
    ng.interface.new_socket(name='Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket(name='Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    entree, sortie = ng.nodes.new('NodeGroupInput'), ng.nodes.new('NodeGroupOutput')
    pos = ng.nodes.new('GeometryNodeSetPosition')
    ng.links.new(entree.outputs['Geometry'], pos.inputs['Geometry'])
    ng.links.new(pos.outputs['Geometry'], sortie.inputs['Geometry'])
    xyz = ng.nodes.new('ShaderNodeSeparateXYZ')
    ng.links.new(ng.nodes.new('GeometryNodeInputPosition').outputs['Position'], xyz.inputs[0])
    u = math_(ng, 'MULTIPLY', math_(ng, 'SUBTRACT', xyz.outputs['X'], 0.003), 1 / L)
    t = math_(ng, 'MULTIPLY', math_(ng, 'SUBTRACT', ng.nodes.new('GeometryNodeInputSceneTime').outputs['Frame'], 1.0), 1 / IPS)
    vague = math_(ng, 'SINE', math_(ng, 'MULTIPLY', math_(ng, 'SUBTRACT', u, t), 6.5))
    decal = ng.nodes.new('ShaderNodeCombineXYZ')
    ng.links.new(math_(ng, 'MULTIPLY', math_(ng, 'MULTIPLY', u, u), -0.004), decal.inputs['Y'])
    ng.links.new(math_(ng, 'MULTIPLY', math_(ng, 'MULTIPLY', u, vague), 0.009), decal.inputs['Z'])
    ng.links.new(decal.outputs[0], pos.inputs['Offset'])
    return ng


def toile():
    """Le drapeau tricolore : une grille de 30 × 4 cellules (x de 0,003 à 0,003 + L), couleurs par face (bleu, blanc,
    rouge), ondulée (Geometry Nodes) puis épaissie de 0,0042 (Solidify) — la boîte de scene.ts l.172-179."""
    nx, ny = TOILE_COLONNES, 4
    x = 0.003 + np.linspace(0, TOILE_L, nx + 1)
    y = np.linspace(-TOILE_H / 2, TOILE_H / 2, ny + 1)
    gx, gy = np.meshgrid(x, y, indexing='ij')
    co = np.stack([gx, gy, np.zeros_like(gx)], axis=-1).reshape(-1, 3).astype(np.float32)
    i, j = np.meshgrid(np.arange(nx), np.arange(ny), indexing='ij')
    q = np.stack([i * (ny + 1) + j, (i + 1) * (ny + 1) + j, (i + 1) * (ny + 1) + j + 1, i * (ny + 1) + j + 1], axis=-1).reshape(-1, 4)
    me = bpy.data.meshes.new('toile')
    me.vertices.add(len(co))
    me.vertices.foreach_set('co', co.ravel())
    me.loops.add(q.size)
    me.loops.foreach_set('vertex_index', q.astype(np.int32).ravel())
    me.polygons.add(len(q))
    me.polygons.foreach_set('loop_start', np.arange(0, q.size, 4, dtype=np.int32))
    me.update(calc_edges=True)
    me.shade_smooth()
    bandes = [lin('#2b55c9'), lin('#fff8ec'), lin('#e8413a')]
    attr = me.color_attributes.new('couleur', 'FLOAT_COLOR', 'CORNER')
    attr.data.foreach_set('color', np.repeat([bandes[c * 3 // nx] for c in i.ravel()], 4, axis=0).astype(np.float32).ravel())
    mat, nt, p = pate('pate_toile', '#ffffff')
    ca = nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'couleur'
    nt.links.new(ca.outputs['Color'], p.inputs['Base Color'])
    me.materials.append(mat)
    return me


def drapeau(rep):
    """Mât, tête et toile (scene.ts l.169-179), sous `drapeau` : sa position, son orientation (penché de −22°, tourné
    vers la caméra) et son échelle (sx, sy, sx) sont des clés (export-keys.ts)."""
    dr = vide('drapeau', rep, True)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=16, radius1=0.0034, radius2=0.0026, depth=MAT_HM)
    bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(-math.pi / 2, 3, 'X'))   # axe Z de bmesh → axe Y de three
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0.0, MAT_HM / 2, 0.0))
    me = bpy.data.meshes.new('mat')
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    me.materials.append(pate('pate_mat', '#fff8ec')[0])
    objet('mat', me, dr)
    tete = objet('tete', boule('boule_tete', pate('pate_tete', '#f7dc6f')[0], 0.0062), dr)
    tete.location = (0.0, MAT_HM + 0.002, 0.0)
    t = objet('toile', toile(), dr)
    t.location = (0.0, MAT_HM - TOILE_H / 2 - 0.004, 0.0)
    t.modifiers.new('ondulation', 'NODES').node_group = ondulation(TOILE_L)
    epais = t.modifiers.new('epaisseur', 'SOLIDIFY')
    epais.thickness, epais.offset = TOILE_E, 0.0


def repere(groupe, reperes):
    """Le repère posé à Paris (reperes.json, sur la surface déplacée ; position, orientation et échelle × 1,6 : clés), le
    point rouge (sphère de rayon 1 : position et échelle sont des clés) et le drapeau."""
    rep = vide('repere', groupe, True)
    rep.location = reperes['paris']
    rep.rotation_quaternion = Vector((0, 1, 0)).rotation_difference(Vector(reperes['paris']).normalized())
    objet('point', boule('boule_point', pate('pate_point', '#e8413a', rugosite=0.5)[0]), rep)
    drapeau(rep)


def frontiere(groupe, points):
    """Le boudin jaune de la frontière : une spline POLY OUVERTE par les 2601 points de frontiere.json (les sommets du
    TubeGeometry de scene.ts, le dernier = le premier), bevel rond rapporté à l'INDICE des points ('RESOLUTION') :
    bevel_factor_end = border arrête le boudin à l'indice border·2600, comme three (Task 3). Sur une spline cyclique,
    bevel_factor serait sans effet. La perle, sphère de rayon 1 : position (sur la frontière) et échelle sont des clés."""
    co = np.asarray(points, dtype=np.float32)
    cu = bpy.data.curves.new('frontiere', 'CURVE')
    cu.dimensions = '3D'
    cu.twist_mode = 'MINIMUM'
    cu.bevel_mode = 'ROUND'
    cu.bevel_depth, cu.bevel_resolution = FRONTIERE_RAYON, 3
    cu.use_fill_caps = True
    cu.bevel_factor_mapping_start = cu.bevel_factor_mapping_end = 'RESOLUTION'
    sp = cu.splines.new('POLY')
    sp.points.add(len(co) - 1)
    sp.points.foreach_set('co', np.hstack([co, np.ones((len(co), 1), dtype=np.float32)]).ravel())
    mat = pate('pate_frontiere', '#f7dc6f', rugosite=0.5)[0]
    cu.materials.append(mat)
    objet('frontiere', cu, groupe)
    objet('perle', boule('boule_perle', mat), groupe)


# ---------- les objets du plan de l'image : étoiles, lettres (enfants de la caméra, posés par les clés) ----------

ETOILES = 46
LOGO_LETTRES = ('C', 'u', 'n', 't', 'r', 'i', 'z', 'z')
# Les clés comptent 1 unité = 1 em (police · unités/px · échelle, export-keys.ts). Chango (hhea) : ascendante 995,
# descendante 216 pour 1000 unités par em, et Blender met ascendante + descendante à 1 unité à la taille 1 (mesuré :
# « C » haut de 0,6135 au lieu de 0,743) : taille 1,211. Calage CENTER/CENTER : l'origine est le milieu de la boîte de
# la lettre dans la page (avance × hauteur de contenu), le centre mesuré de cadrages.ts.
TAILLE_EM = (995 + 216) / 1000
# Face avant, éclairage « B » (choisi le 13/10, lettres-lumiere-report.md) : des lettres bombées, éclairées par le même
# soleil que la Terre (la clé), reflet satiné, ombre de marque gardée. Peu de lumière propre (0,06 au lieu de 0,25) : le
# jaune vient du soleil, d'où une couleur de base linéaire au-delà de 1 (avec une base plafonnée à 1, la face est terne) ;
# Cycles la prend telle quelle. Un vernis (coat) donne le satiné.
LETTRE_BASE = (1.33, 1.11, 0.215, 1.0)   # linéaire, pas un hexa
LETTRE_LUEUR = 0.06
LETTRE_RUGOSITE, LETTRE_SPECULAIRE = 0.4, 0.5
LETTRE_VERNIS, LETTRE_VERNIS_RUGOSITE = 0.5, 0.25
# Arrondi des arêtes à l'ombrage (nœud Bevel de Cycles, sans toucher au maillage), rayon en em
LETTRE_ARRONDI, LETTRE_ARRONDI_ECHANTILLONS = 0.05, 8
# Bombé de la face avant : normale + LETTRE_BOMBE / LETTRE_BOMBE_RAYON · (position − centre)ₓᵧ, la même pente pour toutes
# les lettres ; le haut-gauche se tourne vers la clé, le bas-droit s'en détourne. Centre : celui de l'emprise de la face
# avant (attribut de sommet `centre_bombe`), le « i » compris avec son point d'origine, comme B.
LETTRE_BOMBE, LETTRE_BOMBE_RAYON = 0.3, 0.35
LETTRE_RELIEF, LETTRE_BISEAU = 0.09, 0.02   # en em ; un biseau de 0,03 em vide la face avant du « z »
# Volume : la lettre est cisaillée, face avant fixe, et son dos glisse de LETTRE_BIAIS em vers le bas-gauche, dans la
# direction de l'ombre de marque ; ses flancs (faces |normale.z| < 0,5) prennent une pâte plus sombre, plus chaude et
# moins lumineuse : ≈ 0,62 × #f7dc6f (#998845) tiré vers l'orangé, lueur 0,08 (sans éclairage B).
LETTRE_BIAIS = 0.06
FLANC_COULEUR, FLANC_LUEUR = '#a07a30', 0.08
# Ombre de marque : --ombre-titre (theme.css:24, « -6px 4px 2px rgb(11, 13, 15) » sur 54 px) en em, +y en haut ; une
# copie plate du glyphe, nette (sans le flou de 2 px), posée OMBRE_RECUL em derrière le dos de la lettre, opaque comme en CSS.
OMBRE_DECALAGE = (-6 / 54, -4 / 54)
OMBRE_RECUL = 0.01
OMBRE_COULEUR, OMBRE_OPACITE = '#0b0d0f', 1.0
# Le point du « i » est une boule (13/10) : le « i » est fait du « ı » sans point (U+0131, dans Chango : même avance, même
# fût, même calage CENTER/CENTER que le « i », point à point — essai) et d'une sphère de POINT_I_DIAMETRE em, centrée en x
# sur le centre de l'emprise du point de la police, son bas posé sur le bas du point (l'écart de 0,029 em au fût de la
# police est gardé ; au fût en relief, biseau cisaillé compris, il reste 0,032 em — essai), au milieu de l'épaisseur
# (z = 0 : l'avant de la boule, à +0,1495 em, dépasse la face avant, à +0,11, de 0,0395 em). Ni cisaillée ni bombée :
# elle est ronde d'elle-même. Son ombre de marque : un disque plat du même rayon.
# Diamètre : 0,23 × 1,3 = 0,299 em. La boule de 0,23 (le point de la police fait 0,284 × 0,207 em) paraissait trop petite
# pour le corps de la lettre (l'utilisateur, 13/10) : agrandie de 30 %, le bas posé au même endroit, elle grandit vers le
# haut (centre +0,0345 em) et reste plus étroite que la face avant du fût (0,283 em).
POINT_I_FUT = '\u0131'   # « ı »
POINT_I_DIAMETRE = 0.299
# méridiens × parallèles : le contour vu de face (l'équateur, 64 côtés) s'écarte du cercle de 0,18 px pour 300 px de haut
POINT_I_SEGMENTS = (64, 32)


def etoiles(cam):
    """46 billes de pâte jaune (le fond étoilé d'Intro.tsx), légèrement lumineuses : elles ne s'éteignent pas dans
    l'ombre de la Terre. Ni ombre portée ; position, échelle et opacité : clés."""
    mat, nt, p = pate('pate_etoile', '#f7dc6f', rugosite=0.5, sss_echelle=0.0)
    p.inputs['Emission Color'].default_value = lin('#f7dc6f')
    p.inputs['Emission Strength'].default_value = 0.6
    me = boule('boule_etoile', mat)
    for i in range(ETOILES):
        e = objet(f'etoile_{i:02d}', me, cam)
        e.visible_shadow = False
        e.scale = (0.0, 0.0, 0.0)


def glyphe(c, police, relief):
    """Le glyphe `c` en maillage (Chango, 1 unité = 1 em, calé CENTER/CENTER), tiré d'une courbe FONT temporaire évaluée
    puis supprimée. En relief : extrusion LETTRE_RELIEF des deux côtés, biseau rond LETTRE_BISEAU, contour gardé
    (offset = −biseau), de z = −0,11 à +0,11 em. À plat : la seule face du glyphe, en z = 0."""
    cu = bpy.data.curves.new('glyphe', 'FONT')
    cu.body, cu.font, cu.size = c, police, TAILLE_EM
    cu.align_x, cu.align_y = 'CENTER', 'CENTER'
    if relief:
        cu.extrude = LETTRE_RELIEF
        cu.bevel_depth, cu.bevel_resolution, cu.offset = LETTRE_BISEAU, 3, -LETTRE_BISEAU
    ob = bpy.data.objects.new('glyphe', cu)
    bpy.context.scene.collection.objects.link(ob)
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    return me


def sommets_de(me):
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def centre_face_avant(co):
    """Centre (x, y, 0) de l'emprise de la face avant (les sommets à z = zf, le haut du relief) : le centre du bombé."""
    avant = co[co[:, 2] > co[:, 2].max() - 1e-4]
    return ((avant[:, 0].min() + avant[:, 0].max()) / 2, (avant[:, 1].min() + avant[:, 1].max()) / 2, 0.0)


def point_du_i(police):
    """Le point du « i » de la police, mesuré sur les conversions de Blender : l'emprise (x0, y0, x1, y1) des sommets du
    « i » à plat au-dessus du fût (le « ı » à plat), et le centre de la face avant du « i » entier en relief (celui de B)."""
    i, fut, relief = (glyphe(c, police, r) for c, r in (('i', False), (POINT_I_FUT, False), ('i', True)))
    co_i, haut, centre = sommets_de(i), sommets_de(fut)[:, 1].max(), centre_face_avant(sommets_de(relief))
    for me in (i, fut, relief):
        bpy.data.meshes.remove(me)
    point = co_i[co_i[:, 1] > haut + 1e-6]
    return (*point[:, :2].min(axis=0), *point[:, :2].max(axis=0)), centre


def poser_boule(me, point, dos):
    """Ajoute au maillage du « ı » la boule du point (matière 3, faces lissées) et son ombre, un disque plat (matière 2) :
    rayon POINT_I_DIAMETRE / 2, centre (milieu du point en x, bas du point + rayon, 0) ; disque au même centre
    + OMBRE_DECALAGE, à la profondeur du reste de l'ombre (dos − OMBRE_RECUL), tourné vers l'avant comme le glyphe plat."""
    x0, y0, x1, _ = point
    r = POINT_I_DIAMETRE / 2
    cx, cy = (x0 + x1) / 2, y0 + r
    u, v = POINT_I_SEGMENTS
    bm = bmesh.new()
    bm.from_mesh(me)
    boule = bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r, matrix=Matrix.Translation((cx, cy, 0.0)))
    for f in {f for s in boule['verts'] for f in s.link_faces}:
        f.material_index, f.smooth = 3, True
    disque = bmesh.ops.create_circle(bm, cap_ends=True, cap_tris=True, segments=u, radius=r, matrix=Matrix.Translation(
        (cx + OMBRE_DECALAGE[0], cy + OMBRE_DECALAGE[1], dos - OMBRE_RECUL)))
    for f in {f for s in disque['verts'] for f in s.link_faces}:
        f.material_index, f.smooth = 2, False
    bm.to_mesh(me)
    bm.free()


def lettre_en_pate(nom, c, police, matieres):
    """Une lettre en UN maillage à quatre emplacements de matière (pâte, flanc, ombre, boule du « i »). La lettre en
    relief est cisaillée, x += kx·(zf − z), y += ky·(zf − z) : sa face avant (zf) ne bouge pas, elle reste calée sur le
    titre HTML, et son dos glisse de LETTRE_BIAIS em vers le bas-gauche. Suit la copie plate du glyphe, décalée de
    OMBRE_DECALAGE et posée OMBRE_RECUL derrière le dos : dans le même maillage, l'ombre suit les clés de la lettre
    (position, échelle, opacité, flou de mouvement) sans objet ni piste de plus. Le « i » est fait du « ı » sans point,
    puis reçoit sa boule et le disque de son ombre (poser_boule). Chaque sommet porte `centre_bombe`, le centre du bombé."""
    forme = POINT_I_FUT if c == 'i' else c
    relief, plat = glyphe(forme, police, True), glyphe(forme, police, False)
    nv, nf = len(relief.vertices), len(relief.polygons)
    bm = bmesh.new()
    bm.from_mesh(relief)
    bm.from_mesh(plat)   # à la suite : les sommets et les faces de l'ombre viennent après ceux de la lettre
    me = bpy.data.meshes.new(nom)
    bm.to_mesh(me)
    bm.free()
    bpy.data.meshes.remove(relief)
    bpy.data.meshes.remove(plat)
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    lettre, ombre = co[:nv], co[nv:]
    zf, dos = lettre[:, 2].max(), lettre[:, 2].min()
    u = np.array(OMBRE_DECALAGE) / np.linalg.norm(OMBRE_DECALAGE)   # bas-gauche : (−0,832 ; −0,555)
    lettre[:, :2] += np.outer(zf - lettre[:, 2], LETTRE_BIAIS * u / (zf - dos))
    ombre[:, :2] += OMBRE_DECALAGE
    ombre[:, 2] = dos - OMBRE_RECUL
    me.vertices.foreach_set('co', co.ravel())
    me.update()
    n = np.empty(len(me.polygons) * 3, np.float32)
    me.polygons.foreach_get('normal', n)
    indice = np.where(np.abs(n[2::3]) < 0.5, 1, 0).astype(np.int32)   # 1 : flanc
    indice[nf:] = 2                                                    # 2 : ombre
    me.polygons.foreach_set('material_index', indice)
    if c == 'i':
        point, centre = point_du_i(police)
        poser_boule(me, point, dos)
    else:
        centre = centre_face_avant(lettre)
    at = me.attributes.new('centre_bombe', 'FLOAT_VECTOR', 'POINT')
    at.data.foreach_set('vector', np.tile(np.array(centre, np.float32), len(me.vertices)))
    for m in matieres:
        me.materials.append(m)
    return me


def ombre_lettre():
    """L'ombre de marque : émission lin(OMBRE_COULEUR) de force 1 (le #0b0d0f exact en vue « Standard »), mêlée à du
    transparent selon Object Info › Alpha × OMBRE_OPACITE, pour qu'elle s'efface avec la lettre. Hors de l'arbre de
    lumières (emission_sampling NONE) : elle n'éclaire rien et l'échantillonnage des lumières ne change pas."""
    mat = bpy.data.materials.new('ombre_lettre')
    mat.cycles.emission_sampling = 'NONE'
    nt = mat.node_tree
    nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = lin(OMBRE_COULEUR)
    em.inputs['Strength'].default_value = 1.0
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(math_(nt, 'MULTIPLY', nt.nodes.new('ShaderNodeObjectInfo').outputs['Alpha'], OMBRE_OPACITE), mix.inputs['Fac'])
    nt.links.new(nt.nodes.new('ShaderNodeBsdfTransparent').outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], nt.nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])
    return mat


def pate_satinee(nom):
    """La pâte jaune des lettres, éclairage B : pate() (rugosité LETTRE_RUGOSITE) + vernis, spéculaire, couleur de base
    LETTRE_BASE et un peu de lumière propre (LETTRE_LUEUR) de la couleur du titre HTML (#f7dc6f)."""
    mat, nt, p = pate(nom, LETTRE_BASE, rugosite=LETTRE_RUGOSITE, sss_echelle=0.0008)
    p.inputs['Emission Color'].default_value = lin('#f7dc6f')
    p.inputs['Emission Strength'].default_value = LETTRE_LUEUR
    p.inputs['Coat Weight'].default_value = LETTRE_VERNIS
    p.inputs['Coat Roughness'].default_value = LETTRE_VERNIS_RUGOSITE
    p.inputs['Specular IOR Level'].default_value = LETTRE_SPECULAIRE
    return mat, nt, p


def arrondi_bombe(nt, p):
    """Normale de la face des lettres, branchée sur Normal ET Coat Normal : le nœud Bevel (LETTRE_ARRONDI em × l'échelle
    de l'objet, animée par les clés : la longueur de (1, 0, 0) objet → monde), puis le bombé, en repère objet :
    n + w · LETTRE_BOMBE / LETTRE_BOMBE_RAYON · (position − centre_bombe)ₓᵧ, renormalisée, remise en monde ;
    w = smoothstep(0,6 ; 0,95 ; normale_objet.z) : 1 sur la face avant, 0 sur le biseau et les parois."""
    un = nt.nodes.new('ShaderNodeCombineXYZ')
    un.inputs['X'].default_value = 1.0
    echelle = nt.nodes.new('ShaderNodeVectorTransform')
    echelle.vector_type, echelle.convert_from, echelle.convert_to = 'VECTOR', 'OBJECT', 'WORLD'
    nt.links.new(un.outputs[0], echelle.inputs[0])
    longueur = nt.nodes.new('ShaderNodeVectorMath')
    longueur.operation = 'LENGTH'
    nt.links.new(echelle.outputs[0], longueur.inputs[0])
    bevel = nt.nodes.new('ShaderNodeBevel')
    bevel.samples = LETTRE_ARRONDI_ECHANTILLONS
    nt.links.new(math_(nt, 'MULTIPLY', longueur.outputs['Value'], LETTRE_ARRONDI), bevel.inputs['Radius'])
    vers_objet = nt.nodes.new('ShaderNodeVectorTransform')
    vers_objet.vector_type, vers_objet.convert_from, vers_objet.convert_to = 'NORMAL', 'WORLD', 'OBJECT'
    nt.links.new(bevel.outputs['Normal'], vers_objet.inputs[0])
    tc = nt.nodes.new('ShaderNodeTexCoord')
    centre = nt.nodes.new('ShaderNodeAttribute')
    centre.attribute_type, centre.attribute_name = 'GEOMETRY', 'centre_bombe'
    rel = nt.nodes.new('ShaderNodeVectorMath')
    rel.operation = 'SUBTRACT'
    nt.links.new(tc.outputs['Object'], rel.inputs[0])
    nt.links.new(centre.outputs['Vector'], rel.inputs[1])
    plat = nt.nodes.new('ShaderNodeVectorMath')   # (x, y, 0)
    plat.operation = 'MULTIPLY'
    nt.links.new(rel.outputs[0], plat.inputs[0])
    plat.inputs[1].default_value = (1.0, 1.0, 0.0)
    nz = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Normal'], nz.inputs[0])
    pente = math_(nt, 'MULTIPLY', lisse(nt, nz.outputs['Z'], 0.6, 0.95), LETTRE_BOMBE / LETTRE_BOMBE_RAYON)
    incl = nt.nodes.new('ShaderNodeVectorMath')
    incl.operation = 'SCALE'
    nt.links.new(plat.outputs[0], incl.inputs[0])
    nt.links.new(pente, incl.inputs['Scale'])
    somme = nt.nodes.new('ShaderNodeVectorMath')
    somme.operation = 'ADD'
    nt.links.new(vers_objet.outputs[0], somme.inputs[0])
    nt.links.new(incl.outputs[0], somme.inputs[1])
    unitaire = nt.nodes.new('ShaderNodeVectorMath')
    unitaire.operation = 'NORMALIZE'
    nt.links.new(somme.outputs[0], unitaire.inputs[0])
    vers_monde = nt.nodes.new('ShaderNodeVectorTransform')
    vers_monde.vector_type, vers_monde.convert_from, vers_monde.convert_to = 'NORMAL', 'OBJECT', 'WORLD'
    nt.links.new(unitaire.outputs[0], vers_monde.inputs[0])
    nt.links.new(vers_monde.outputs[0], p.inputs['Normal'])
    nt.links.new(vers_monde.outputs[0], p.inputs['Coat Normal'])


def lettres(cam, police):
    """Les lettres en pâte du logo du milieu (logo_00…07) et du titre de fin (titre_00…07), une par objet (Chango), chacune
    un maillage à quatre emplacements de matière (lettre_en_pate) : face avant jaune satinée et bombée, flancs plus
    sombres, ombre de marque, boule du « i » (la même pâte, ronde d'elle-même). Position, rotation, échelle (1 = 1 em) et
    opacité : clés ; l'opacité (Object Info › Alpha) agit sur les quatre matières."""
    mat, nt, p = pate_satinee('pate_lettre')
    arrondi_bombe(nt, p)
    flanc, _, pf = pate('pate_lettre_flanc', FLANC_COULEUR, rugosite=0.5, sss_echelle=0.0008)
    pf.inputs['Emission Color'].default_value = lin(FLANC_COULEUR)
    pf.inputs['Emission Strength'].default_value = FLANC_LUEUR
    flanc.cycles.emission_sampling = 'NONE'   # comme l'ombre : l'arbre de lumières ne gagne aucun émetteur
    point = pate_satinee('pate_lettre_point')[0]
    point.cycles.emission_sampling = 'NONE'
    matieres = (mat, flanc, ombre_lettre(), point)
    for titre in ('logo', 'titre'):
        for i, c in enumerate(LOGO_LETTRES):
            nom = f'{titre}_{i:02d}'
            ob = objet(nom, lettre_en_pate(nom, c, police, matieres), cam)
            ob.visible_shadow = False
            ob.scale = (0.0, 0.0, 0.0)


# ---------- la scène ----------

def lire_json(dossier, nom):
    with open(os.path.join(dossier, nom), encoding='utf-8') as f:
        return json.load(f)


def construire(scene, dossier, mode, fov, police=None):
    """Vide la scène de démarrage et construit tout (le sprite : la Terre seule, sans police) ; rend sources.json. Les
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
    if mode != 'sprite':
        nuages(groupe)
        repere(groupe, lire_json(dossier, 'reperes.json'))
        frontiere(groupe, lire_json(dossier, 'frontiere.json'))
        etoiles(cam)
        lettres(cam, bpy.data.fonts.load(police))
    return src


# rayon de la Terre / côté du cadre : 58,2 px sur 128, comme le sprite actuel (home.css) ; marge du relief au bord (px)
SPRITE_RAYON, SPRITE_MARGE, SPRITE_COTE = 0.4545, 1.0, 128
# vues sur un tour : 96 (24 images/s sur le tour de 4 s ; 24 avant le 23/10, 6 images/s : la petite Terre saccadait)
SPRITE_VUES = 96


def vue_sprite(cam, i, src, fov=20):
    """Vue i (0…SPRITE_VUES − 1) de la petite Terre du titre : la Terre tournée de Rz(−23,4°)·Ry(i·360°/SPRITE_VUES) en axes three (l'orientation
    de logoAngleAt), centrée, vue de la distance de `cameraFrom` (timeline.ts) pour un rayon SPRITE_RAYON — ou de plus
    loin s'il le faut pour que le relief le plus haut (1 + hauteurMax + bosses) reste à SPRITE_MARGE px du bord."""
    t = math.tan(math.radians(fov / 2))
    plus_haut = 1 + src['hauteurMax'] + BOSSE_AMP
    d = max(0.5 / (SPRITE_RAYON * t), plus_haut / math.sin(math.atan((1 - 2 * SPRITE_MARGE / SPRITE_COTE) * t)))
    q = Quaternion((0, 0, 1), math.radians(-23.4)) @ Quaternion((0, 1, 0), math.radians(360 / SPRITE_VUES * i))
    qi = q.inverted()
    cam.location = qi @ Vector((0.0, 0.0, d))
    cam.rotation_quaternion = qi
