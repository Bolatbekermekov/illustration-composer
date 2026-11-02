import type { Format, SizeClass } from './types.ts';

/** Форматы кадра в единицах L. Первые три — из примеров композиций дизайнера. */
export const FORMATS: readonly Format[] = [
  { id: 'square', name: 'Квадрат 1:1', width: 1000, height: 1000 },
  { id: 'wide', name: 'Обложка 1200×630', width: 1200, height: 630 },
  { id: 'tall', name: 'Вертикаль 2:3', width: 800, height: 1200 },
  { id: 'slide', name: 'Слайд 16:9', width: 1600, height: 900 },
];

/** Во сколько раз S-отрисовка меньше L в пикселях (тайлы 500 vs 1000). */
export const SIZE_SCALE: Record<SizeClass, number> = { L: 1, S: 0.5 };

export function formatById(id: string): Format | undefined {
  return FORMATS.find((f) => f.id === id);
}

/** Подбирает id формата по размеру кадра (для распознавания эталонов). */
export function formatIdForSize(width: number, height: number): string {
  const exact = FORMATS.find((f) => Math.abs(f.width - width) < 1 && Math.abs(f.height - height) < 1);
  return exact?.id ?? `custom-${Math.round(width)}x${Math.round(height)}`;
}
