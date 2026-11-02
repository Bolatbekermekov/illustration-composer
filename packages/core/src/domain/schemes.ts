import type { ColorScheme } from './types.ts';

/**
 * Цветовые схемы из библиотеки Figma (сетка «Цвета фона | Цвета объектов»).
 * Значения считаны со свойств заливки каждого прямоугольника палитры.
 * Лаванда — базовая схема: все объекты библиотеки нарисованы в ней.
 */
export const LAVENDER: ColorScheme = {
  id: 'lavender',
  name: 'Лаванда',
  builtin: true,
  colors: {
    bg1: '#D7CDF5',
    bg2: '#AA9BF0',
    bg3: '#7864D7',
    ink: '#181817',
    obj1: '#F9ECB0',
    obj2: '#F9A3AA',
    obj3: '#FFE3E1',
    paper: '#FFFFFF',
  },
};

export const PEACH: ColorScheme = {
  id: 'peach',
  name: 'Персик',
  builtin: true,
  colors: {
    bg1: '#FDD7B9',
    bg2: '#FAC896',
    bg3: '#D27532',
    ink: '#181817',
    obj1: '#F9ECB0',
    obj2: '#80DADA',
    obj3: '#BEEBEB',
    paper: '#FFFFFF',
  },
};

export const MINT: ColorScheme = {
  id: 'mint',
  name: 'Мята',
  builtin: true,
  colors: {
    bg1: '#BEEBEB',
    bg2: '#80DADA',
    bg3: '#5ABEBE',
    ink: '#181817',
    obj1: '#FFD4F2',
    obj2: '#6D7BFC',
    obj3: '#B6C6FE',
    paper: '#FFFFFF',
  },
};

export const BUILTIN_SCHEMES: readonly ColorScheme[] = [LAVENDER, PEACH, MINT];
export const BASE_SCHEME: ColorScheme = LAVENDER;

export const DEFAULT_INK = '#181817';
export const DEFAULT_PAPER = '#FFFFFF';
