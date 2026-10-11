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
