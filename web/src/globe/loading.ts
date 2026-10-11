/**
 * Progression combinée de `n` fichiers (jauge de l'écran de chargement, D15) : moyenne de leurs fractions, chacune bornée à
 * [0, 1] et sans recul ; `emit` seulement quand la valeur change. Un fichier sans taille connue reste à 0 jusqu'à sa fin.
 */
export function createProgress(n: number, emit: (p: number) => void) {
  const parts = new Array<number>(n).fill(0);
  let last = 0;
  return {
    update(i: number, fraction: number): void {
      if (!(i >= 0 && i < n)) return;
      const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
      if (f <= parts[i]!) return;
      parts[i] = f;
      const p = parts.reduce((a, b) => a + b, 0) / n;
      if (p !== last) { last = p; emit(p); }
    },
  };
}
