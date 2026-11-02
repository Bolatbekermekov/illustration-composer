/**
 * Доменная модель. Все типы — чистые данные (сериализуются в JSON), без I/O.
 */

/** Роль цвета в палитре. Порядок = чтение сетки палитры в Figma по столбцам. */
export type ColorRole = 'bg1' | 'bg2' | 'bg3' | 'ink' | 'obj1' | 'obj2' | 'obj3' | 'paper';

export const COLOR_ROLES: readonly ColorRole[] = ['bg1', 'bg2', 'bg3', 'ink', 'obj1', 'obj2', 'obj3', 'paper'];
/** «Цвета фона» — допустимы в фоне и в объектах. */
export const BACKGROUND_ROLES: readonly ColorRole[] = ['bg1', 'bg2', 'bg3'];
/** «Цвета объектов» — только в объектах, никогда в фоне. */
export const OBJECT_ROLES: readonly ColorRole[] = ['obj1', 'obj2', 'obj3'];

export const ROLE_LABELS: Record<ColorRole, string> = {
  bg1: 'Фон · светлый',
  bg2: 'Фон · средний',
  bg3: 'Фон · тёмный',
  ink: 'Контур',
  obj1: 'Объект · 1',
  obj2: 'Объект · 2',
  obj3: 'Объект · 3',
  paper: 'Белый',
};

export interface ColorScheme {
  id: string;
  name: string;
  colors: Record<ColorRole, string>;
  builtin?: boolean;
}

/** L — детальная отрисовка (кадр ~1000 px), S — упрощённая (кадр ~500 px). */
export type SizeClass = 'L' | 'S';
export const SIZE_CLASSES: readonly SizeClass[] = ['L', 'S'];

/** Главный (цветной) или фоновый (двухтоновый) вариант объекта. */
export type ObjectState = 'main' | 'background';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Силуэт объекта: битовая маска на сетке с шагом `cell` (в px исходного кадра). */
export interface SilhouetteMask {
  cell: number;
  cols: number;
  rows: number;
  /** base64 упакованных бит, построчно, старший бит первым. */
  bits: string;
}

export interface ObjectVariant {
  objectId: string;
  size: SizeClass;
  state: ObjectState;
  /** Путь к standalone SVG относительно корня библиотеки. */
  file: string;
  /** Габарит в собственных координатах разметки (координаты исходного кадра Figma). */
  box: Box;
  /** Внутренняя разметка группы объекта: пути без изменений, цвета в базовой схеме. */
  markup: string;
  /** Использование цветов по ролям базовой схемы (контроль и подсказки). */
  roles: Partial<Record<ColorRole, number>>;
  mask: SilhouetteMask;
}

/**
 * Как объект «стоит» в изометрической сцене:
 * surface — поверхность, на которую можно положить плоский предмет (книга, папка);
 * flat — плоский предмет, может лежать на поверхности (телефон, пазл, монета, кошелёк, ручка);
 * standing — объёмный предмет, стоит рядом (лампа, цветы, наушники).
 */
export type ObjectKind = 'surface' | 'flat' | 'standing';

export interface CatalogEntry {
  id: string;
  name: string;
  /** Как объект называют люди: синонимы и формы (рус./англ.). */
  aliases: string[];
  /** Смыслы и ассоциации для подбора по метафоре. */
  meanings: string[];
  kind: ObjectKind;
}

export interface LibraryObject extends CatalogEntry {
  variants: Record<SizeClass, Record<ObjectState, ObjectVariant>>;
}

export type DecorSetId = 'strokes' | 'plane';
export type Corner = 'tl' | 'tr' | 'bl' | 'br';

/** Элемент декора из тайлов «Фон» библиотеки (используется как есть, привязан к углу кадра). */
export interface DecorElement {
  id: string;
  set: DecorSetId;
  corner: Corner;
  /** Смещение габарита элемента от выбранного угла тайла (для tl — от левого верхнего и т.д.). */
  offset: { x: number; y: number };
  box: Box;
  markup: string;
}

export interface Format {
  id: string;
  name: string;
  /** Размер кадра в единицах L (для S делится на sizeScale). */
  width: number;
  height: number;
}

/** Эталонная раскладка, восстановленная из примеров дизайнера. */
export interface ExampleLayout {
  id: string;
  formatId: string;
  width: number;
  height: number;
  decor: DecorSetId | 'none';
  items: Array<{ objectId: string; state: ObjectState; x: number; y: number }>;
}

export interface Library {
  version: string;
  baseSchemeId: string;
  schemes: ColorScheme[];
  sizeScale: Record<SizeClass, number>;
  formats: Format[];
  objects: LibraryObject[];
  decor: Record<SizeClass, DecorElement[]>;
  examples: ExampleLayout[];
}

/** Элемент композиции. Координаты — центр объекта в единицах L относительно кадра. */
export interface CompositionItem {
  uid: string;
  objectId: string;
  state: ObjectState;
  x: number;
  y: number;
  /** Градусы, по часовой стрелке. */
  rotation: number;
  flipX?: boolean;
}

export type LayoutMode = 'compact' | 'offset' | 'heading';

export interface Composition {
  /** Ширина/высота кадра в единицах L. */
  width: number;
  height: number;
  formatId?: string;
  size: SizeClass;
  schemeId: string;
  /** Роль цвета заливки кадра (только цвета фона). */
  background: 'bg1' | 'bg2' | 'bg3';
  decor: DecorSetId | 'none';
  /** Порядок массива = порядок слоёв (первый — самый нижний). */
  items: CompositionItem[];
}
