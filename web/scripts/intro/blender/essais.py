"""
Essais des scripts Blender de la fabrique, dans Blender (hors suite Vitest, sur le Mac) :
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 -P scripts/intro/blender/essais.py
Code de sortie 1 si un essai échoue.
"""
import math
import os
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True   # pas de __pycache__ à côté des scripts (dépôt)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

import anim  # noqa: E402
import commun  # noqa: E402
import rendre  # noqa: E402
import scene  # noqa: E402


def png(largeur, hauteur, entier=True):
    """Octets d'un PNG minimal (signature, IHDR, IEND) ; `entier=False` le coupe avant IEND."""
    ihdr = largeur.to_bytes(4, 'big') + hauteur.to_bytes(4, 'big') + bytes([8, 6, 0, 0, 0])
    corps = b'\x89PNG\r\n\x1a\n' + (13).to_bytes(4, 'big') + b'IHDR' + ihdr + b'\0' * 4 + b'\0' * 64
    return corps + ((0).to_bytes(4, 'big') + b'IEND' + b'\xaeB`\x82' if entier else b'')


class Commun(unittest.TestCase):
    def test_arguments_apres_le_double_tiret(self):
        a = commun.lire_arguments(['blender', '-b', '--', '--mode', 'apercu', '--cache', '/c', '--images', '443,985', '--echelle', '25'])
        self.assertEqual((a.mode, a.cadrage, a.cache, a.images, a.echelle, a.echantillons, a.neuf),
                         ('apercu', 'portrait', '/c', [443, 985], 25, None, False))

    def test_image_complete_seulement_entiere_et_a_la_bonne_taille(self):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, 'f_0001.png')
            for octets, attendu in ((png(270, 585), True), (png(270, 585, False), False), (png(540, 1170), False), (b'', False)):
                with open(f, 'wb') as fp:
                    fp.write(octets)
                self.assertEqual(commun.image_complete(f, 270, 585), attendu)
            self.assertFalse(commun.image_complete(os.path.join(d, 'absente.png'), 270, 585))


class Anim(unittest.TestCase):
    def test_cles_lineaires_dans_les_slots_et_pistes_sans_objet(self):
        ob = bpy.data.objects.new('essai_anim', None)
        bpy.context.scene.collection.objects.link(ob)
        courbe = bpy.data.objects.new('essai_courbe', bpy.data.curves.new('essai_courbe', 'CURVE'))   # évaluée si utilisée
        bpy.context.scene.collection.objects.link(courbe)
        cles = {'frames': 3, 'pistes': [
            {'id': 'OB:essai_anim', 'chemin': 'location', 'dim': 3, 'valeurs': [0, 0, 0, 2, 4, 6, 4, 8, 12]},
            {'id': 'CU:essai_courbe', 'chemin': 'bevel_factor_end', 'dim': 1, 'valeurs': [0, 0.5, 1]},
            {'id': 'OB:absent', 'chemin': 'scale', 'dim': 3, 'valeurs': [1] * 9},
        ]}
        total, absents = anim.cuire(cles)
        self.assertEqual((total, absents), (4, ['OB:absent']))
        self.assertEqual((bpy.context.scene.frame_start, bpy.context.scene.frame_end), (1, 3))
        ad = ob.animation_data
        self.assertIsNotNone(ad.action_slot)
        for fc in anim.anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot).fcurves:
            self.assertEqual({k.interpolation for k in fc.keyframe_points}, {'LINEAR'})
        # entre deux images (le flou de mouvement y échantillonne) : le milieu, pas la valeur de l'image entière
        bpy.context.scene.frame_set(1, subframe=0.5)
        self.assertAlmostEqual(ob.location.y, 2.0, places=5)
        bpy.context.scene.frame_set(2, subframe=0.25)
        self.assertAlmostEqual(bpy.data.curves['essai_courbe'].bevel_factor_end, 0.625, places=5)

    def test_piste_de_mauvaise_longueur(self):
        bpy.data.objects.new('essai_court', None)
        with self.assertRaises(ValueError):
            anim.cuire({'frames': 3, 'pistes': [{'id': 'OB:essai_court', 'chemin': 'location', 'dim': 3, 'valeurs': [0] * 8}]})


class Rendre(unittest.TestCase):
    def test_empreinte_suit_le_contenu_des_fichiers(self):
        with tempfile.TemporaryDirectory() as d:
            script, source = os.path.join(d, 'scene.py'), os.path.join(d, 'monde.png')
            for f, octets in ((script, b'ROUGE = 0.5\n'), (source, b'\x89PNG')):
                with open(f, 'wb') as fp:
                    fp.write(octets)
            e = rendre.empreinte([script, source])
            self.assertEqual((len(e), rendre.empreinte([script, source])), (16, e))
            with open(script, 'ab') as fp:
                fp.write(b'ROUGE = 0.6\n')   # une matière retouchée
            self.assertNotEqual(rendre.empreinte([script, source]), e)

    def test_scripts_de_la_scene_sans_les_essais(self):
        self.assertEqual([os.path.basename(f) for f in rendre.scripts()], ['anim.py', 'commun.py', 'rendre.py', 'scene.py'])

    def test_reprise_seulement_avec_la_meme_fiche(self):
        with tempfile.TemporaryDirectory() as d:
            sortie = os.path.join(d, 'frames', 'apercu', 'portrait')
            fiche = {'largeur': 270, 'hauteur': 585, 'echantillons': 16, 'cles': 'c' * 16, 'scene': 'a' * 16}
            rendre.preparer_sortie(sortie, fiche, False)
            open(os.path.join(sortie, 'f_0443.png'), 'wb').close()
            rendre.preparer_sortie(sortie, fiche, False)   # même fiche : les images restent (reprise)
            self.assertTrue(os.path.exists(os.path.join(sortie, 'f_0443.png')))
            with self.assertRaises(SystemExit) as refus:
                rendre.preparer_sortie(sortie, {**fiche, 'scene': 'b' * 16}, False)   # scène changée
            self.assertIn(f"(scene : {'a' * 16} → {'b' * 16}) — relancer avec --neuf", str(refus.exception))
            rendre.preparer_sortie(sortie, {**fiche, 'scene': 'b' * 16}, True)   # --neuf : dossier vidé, nouvelle fiche
            self.assertEqual(os.listdir(sortie), ['reglages.json'])


class Terre(unittest.TestCase):
    def test_cube_sphere_fermee_et_tournee_vers_l_exterieur(self):
        d, q = scene.cube_sphere(4)
        self.assertEqual((len(d), len(q)), (6 * 4 * 4 + 2, 6 * 4 * 4))   # sommets d'arête partagés : V = 6n² + 2
        self.assertTrue(np.allclose(np.linalg.norm(d, axis=1), 1.0))
        p = d[q]                                                         # (faces, 4, 3)
        normale = np.cross(p[:, 2] - p[:, 0], p[:, 3] - p[:, 1])
        self.assertTrue(np.all(np.sum(normale * p.mean(axis=1), axis=1) > 0))

    def test_echantillon_bilineaire_boucle_en_longitude(self):
        carte = np.array([[0.0, 1.0, 2.0, 3.0], [4.0, 5.0, 6.0, 7.0]])   # 4 × 2 pixels de 90° × 90°
        self.assertAlmostEqual(float(scene.echantillon(carte, np.array([-135.0]), np.array([45.0]))[0]), 0.0)
        self.assertAlmostEqual(float(scene.echantillon(carte, np.array([-90.0]), np.array([45.0]))[0]), 0.5)
        self.assertAlmostEqual(float(scene.echantillon(carte, np.array([180.0]), np.array([45.0]))[0]), 1.5)   # entre 3 et 0
        self.assertAlmostEqual(float(scene.echantillon(carte, np.array([-135.0]), np.array([0.0]))[0]), 2.0)

    def test_couleur_css_en_lineaire(self):
        self.assertEqual(scene.lin('#ffffff'), (1.0, 1.0, 1.0, 1.0))
        self.assertAlmostEqual(scene.lin('#16173a')[0], 0.0080, places=4)
        self.assertTrue(math.isclose(scene.lin('#808080')[1], 0.2158605, rel_tol=1e-5))


POLICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'public', 'fonts', 'chango-latin.woff2')
LETTRES = [f'{t}_{i:02d}' for t in ('logo', 'titre') for i in range(8)]


def conversion(c, police, relief):
    """Conversion brute (sans cisaillement) d'une courbe FONT aux réglages des lettres (relief) ou à plat : la référence
    des essais, écrite ici sans passer par scene.py. Rend les sommets (n, 3)."""
    cu = bpy.data.curves.new('essai_glyphe', 'FONT')
    cu.body, cu.font, cu.size = c, police, scene.TAILLE_EM
    cu.align_x, cu.align_y = 'CENTER', 'CENTER'
    if relief:
        cu.extrude = scene.LETTRE_RELIEF
        cu.bevel_depth, cu.bevel_resolution, cu.offset = scene.LETTRE_BISEAU, 3, -scene.LETTRE_BISEAU
    ob = bpy.data.objects.new('essai_glyphe', cu)
    bpy.context.scene.collection.objects.link(ob)
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    co = sommets(me)
    bpy.data.meshes.remove(me)
    return co


def sommets(me):
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def faces(me):
    """Indice de matière et normale (méthode de Newell, recalculée depuis les sommets) de chaque face."""
    co = sommets(me)
    debut, total = (np.empty(len(me.polygons), np.int32) for _ in range(2))
    me.polygons.foreach_get('loop_start', debut)
    me.polygons.foreach_get('loop_total', total)
    v = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get('vertex_index', v)
    face = np.repeat(np.arange(len(debut)), total)
    rang = np.arange(len(v)) - debut[face]
    a, b = co[v], co[v[debut[face] + (rang + 1) % total[face]]]
    n = np.stack([np.bincount(face, (a[:, i] - b[:, i]) * (a[:, j] + b[:, j]), len(debut))
                  for i, j in ((1, 2), (2, 0), (0, 1))], axis=1)
    indice = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get('material_index', indice)
    longueur = np.linalg.norm(n, axis=1, keepdims=True)   # nulle pour une face d'aire nulle (une dans l'ombre du « t »)
    return indice, n / np.where(longueur > 0, longueur, 1.0), v, face


def parties(me):
    """Sommets de la lettre (matières 0 et 1), de son ombre (matière 2) et de la boule du « i » (matière 3)."""
    indice, _, v, face = faces(me)
    co = sommets(me)
    rang = np.full(len(me.vertices), -1)
    for m in (0, 1, 2, 3):
        rang[v[indice[face] == m]] = m
    return co[(rang == 0) | (rang == 1)], co[rang == 2], co[rang == 3]


def emprise(co):
    return np.concatenate([co[:, :2].min(axis=0), co[:, :2].max(axis=0)])


def meme_nuage(a, b, tol=1e-6):
    """Deux nuages de points égaux point à point, dans n'importe quel ordre : même nombre, et chaque point de l'un a un
    point de l'autre à moins de `tol` (un tri par x se trompe dès que deux x diffèrent de moins que l'arrondi)."""
    if a.shape != b.shape:
        return False
    for x, y in ((a, b), (b, a)):
        for k in range(0, len(x), 256):
            if np.linalg.norm(x[k:k + 256, None, :] - y[None, :, :], axis=2).min(axis=1).max() > tol:
                return False
    return True


SANS_POINT = '\u0131'   # « ı » : le fût du « i », sans son point (glyphe dotlessi de Chango)
MATIERES = ['pate_lettre', 'pate_lettre_flanc', 'ombre_lettre', 'pate_lettre_point']
# Éclairage B retenu le 13/10 (lumiere.py, params essai3/B2.json) : les sept entrées du Principled des lettres
B2 = {'Base Color': (1.33, 1.11, 0.215, 1.0), 'Emission Strength': 0.06, 'Roughness': 0.4, 'Coat Weight': 0.5,
      'Coat Roughness': 0.25, 'Specular IOR Level': 0.5}
# centres du bombé relevés dans les journaux de B2 (essai3/journal-B2-*.log, « [lumiere] centre logo_0i x y ») ; celui du
# « i » est le centre de la face avant du « i » entier, point compris
CENTRES_B2 = {'C': (-0.0050, -0.0380), 'u': (-0.0050, -0.1405), 'n': (0.0050, -0.1300), 't': (-0.0010, -0.0620),
              'r': (0.0300, -0.1295), 'i': (0.0000, -0.0205), 'z': (0.0050, -0.1370)}


def principled(nom):
    return next(nd for nd in bpy.data.materials[nom].node_tree.nodes if nd.bl_idname == 'ShaderNodeBsdfPrincipled')


def amont(socket):
    """Les nœuds en amont d'une entrée reliée (elle comprise), en remontant tous les liens."""
    vus, pile = [], [lien.from_node for lien in socket.links]
    while pile:
        nd = pile.pop()
        if nd in vus:
            continue
        vus.append(nd)
        pile += [lien.from_node for entree in nd.inputs for lien in entree.links]
    return vus


class Lettres(unittest.TestCase):
    """Chaque lettre est UN maillage à quatre emplacements de matière : face avant intacte (le raccord avec le titre HTML),
    dos cisaillé vers le bas-gauche (le flanc), copie plate du glyphe décalée derrière elle (l'ombre de marque
    --ombre-titre) ; le « i » est fait du « ı » sans point et d'une boule (matière 3), son ombre d'un disque."""

    @classmethod
    def setUpClass(cls):
        for ob in list(bpy.data.objects):
            bpy.data.objects.remove(ob)
        for coll in (bpy.data.curves, bpy.data.meshes, bpy.data.materials):
            for bloc in list(coll):
                coll.remove(bloc)
        cls.police = bpy.data.fonts.load(POLICE)
        scene.lettres(scene.objet('camera', bpy.data.cameras.new('camera'), None), cls.police)
        cls.courbes_restantes = [cu.name for cu in bpy.data.curves]
        cls.formes = {}   # par caractère : (lettre brute en relief, glyphe brut à plat)

    def brut(self, c):
        if c not in self.formes:
            self.formes[c] = (conversion(c, self.police, True), conversion(c, self.police, False))
        return self.formes[c]

    def forme(self, c):
        """La conversion brute du glyphe dont la lettre est faite : le « ı » sans point pour le « i »."""
        return self.brut(SANS_POINT if c == 'i' else c)

    def lettres(self):
        return [(bpy.data.objects[n], scene.LOGO_LETTRES[int(n[-2:])]) for n in LETTRES]

    def point_d_origine(self):
        """Emprise (x0, y0, x1, y1) du point du « i » de la police : les sommets du « i » à plat au-dessus du « ı » à plat."""
        plat_i, plat_fut = self.brut('i')[1], self.brut(SANS_POINT)[1]
        point = plat_i[plat_i[:, 1] > plat_fut[:, 1].max() + 1e-6]
        return emprise(point)

    def ombre_et_disque(self, ombre, c):
        """L'ombre d'une lettre, séparée en copie plate du glyphe et disque de la boule (vide hors du « i ») : le disque est
        au-dessus du haut du fût décalé (le point est à 0,029 em au-dessus du fût)."""
        if c != 'i':
            return ombre, ombre[:0]
        haut = self.forme(c)[1][:, 1].max() + scene.OMBRE_DECALAGE[1]
        return ombre[ombre[:, 1] <= haut + 1e-3], ombre[ombre[:, 1] > haut + 1e-3]

    def test_un_maillage_par_lettre_a_quatre_matieres_meme_objet_qu_avant(self):
        self.assertEqual(self.courbes_restantes, [])   # les courbes FONT temporaires sont supprimées
        for ob, c in self.lettres():
            self.assertEqual(ob.type, 'MESH')
            self.assertEqual([m.name for m in ob.data.materials], MATIERES)
            self.assertEqual(set(faces(ob.data)[0]), {0, 1, 2, 3} if c == 'i' else {0, 1, 2}, ob.name)   # la boule : le « i » seul
            self.assertEqual((ob.parent.name, ob.rotation_mode, tuple(ob.scale), ob.visible_shadow),
                             ('camera', 'XYZ', (0.0, 0.0, 0.0), False))

    def test_fut_du_i_sans_point_cale_comme_le_i(self):
        """« ı » converti par Blender = le « i » privé de son point, point à point (même avance, même calage CENTER/CENTER),
        en relief et à plat ; le point est à 0,029 em au-dessus du fût (fontTools : bas du point 535, haut du fût 506)."""
        for k in (0, 1):
            i, fut = self.brut('i')[k], self.brut(SANS_POINT)[k]
            haut = fut[:, 1].max()
            dans_le_fut = i[:, 1] <= haut + 1e-6
            self.assertEqual(int(dans_le_fut.sum()), len(fut))
            self.assertTrue(meme_nuage(i[dans_le_fut], fut), k)
            self.assertAlmostEqual(i[~dans_le_fut][:, 1].min() - haut, 0.029, delta=1e-3)

    def test_face_avant_intacte(self):
        zf = scene.LETTRE_RELIEF + scene.LETTRE_BISEAU
        for ob, c in self.lettres():
            lettre, brut = parties(ob.data)[0], self.forme(c)[0]
            self.assertAlmostEqual(lettre[:, 2].max(), zf, places=6)
            avant, avant_brut = lettre[np.isclose(lettre[:, 2], zf, atol=1e-6)], brut[np.isclose(brut[:, 2], zf, atol=1e-6)]
            self.assertTrue(np.allclose(emprise(avant), emprise(avant_brut), atol=1e-4), ob.name)
            self.assertEqual(len(avant), len(avant_brut))
            self.assertTrue(meme_nuage(avant, avant_brut, 1e-4), ob.name)   # point à point

    def test_dos_glisse_de_lettre_biais_vers_l_ombre(self):
        u = np.array(scene.OMBRE_DECALAGE) / np.linalg.norm(scene.OMBRE_DECALAGE)
        self.assertTrue(np.allclose(u, (-0.832, -0.555), atol=1e-3))   # bas-gauche (+y = haut)
        self.assertAlmostEqual(scene.LETTRE_BIAIS, 0.06)
        for ob, c in self.lettres():
            lettre, brut = parties(ob.data)[0], self.forme(c)[0]
            zf, zd = brut[:, 2].max(), brut[:, 2].min()
            self.assertEqual(len(lettre), len(brut))
            for z in np.unique(np.round(brut[:, 2], 5)):   # chaque étage glisse en proportion de sa distance à la face avant
                ici, la = lettre[np.isclose(lettre[:, 2], z, atol=1e-5)], brut[np.isclose(brut[:, 2], z, atol=1e-5)]
                glisse = scene.LETTRE_BIAIS * (zf - z) / (zf - zd) * np.tile(u, 2)
                self.assertTrue(np.allclose(emprise(ici), emprise(la) + glisse, atol=1e-4), f'{ob.name} z = {z}')

    def test_quatorze_lettres_inchangees_point_a_point(self):
        """Hors du « i », chaque maillage est, sommet par sommet et dans l'ordre, la lettre brute cisaillée suivie du glyphe
        brut décalé derrière le dos : la géométrie d'avant la boule."""
        u = np.array(scene.OMBRE_DECALAGE) / np.linalg.norm(scene.OMBRE_DECALAGE)
        for ob, c in self.lettres():
            if c == 'i':
                continue
            relief, plat = self.brut(c)
            zf, zd = relief[:, 2].max(), relief[:, 2].min()
            lettre = relief.copy()
            lettre[:, :2] += np.outer(zf - relief[:, 2], 0.06 * u / (zf - zd))
            ombre = plat.copy()
            ombre[:, :2] += scene.OMBRE_DECALAGE
            ombre[:, 2] = zd - scene.OMBRE_RECUL
            co = sommets(ob.data)
            self.assertEqual(co.shape, (len(relief) + len(plat), 3), ob.name)
            self.assertLess(np.abs(co - np.concatenate([lettre, ombre])).max(), 1e-6, ob.name)

    def test_flancs_a_part_selon_la_normale(self):
        for ob, _ in self.lettres():
            indice, n, _, _ = faces(ob.data)
            lettre = (indice == 0) | (indice == 1)   # ni l'ombre, ni la boule
            self.assertTrue(np.array_equal(indice[lettre] == 1, np.abs(n[lettre, 2]) < 0.5), ob.name)
            self.assertGreater(int(np.sum(indice == 1)), 0)

    def test_ombre_plate_decalee_et_derriere_la_lettre(self):
        self.assertTrue(np.allclose(scene.OMBRE_DECALAGE, (-0.111, -0.074), atol=1e-3))
        for ob, c in self.lettres():
            lettre, ombre, _ = parties(ob.data)
            glyphe, _ = self.ombre_et_disque(ombre, c)
            plat = self.forme(c)[1]
            self.assertEqual(len(glyphe), len(plat), ob.name)
            self.assertTrue(meme_nuage(glyphe[:, :2], plat[:, :2] + scene.OMBRE_DECALAGE), ob.name)
            self.assertLess(np.ptp(ombre[:, 2]), 1e-6)                       # plate (disque compris)
            self.assertLess(ombre[:, 2].max(), lettre[:, 2].min() - 1e-3)    # entièrement derrière le dos

    def test_point_du_i_en_boule_posee_sur_le_bas_du_point(self):
        """Boule de 0,299 em (0,23 × 1,3 : le point agrandi de 30 % le 13/10), son bas sur le bas du point d'origine : elle
        grandit vers le haut, son centre monte de 0,0345 em par rapport à la boule de 0,23 ; le disque d'ombre la suit."""
        self.assertEqual(scene.POINT_I_DIAMETRE, 0.299)
        self.assertAlmostEqual(scene.POINT_I_DIAMETRE, 0.23 * 1.3, places=12)
        r = 0.1495
        x0, y0, x1, y1 = self.point_d_origine()
        centre = np.array([(x0 + x1) / 2, y0 + r, 0.0])
        for ob, c in self.lettres():
            if c != 'i':
                continue
            lettre, ombre, boule = parties(ob.data)
            self.assertLess(np.abs(np.linalg.norm(boule - centre, axis=1) - r).max(), 1e-4, ob.name)   # sur la sphère
            self.assertAlmostEqual(boule[:, 1].min(), y0, delta=1e-4)                                    # bas = bas du point
            self.assertTrue(np.allclose(emprise(boule), [centre[0] - r, y0, centre[0] + r, y0 + 2 * r], atol=1e-4))
            milieu = (boule[:, 1].min() + boule[:, 1].max()) / 2
            self.assertAlmostEqual(milieu - (y0 + 0.23 / 2), 0.0345, delta=1e-4)                         # elle grandit vers le haut
            self.assertAlmostEqual((boule[:, 0].min() + boule[:, 0].max()) / 2, (x0 + x1) / 2, delta=1e-4)   # x : milieu du point
            self.assertTrue(np.allclose([boule[:, 2].min(), boule[:, 2].max()], [-r, r], atol=1e-4))     # ni cisaillée ni avancée
            equateur = boule[np.abs(boule[:, 2]) < 1e-6]   # le contour vu de face
            self.assertGreaterEqual(len(equateur), 64)
            self.assertLess(150 * (1 - math.cos(math.pi / len(equateur))), 0.25)   # rond à 0,25 px près pour 300 px de haut
            indice = faces(ob.data)[0]
            lisse = np.empty(len(ob.data.polygons), bool)
            ob.data.polygons.foreach_get('use_smooth', lisse)
            self.assertTrue(lisse[indice == 3].all())
            # l'ombre de la boule : un disque plat de même rayon, décalé de OMBRE_DECALAGE, à la profondeur du reste de l'ombre
            glyphe, disque = self.ombre_et_disque(ombre, c)
            d = centre[:2] + scene.OMBRE_DECALAGE
            self.assertGreater(len(disque), 0)
            self.assertAlmostEqual(np.linalg.norm(disque[:, :2] - d, axis=1).max(), r, delta=1e-6)
            self.assertTrue(np.allclose(emprise(disque), np.concatenate([d - r, d + r]), atol=1e-4))
            self.assertLess(np.abs(disque[:, 2] - glyphe[:, 2].mean()).max(), 1e-6)
            self.assertAlmostEqual(disque[:, 2].max(), lettre[:, 2].min() - scene.OMBRE_RECUL, places=6)

    def test_boule_ne_touche_pas_le_fut(self):
        """La boule grandie ne touche pas le fût. Vu de face, son bas reste au-dessus du point le plus haut du fût (l'anneau
        du biseau, cisaillé : 0,032 em sous le bas du point) de plus que l'écart de la police (0,029 em) ; dans l'espace, sa
        surface reste aussi à plus de 0,029 em du fût : distance du centre de la boule à la surface du fût (BVH des faces 0
        et 1), moins le rayon. Une boule agrandie autour de l'ancien centre (bas 0,0345 em plus bas) entrerait dans le fût."""
        from mathutils.bvhtree import BVHTree
        r = scene.POINT_I_DIAMETRE / 2
        for ob, c in self.lettres():
            if c != 'i':
                continue
            lettre, _, boule = parties(ob.data)
            self.assertGreater(boule[:, 1].min() - lettre[:, 1].max(), 0.029, ob.name)
            indice = faces(ob.data)[0]
            co = [tuple(v.co) for v in ob.data.vertices]
            fut = [tuple(p.vertices) for p, m in zip(ob.data.polygons, indice) if m in (0, 1)]
            centre = Vector(((boule[:, 0].min() + boule[:, 0].max()) / 2, (boule[:, 1].min() + boule[:, 1].max()) / 2, 0.0))
            _, _, _, distance = BVHTree.FromPolygons(co, fut).find_nearest(centre)
            self.assertGreater(distance - r, 0.029, ob.name)

    def test_centre_du_bombe_au_centre_de_la_face_avant(self):
        for ob, c in self.lettres():
            at = ob.data.attributes.get('centre_bombe')
            self.assertIsNotNone(at, ob.name)
            self.assertEqual((at.data_type, at.domain), ('FLOAT_VECTOR', 'POINT'))
            v = np.empty(len(ob.data.vertices) * 3, np.float32)
            at.data.foreach_get('vector', v)
            v = v.reshape(-1, 3)
            self.assertLess(np.ptp(v, axis=0).max(), 1e-9, ob.name)   # constant sur la lettre, ombre et boule comprises
            relief = self.brut(c)[0]                                  # la lettre telle qu'écrite : le « i » avec son point
            avant = relief[np.isclose(relief[:, 2], relief[:, 2].max(), atol=1e-6)]
            e = emprise(avant)
            self.assertTrue(np.allclose(v[0], [(e[0] + e[2]) / 2, (e[1] + e[3]) / 2, 0.0], atol=1e-6), ob.name)
            self.assertTrue(np.allclose(v[0, :2], CENTRES_B2[c], atol=1e-4), ob.name)

    def test_pate_des_lettres_et_de_la_boule_eclairage_b(self):
        for nom in ('pate_lettre', 'pate_lettre_point'):
            p = principled(nom)
            for entree, valeur in B2.items():
                self.assertTrue(np.allclose(p.inputs[entree].default_value, valeur, atol=1e-6), f'{nom} {entree}')
            self.assertTrue(np.allclose(p.inputs['Emission Color'].default_value, scene.lin('#f7dc6f')), nom)
            for entree, valeur in (('Sheen Weight', 0.45), ('Sheen Roughness', 0.7), ('Subsurface Weight', 0.12),
                                   ('Subsurface Radius', (1.0, 0.45, 0.25)), ('Subsurface Scale', 0.0008)):   # le reste de pate()
                self.assertTrue(np.allclose(p.inputs[entree].default_value, valeur, atol=1e-6), f'{nom} {entree}')
        # la face des lettres : arrondi (Bevel 8 échantillons, 0,05 em × échelle de l'objet) puis bombé, sur Normal ET Coat Normal
        p = principled('pate_lettre')
        self.assertTrue(p.inputs['Normal'].is_linked and p.inputs['Coat Normal'].is_linked)
        source = p.inputs['Normal'].links[0].from_socket
        self.assertEqual(p.inputs['Coat Normal'].links[0].from_socket, source)
        bombe = source.node
        self.assertEqual((bombe.bl_idname, bombe.vector_type, bombe.convert_from, bombe.convert_to),
                         ('ShaderNodeVectorTransform', 'NORMAL', 'OBJECT', 'WORLD'))
        noeuds = amont(p.inputs['Normal'])
        bevel = [nd for nd in noeuds if nd.bl_idname == 'ShaderNodeBevel']
        self.assertEqual([nd.samples for nd in bevel], [8])
        fois = bevel[0].inputs['Radius'].links[0].from_node
        self.assertEqual((fois.operation, round(fois.inputs[1].default_value, 6)), ('MULTIPLY', 0.05))
        longueur = fois.inputs[0].links[0].from_node
        vers_monde = longueur.inputs[0].links[0].from_node
        self.assertEqual((longueur.operation, vers_monde.vector_type, vers_monde.convert_from, vers_monde.convert_to),
                         ('LENGTH', 'VECTOR', 'OBJECT', 'WORLD'))
        self.assertEqual(tuple(vers_monde.inputs[0].links[0].from_node.inputs[i].default_value for i in range(3)), (1.0, 0.0, 0.0))
        attribut = [nd for nd in noeuds if nd.bl_idname == 'ShaderNodeAttribute']
        self.assertEqual([(nd.attribute_type, nd.attribute_name) for nd in attribut], [('GEOMETRY', 'centre_bombe')])
        poids = [nd for nd in noeuds if nd.bl_idname == 'ShaderNodeMapRange']
        self.assertEqual([(nd.interpolation_type, round(nd.inputs['From Min'].default_value, 6),
                           round(nd.inputs['From Max'].default_value, 6)) for nd in poids], [('SMOOTHSTEP', 0.6, 0.95)])
        pente = [nd for nd in noeuds if nd.bl_idname == 'ShaderNodeMath' and nd.operation == 'MULTIPLY'
                 and nd.inputs[0].links and nd.inputs[0].links[0].from_node in poids]
        self.assertEqual([round(nd.inputs[1].default_value, 6) for nd in pente], [round(0.3 / 0.35, 6)])
        # la boule : ronde d'elle-même, ni arrondi ni bombé
        p = principled('pate_lettre_point')
        self.assertFalse(p.inputs['Normal'].is_linked or p.inputs['Coat Normal'].is_linked)
        self.assertFalse([nd for nd in bpy.data.materials['pate_lettre_point'].node_tree.nodes
                          if nd.bl_idname in ('ShaderNodeBevel', 'ShaderNodeAttribute')])

    def test_matieres_suivent_l_opacite_et_restent_hors_de_l_arbre_de_lumieres(self):
        for nom in MATIERES:   # Object Info › Alpha (les clés) agit sur les quatre
            nt = bpy.data.materials[nom].node_tree
            info = [nd for nd in nt.nodes if nd.bl_idname == 'ShaderNodeObjectInfo']
            self.assertTrue(info and info[0].outputs['Alpha'].is_linked, nom)
        self.assertEqual(bpy.data.materials['pate_lettre'].cycles.emission_sampling, 'AUTO')   # inchangée
        for nom in ('pate_lettre_flanc', 'ombre_lettre', 'pate_lettre_point'):
            self.assertEqual(bpy.data.materials[nom].cycles.emission_sampling, 'NONE', nom)
        nt = bpy.data.materials['ombre_lettre'].node_tree
        mix = next(nd for nd in nt.nodes if nd.bl_idname == 'ShaderNodeMixShader')
        fois = mix.inputs['Fac'].links[0].from_node
        self.assertEqual((fois.operation, fois.inputs[1].default_value), ('MULTIPLY', scene.OMBRE_OPACITE))
        self.assertEqual(fois.inputs[0].links[0].from_socket.name, 'Alpha')
        self.assertEqual([mix.inputs[i].links[0].from_node.bl_idname for i in (1, 2)], ['ShaderNodeBsdfTransparent', 'ShaderNodeEmission'])
        em = mix.inputs[2].links[0].from_node
        self.assertTrue(np.allclose(em.inputs['Color'].default_value, scene.lin(scene.OMBRE_COULEUR)))
        self.assertEqual(em.inputs['Strength'].default_value, 1.0)


class Objets(unittest.TestCase):
    def setUp(self):
        for ob in list(bpy.data.objects):
            bpy.data.objects.remove(ob)
        for cu in list(bpy.data.curves):
            bpy.data.curves.remove(cu)

    def test_frontiere_deroulee_a_l_indice_des_points(self):
        """bevel_factor_end = f arrête le boudin à l'indice f·N des points (spline ouverte, 'RESOLUTION'), comme three."""
        x = np.array([0, 0.1, 0.15, 0.5, 1.2, 1.25, 2.0, 3.0, 3.1])   # pas inégaux : l'indice n'est pas la longueur
        scene.frontiere(scene.vide('terre_groupe', None), np.stack([x, 0 * x, 0 * x], axis=1).tolist())
        fr = bpy.data.objects['frontiere']
        self.assertFalse(fr.data.splines[0].use_cyclic_u)
        for f in (0.3, 0.7):
            fr.data.bevel_factor_end = f
            dg = bpy.context.evaluated_depsgraph_get()
            dg.update()
            bout = max(v.co.x for v in fr.evaluated_get(dg).to_mesh().vertices)   # le boudin avance vers +x
            fr.evaluated_get(dg).to_mesh_clear()
            i = f * (len(x) - 1)
            self.assertAlmostEqual(bout, x[int(i)] + (x[int(i) + 1] - x[int(i)]) * (i - int(i)), places=4)

    def test_objets_et_rotations_que_lisent_les_cles(self):
        """Les noms et modes de rotation des pistes d'export-keys.ts (Task 3) : une piste sans objet arrête rendre.py."""
        cam = scene.objet('camera', bpy.data.cameras.new('camera'), None)
        groupe = scene.vide('terre_groupe', None)
        scene.nuages(groupe)
        scene.repere(groupe, {'paris': [0.66, 0.757, -0.027]})
        scene.frontiere(groupe, [[1, 0, 0], [0, 1, 0], [1, 0, 0]])
        scene.etoiles(cam)
        scene.lettres(cam, bpy.data.fonts.load(POLICE))
        plan = [f'{t}_{i:02d}' for t in ('logo', 'titre') for i in range(8)] + [f'etoile_{i:02d}' for i in range(46)]
        for nom in ['nuages', 'repere', 'point', 'drapeau', 'frontiere', 'perle'] + plan:
            self.assertIn(nom, bpy.data.objects)
        self.assertIn('frontiere', bpy.data.curves)
        self.assertEqual({bpy.data.objects[n].rotation_mode for n in ('repere', 'drapeau')}, {'QUATERNION'})
        self.assertEqual({bpy.data.objects[n].rotation_mode for n in ('nuages', 'logo_00', 'titre_07')}, {'XYZ'})
        self.assertEqual({bpy.data.objects[n].parent.name for n in ('nuages', 'repere', 'frontiere', 'perle')}, {'terre_groupe'})
        self.assertEqual({bpy.data.objects[n].parent.name for n in plan}, {'camera'})
        self.assertFalse(any(bpy.data.objects[n].visible_shadow for n in plan))

    def test_vue_sprite_terre_centree_axe_penche_relief_dans_le_cadre(self):
        cam = bpy.data.objects.new('essai_cam', bpy.data.cameras.new('essai_cam'))
        cam.rotation_mode = 'QUATERNION'
        t = math.tan(math.radians(10))
        bord = lambda rho: scene.SPRITE_COTE / 2 * math.tan(math.asin(rho / cam.location.length)) / t   # px du centre
        for i in (0, 7, 18):
            scene.vue_sprite(cam, i, {'hauteurMax': 0.0})   # relief bas : le rayon du sprite actuel est gardé
            self.assertAlmostEqual(cam.location.length, 0.5 / (scene.SPRITE_RAYON * t), places=5)
            self.assertLess((cam.rotation_quaternion @ Vector((0, 0, -1)) + cam.location.normalized()).length, 1e-6)
        scene.vue_sprite(cam, 0, {'hauteurMax': 0.0945})    # relief caricaturé maximal : la caméra recule
        self.assertAlmostEqual(bord(1 + 0.0945 + scene.BOSSE_AMP), scene.SPRITE_COTE / 2 - scene.SPRITE_MARGE, places=4)
        pole = cam.rotation_quaternion.inverted() @ Vector((0, 1, 0))   # le pôle Nord, en repère caméra
        self.assertAlmostEqual(math.degrees(math.atan2(pole.x, pole.y)), 23.4, places=4)   # penché vers la droite


resultat = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__]))
if not resultat.wasSuccessful():
    raise SystemExit(1)
