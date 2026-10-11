"""
Cuisson des clés de la chronologie (keys-<cadrage>.json, écrit par export-keys.ts) en F-curves de Blender. Interpolation
LINÉAIRE partout : le flou de mouvement échantillonne entre deux images, une clé constante y figerait l'objet (recon
Blender). Écriture en bloc (`foreach_set`, ~250 fois plus rapide que `keyframe_insert`) dans les slots d'action de
Blender 5 (`Action.fcurves` n'existe plus). Image n ↔ temps (n − 1) / fps.
"""
import numpy as np
import bpy
from bpy_extras import anim_utils

# « OB:camera » → bpy.data.objects['camera'] ; « CU:frontiere » → bpy.data.curves['frontiere']
GENRES = {'OB': ('objects', 'OBJECT'), 'CU': ('curves', 'CURVE'), 'MA': ('materials', 'MATERIAL')}


def cible(ident):
    """Le bloc de données visé par une piste, ou None s'il n'est pas dans la scène."""
    genre, nom = ident.split(':', 1)
    if genre not in GENRES:
        raise KeyError(f'piste {ident} : genre « {genre} » inconnu ({", ".join(GENRES)})')
    coll, type_id = GENRES[genre]
    return getattr(bpy.data, coll).get(nom), type_id


def cuire(cles):
    """Pose les pistes ; rend le nombre de F-curves écrites et les identifiants des pistes sans objet dans la scène."""
    n = cles['frames']
    images = np.arange(1, n + 1, dtype=np.float32)
    lineaire = np.ones(n, dtype=np.int32)   # 1 = LINEAR (0 = CONSTANT)
    sacs, total, absents = {}, 0, []
    for piste in cles['pistes']:
        bloc, type_id = cible(piste['id'])
        if bloc is None:
            absents.append(piste['id'])
            continue
        valeurs = np.asarray(piste['valeurs'], dtype=np.float32)
        if valeurs.size != n * piste['dim']:
            raise ValueError(f"piste {piste['id']} {piste['chemin']} : {valeurs.size} valeurs pour {n} images × {piste['dim']}")
        valeurs = valeurs.reshape(n, piste['dim'])
        if piste['id'] not in sacs:
            action = bpy.data.actions.new(piste['id'])
            ad = bloc.animation_data_create()
            ad.action = action
            slot = action.slots.new(id_type=type_id, name=bloc.name)
            ad.action_slot = slot
            sacs[piste['id']] = anim_utils.action_ensure_channelbag_for_slot(action, slot)
        for i in range(piste['dim']):
            fc = sacs[piste['id']].fcurves.new(piste['chemin'], index=i)
            fc.keyframe_points.add(n)
            co = np.empty(2 * n, dtype=np.float32)
            co[0::2], co[1::2] = images, valeurs[:, i]
            fc.keyframe_points.foreach_set('co', co)
            fc.keyframe_points.foreach_set('interpolation', lineaire)
            fc.update()
            total += 1
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, n
    return total, sorted(set(absents))
