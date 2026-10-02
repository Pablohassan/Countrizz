import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { geoContains } from 'd3-geo';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { CountryRecord, LngLat } from '../../src/data/types';
import { AREA_RATIO, BORDERS_KEEP, EARTH_RADIUS_KM, MAIN_BODY, PATCH, PLAYABLE_COUNT, PLAYABLE_EXTRA } from './config';
import { beaconPoint } from './lib/beacon';
import { buildTopology, neighborLines, overviewBorders } from './lib/borders';
import { boundingCap, capContains } from './lib/cap';
import { capitalOfGame } from './lib/capitals';
import { areaKm2, forD3, polygonsOf } from './lib/geometry';
import { readJson, writeBytes, writeJson } from './lib/io';
import { joinNaturalEarth, neCode, type NeProps, type Overrides } from './lib/join';
import { mainBody } from './lib/mainBody';
import { chooseOutline } from './lib/outline';
import { buildPatch, patchExtentRad } from './lib/patch';
import { selectPlayable, type MledozeCountry } from './lib/playable';
import { isSubTexel, renderReport, type ReportRow } from './lib/report';
import { CACHE_DIR, DATA_SRC_DIR, OUT_DIR, OVERRIDES_PATH, REPORT_PATH } from './paths';

function loadGb(cca3: string): { geometry: Polygon | MultiPolygon; license: string; source: string; year: string } | undefined {
  const geo = path.join(CACHE_DIR, 'gb', `${cca3}.geojson`);
  const meta = path.join(CACHE_DIR, 'gb', `${cca3}.meta.json`);
  if (!existsSync(geo) || !existsSync(meta)) return undefined;
  const fc = readJson<FeatureCollection<Polygon | MultiPolygon>>(geo);
  const m = readJson<{ license: string; source: string; year: string }>(meta);
  const polys = fc.features.flatMap((f) => polygonsOf(f.geometry));
  return { geometry: { type: 'MultiPolygon', coordinates: polys }, ...m };
}

function main(): void {
  const mz = readJson<MledozeCountry[]>(path.join(CACHE_DIR, 'mledoze-countries.json'));
  const playable = selectPlayable(mz, PLAYABLE_EXTRA);
  if (playable.length !== PLAYABLE_COUNT) throw new Error(`${playable.length} pays jouables au lieu de ${PLAYABLE_COUNT}`);
  const playableSet = new Set(playable.map((c) => c.cca3));
  const overrides = readJson<Overrides>(OVERRIDES_PATH);
  const wikidata = readJson<Record<string, string[]>>(path.join(DATA_SRC_DIR, 'capitals.fr.json'));
  const ne = readJson<FeatureCollection<Polygon | MultiPolygon, NeProps>>(path.join(CACHE_DIR, 'ne_10m_admin_0_countries.geojson'));

  const join = joinNaturalEarth(ne, [...playableSet], overrides);
  if (join.unmatched.length) throw new Error(`Sans géométrie Natural Earth : ${join.unmatched.join(', ')}`);

  const topo = buildTopology([
    ...[...join.byCountry].map(([code, geometry]) => ({ code, geometry })),
    ...join.neutral.map((f) => ({ code: neCode(f.properties), geometry: forD3(f.geometry) })),
  ]);

  const previousPath = path.join(OUT_DIR, 'countries.json');
  const previous = existsSync(previousPath) ? readJson<CountryRecord[]>(previousPath) : null;
  const records: CountryRecord[] = [];
  const rows: ReportRow[] = [];
  const gbCredits: { cca3: string; license: string; source: string; year: string }[] = [];

  for (const [index, c] of playable.entries()) {
    const lower = c.cca3.toLowerCase();
    const gb = loadGb(c.cca3);
    const outline = chooseOutline(join.byCountry.get(c.cca3)!, gb, c.area, AREA_RATIO);
    if (outline.source === 'geoboundaries' && gb) gbCredits.push({ cca3: c.cca3, license: gb.license, source: gb.source, year: gb.year });

    const area = areaKm2(outline.geometry);
    const ratio = area / c.area;
    if ((ratio < AREA_RATIO.min || ratio > AREA_RATIO.max) && !overrides.areaWhitelist[c.cca3]) {
      throw new Error(`${c.cca3} : surface ×${ratio.toFixed(2)} de la référence (${Math.round(area)} / ${c.area} km²) — motiver dans overrides.areaWhitelist ou corriger`);
    }

    const polys = polygonsOf(outline.geometry);
    const body = mainBody(polys, MAIN_BODY);
    const bodyPoints = body.kept.flatMap((p) => p[0]!.map((q) => [q[0]!, q[1]!] as LngLat));
    const cap = boundingCap(bodyPoints);
    for (const q of bodyPoints) if (!capContains(cap, q, 1e-6)) throw new Error(`${c.cca3} : la calotte ne contient pas ${q}`);
    const { point: beacon, clearanceKm } = beaconPoint(body.kept);
    const { capital, capitals } = capitalOfGame(c.cca3, wikidata, overrides.capitals);

    const frame = { center: cap.center, extentRad: patchExtentRad(cap.radiusDeg, PATCH), size: PATCH.size };
    const texelKm = (2 * frame.extentRad * EARTH_RADIUS_KM) / frame.size;
    const { png, insidePixels } = buildPatch(polys, neighborLines(topo, c.cca3), frame, PATCH.rangeTexels);
    if (insidePixels === 0 && !isSubTexel({ beaconClearanceKm: clearanceKm, texelKm })) {
      throw new Error(`${c.cca3} : patch vide alors que la balise est à ${clearanceKm.toFixed(2)} km du bord (texel ${texelKm.toFixed(3)} km)`);
    }
    writeBytes(path.join(OUT_DIR, 'patches', 'sdf', `${lower}.png`), png);

    mkdirSync(path.join(OUT_DIR, 'flags'), { recursive: true });
    copyFileSync(path.join(CACHE_DIR, 'flags', `${lower}.svg`), path.join(OUT_DIR, 'flags', `${lower}.svg`));

    records.push({
      id: index + 1,
      cca3: c.cca3,
      cca2: c.cca2,
      name: c.translations.fra?.common ?? c.name.common,
      capital,
      capitals,
      region: c.region,
      subregion: c.subregion,
      neighbors: c.borders.filter((b) => playableSet.has(b)).sort(),
      // Au centième : arrondie à l'entier, la surface du Vatican (≈ 0,5 km²) deviendrait 1 km² (×2,27 de la référence).
      areaKm2: Math.round(area * 100) / 100,
      cap: { center: cap.center, radiusDeg: cap.radiusDeg },
      beacon,
      beaconClearanceKm: Math.round(clearanceKm * 1000) / 1000,
      flag: `flags/${lower}.svg`,
      outlineSource: outline.source,
      patch: { sdf: `patches/sdf/${lower}.png`, size: PATCH.size, center: cap.center, extentRad: frame.extentRad, rangeTexels: PATCH.rangeTexels },
    });
    rows.push({
      cca3: c.cca3, name: records.at(-1)!.name, source: outline.source, license: outline.license,
      areaKm2: area, refAreaKm2: c.area, capRadiusDeg: cap.radiusDeg, excluded: body.excluded.length,
      centerInside: geoContains(outline.geometry, cap.center), insidePixels, beaconClearanceKm: clearanceKm, texelKm,
      ...(outline.note ? { note: outline.note } : {}),
    });
    process.stdout.write(`\r${index + 1}/${playable.length} ${c.cca3}   `);
  }

  // Minifié : l'indentation de writeJson presque doublerait ce fichier (des centaines de milliers de coordonnées).
  writeFileSync(path.join(OUT_DIR, 'borders.json'), JSON.stringify(overviewBorders(topo, BORDERS_KEEP)));
  writeJson(path.join(OUT_DIR, 'credits.json'), {
    naturalEarth: { licence: 'domaine public', url: 'https://www.naturalearthdata.com/' },
    mledoze: { licence: 'ODbL 1.0', url: 'https://github.com/mledoze/countries' },
    wikidata: { url: 'https://www.wikidata.org/' },
    geoBoundaries: gbCredits,
    note: 'countries.json et les contours dérivés sont publiés sous ODbL 1.0.',
  });
  writeFileSync(REPORT_PATH, renderReport(rows, previous, records));
  writeJson(previousPath, records);
  console.log(`\nOK : ${records.length} pays → ${OUT_DIR}`);
}

main();
