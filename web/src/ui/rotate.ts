import { useEffect, useState } from 'react';

/** Téléphone en paysage (décision 7 du plan) : pointeur grossier, plus large que haut, moins de 500 px de haut. */
export const isPhoneLandscape = (v: { coarse: boolean; width: number; height: number }): boolean =>
  v.coarse && v.width > v.height && v.height < 500;

const read = () => isPhoneLandscape({ coarse: matchMedia('(pointer: coarse)').matches, width: innerWidth, height: innerHeight });

/** Suit la rotation (et le redimensionnement) de l'écran. */
export function useRotated(): boolean {
  const [rotated, setRotated] = useState(read);
  useEffect(() => {
    const on = () => setRotated(read());
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);
  return rotated;
}
