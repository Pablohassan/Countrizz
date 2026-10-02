export interface MledozeCountry {
  cca2: string;
  cca3: string;
  unMember: boolean;
  name: { common: string };
  translations: Record<string, { common: string; official: string }>;
  capital: string[];
  region: string;
  subregion: string;
  borders: string[];
  area: number;
  latlng: [number, number];
}

export function selectPlayable(all: MledozeCountry[], extra: readonly string[]): MledozeCountry[] {
  const wanted = new Set(extra);
  return all.filter((c) => c.unMember || wanted.has(c.cca3)).sort((a, b) => a.cca3.localeCompare(b.cca3));
}
