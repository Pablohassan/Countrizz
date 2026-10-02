import { existsSync } from 'node:fs';
import path from 'node:path';
import { GEOBOUNDARIES_MAX_AREA_KM2, PLAYABLE_COUNT, PLAYABLE_EXTRA, SOURCES } from './config';
import { fetchBytes, sha256 } from './lib/http';
import { readJson, writeBytes, writeJson } from './lib/io';
import { selectPlayable, type MledozeCountry } from './lib/playable';
import { CACHE_DIR, LOCK_PATH, OVERRIDES_PATH } from './paths';

interface LockEntry { url: string; sha256: string }
interface GbLock extends LockEntry { license: string; source: string; year: string; iso: string }
interface Lock {
  naturalEarth?: LockEntry;
  naturalEarthDisputed?: LockEntry;
  mledozeCountries?: LockEntry;
  flags: Record<string, LockEntry>;
  geoBoundaries: Record<string, GbLock | { unavailable: string }>;
}

const lock: Lock = existsSync(LOCK_PATH) ? readJson<Lock>(LOCK_PATH) : { flags: {}, geoBoundaries: {} };

async function pinned(key: string, url: string, previous: LockEntry | undefined, dest: string): Promise<LockEntry> {
  const useUrl = previous?.url ?? url;
  const bytes = await fetchBytes(useUrl);
  const hash = sha256(bytes);
  if (previous && previous.sha256 !== hash) {
    throw new Error(`${key} : empreinte différente du verrou (${previous.sha256} attendu, ${hash} reçu) — ${useUrl}`);
  }
  writeBytes(dest, bytes);
  return { url: useUrl, sha256: hash };
}

async function main(): Promise<void> {
  lock.naturalEarth = await pinned('naturalEarth', SOURCES.naturalEarth, lock.naturalEarth,
    path.join(CACHE_DIR, 'ne_10m_admin_0_countries.geojson'));
  lock.naturalEarthDisputed = await pinned('naturalEarthDisputed', SOURCES.naturalEarthDisputed, lock.naturalEarthDisputed,
    path.join(CACHE_DIR, 'ne_10m_admin_0_disputed_areas.geojson'));
  lock.mledozeCountries = await pinned('mledozeCountries', SOURCES.mledozeCountries, lock.mledozeCountries,
    path.join(CACHE_DIR, 'mledoze-countries.json'));

  const playable = selectPlayable(readJson<MledozeCountry[]>(path.join(CACHE_DIR, 'mledoze-countries.json')), PLAYABLE_EXTRA);
  if (playable.length !== PLAYABLE_COUNT) throw new Error(`${playable.length} pays jouables au lieu de ${PLAYABLE_COUNT}`);

  for (const c of playable) {
    lock.flags[c.cca3] = await pinned(`flag ${c.cca3}`, SOURCES.mledozeFlag(c.cca3), lock.flags[c.cca3],
      path.join(CACHE_DIR, 'flags', `${c.cca3.toLowerCase()}.svg`));
  }

  const overrides = readJson<{ gbIso: Record<string, string> }>(OVERRIDES_PATH);
  for (const c of playable.filter((x) => x.area <= GEOBOUNDARIES_MAX_AREA_KM2)) {
    const dest = path.join(CACHE_DIR, 'gb', `${c.cca3}.geojson`);
    const previous = lock.geoBoundaries[c.cca3];
    if (previous && 'unavailable' in previous) continue;
    if (previous) {
      const entry = await pinned(`gb ${c.cca3}`, previous.url, previous, dest);
      writeJson(path.join(CACHE_DIR, 'gb', `${c.cca3}.meta.json`), { ...previous, ...entry });
      continue;
    }
    const iso = overrides.gbIso[c.cca3] ?? c.cca3;
    try {
      const meta = JSON.parse(new TextDecoder().decode(await fetchBytes(SOURCES.geoBoundariesMeta(iso), 2))) as {
        gjDownloadURL: string; boundaryLicense: string; boundarySource: string; boundaryYearRepresented: string;
      };
      const entry = await pinned(`gb ${c.cca3}`, meta.gjDownloadURL, undefined, dest);
      const gb: GbLock = { ...entry, iso, license: meta.boundaryLicense, source: meta.boundarySource, year: meta.boundaryYearRepresented };
      lock.geoBoundaries[c.cca3] = gb;
      writeJson(path.join(CACHE_DIR, 'gb', `${c.cca3}.meta.json`), gb);
    } catch (e) {
      lock.geoBoundaries[c.cca3] = { unavailable: String(e) };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  writeJson(LOCK_PATH, lock);
  const gbOk = Object.values(lock.geoBoundaries).filter((v) => !('unavailable' in v)) as GbLock[];
  console.log(`OK : NE, mledoze, ${Object.keys(lock.flags).length} drapeaux, ${gbOk.length} contours geoBoundaries`);
  console.log('Licences geoBoundaries rencontrées :', [...new Set(gbOk.map((g) => g.license))]);
}

main().catch((e) => { console.error(e); process.exit(1); });
