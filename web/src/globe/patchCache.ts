/**
 * Garde en mémoire les patchs demandés (le courant et le suivant, spec §4.3) : un chargement par clé ; `keep` libère
 * tout le reste, y compris ce qui finit de charger après coup ; un échec n'est pas retenu (la clé se recharge).
 */
export function createPatchCache<T>(load: (key: string) => Promise<T>, dispose: (value: T) => void) {
  const entries = new Map<string, Promise<T>>();
  return {
    get(key: string): Promise<T> {
      let p = entries.get(key);
      if (!p) {
        const loading = load(key);
        p = loading;
        entries.set(key, loading);
        loading.catch(() => { if (entries.get(key) === loading) entries.delete(key); });
      }
      return p;
    },
    keep(keys: readonly string[]): void {
      for (const [k, p] of [...entries]) {
        if (keys.includes(k)) continue;
        entries.delete(k);
        p.then(dispose, () => {});
      }
    },
  };
}
