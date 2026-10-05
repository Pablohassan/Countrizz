# Phase 2A — section 4 : données bilingues FR/EN et coordonnées des capitales (proposition du 05/10)

Session cloud du 05/10. Mesures faites sur les vraies sources épinglées : mledoze `countries.json` au commit `c2ac004`
(empreinte vérifiée = `sources.lock.json`) et Natural Earth `ne_10m_populated_places_simple` (dépôt
`nvkelso/natural-earth-vector`, branche `master` au 05/10, **à épingler** comme les autres sources). Wikidata n'est
pas joignable depuis la session cloud : rien ici n'en dépend de nouveau.

## Ce qui existe

- `countries.json` (197 pays) : `name` = `translations.fra.common` de mledoze ; `capital` / `capitals` = libellés FR
  de Wikidata (P36, `fetch-capitals.ts` → `data-src/capitals.fr.json`), arbitrés par `overrides.capitals` (9 pays).
- **Aucune coordonnée de capitale.** Les maquettes (bulles « Pays · Capitale », étiquette R3, épingles G5) en ont besoin.

## Proposition

### Schéma (`web/src/data/types.ts`)

```ts
interface Libelle { fr: string; en: string }
interface CountryRecord {
  // …champs actuels…
  name: Libelle;                 // était string (FR)
  capital: Libelle;              // capitale de jeu
  capitals: { fr: string[]; en: string[] };
  capitalLngLat: LngLat;         // nouveau : position de la capitale de jeu
}
```

Un seul `countries.json` bilingue (≈ +6 Ko) plutôt qu'un fichier par langue : le jeu change de langue sans recharger.

### Sources

| Champ | FR | EN |
|---|---|---|
| `name` | mledoze `translations.fra.common` (inchangé) | mledoze `name.common` |
| `capital` | Wikidata FR + arbitrages (inchangé) | mledoze `capital` quand il n'y en a qu'une et qu'elle correspond ; sinon `overrides.capitals.<cca3>.en` |
| `capitalLngLat` | — | Natural Earth populated places (`featurecla` « Admin-0 capital… »), appariée par pays + nom ; alias ou coordonnées imposées dans `overrides.capitalPoints` |

### Arbitrages EN à ajouter dans `overrides.capitals` (forme `{ fr, en }`)

| Pays | FR (existant) | EN proposé | mledoze dit |
|---|---|---|---|
| BEN | Porto-Novo | Porto-Novo | Porto-Novo |
| BOL | Sucre | Sucre | Sucre |
| LKA | Sri Jayawardenapura | Sri Jayawardenepura Kotte | Colombo |
| MYS | Kuala Lumpur | Kuala Lumpur | Kuala Lumpur |
| PAK | Islamabad | Islamabad | Islamabad |
| PSE | Jérusalem-Est | East Jerusalem | Ramallah |
| SWZ | Mbabane | Mbabane | Lobamba |
| YEM | Sanaa | Sana'a | Sana'a |
| ZAF | Pretoria | Pretoria | Pretoria, Bloemfontein, Cape Town |

### Coordonnées : 188 / 197 trouvées directement, 9 à régler par alias

Andorre-la-Vieille (Andorra la Vella), Copenhague, Tarawa-Sud, Oulan-Bator, Yaren, Ngerulmud, Jérusalem-Est,
Saint-Marin, Washington : noms écrits autrement dans Natural Earth, ou absents (Jérusalem-Est : point imposé dans la
vieille ville, ≈ 35,235° E, 31,78° N ; Ngerulmud : NE a l'ancienne capitale Melekeok, point imposé).

### Contrôles de données (`npm run test:data`)

- chaque pays a `name.fr`, `name.en`, `capital.fr`, `capital.en` non vides ; pas deux pays au même nom dans une langue ;
- `capitalLngLat` tombe dans le pays (ou à moins de 25 km de sa côte, pour les capitales littorales simplifiées) ;
- la capitale est dans le cadre de la caméra à l'arrivée (règle le mineur n° 2 de la phase 0 : Kiribati cadré sur les
  îles de la Ligne, Tarawa hors cadre) ;
- les arbitrages `{ fr, en }` sont complets et l'EN figure dans la liste mledoze quand mledoze en a une.

### Jeu

- les réponses (noms, capitales) sont tirées et affichées dans la langue courante ; changer de langue en cours de
  partie n'est pas proposé (le sélecteur FR/EN est sur l'accueil) ;
- les catalogues d'interface `i18n/fr.ts` et `en.ts` (décidés en section 2) portent tous les textes des maquettes, y
  compris erreurs et « Tourne ton téléphone ».

## Décisions de l'utilisateur (05/10)

1. **Ukraine** : « **Kiev** » en français (libellé Wikidata actuel, inchangé) ; « Kyiv » en anglais (mledoze).
2. **Guinée équatoriale** : « **Ciudad de la Paz** » dans les deux langues (EN imposé dans `overrides.capitals.GNQ`,
   mledoze disant Malabo). Natural Earth ne la connaît pas : **point imposé** dans `overrides.capitalPoints`
   (≈ 10,82° E, 1,59° N, à confirmer sur Wikidata P625 depuis le Mac), comme Jérusalem-Est et Ngerulmud.
3. **Noms anglais de mledoze gardés tels quels** (« DR Congo », « Ivory Coast », « Türkiye », « Czechia »,
   « Vatican City », « Timor-Leste », « Cape Verde »…).
4. **Noms français raccourcis** (nouvelle table `overrides.names.fr`) : « Congo (Rép. dém.) » → « **RD Congo** »,
   « Îles du Cap-Vert » → « **Cap-Vert** », « Cité du Vatican » → « **Vatican** ».

La table des arbitrages EN ci-dessus gagne donc une ligne : GNQ | Ciudad de la Paz | Ciudad de la Paz | Malabo.
