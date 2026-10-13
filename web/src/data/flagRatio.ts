/**
 * Proportion largeur / hauteur d'un drapeau SVG (D3) : `width` et `height` de la balise <svg> quand ce sont des nombres
 * (le viewBox de `qat.svg` ment : 75 × 18 pour un drapeau de 1400 × 550), sinon le viewBox.
 */
export function svgRatio(svg: string): number {
  const tag = /<svg\b[^>]*>/.exec(svg)?.[0];
  if (!tag) throw new Error('drapeau : balise <svg> absente');
  const attr = (name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  const w = Number(attr('width')), h = Number(attr('height'));
  if (w > 0 && h > 0) return w / h;
  const box = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (box?.length === 4 && box[2]! > 0 && box[3]! > 0) return box[2]! / box[3]!;
  throw new Error('drapeau : ni width/height ni viewBox');
}
