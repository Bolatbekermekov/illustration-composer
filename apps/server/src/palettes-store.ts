import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { validateScheme, type ColorScheme } from '@ic/core';

/** Загруженные пользователями палитры: JSON-файл (атомарная запись через временный файл). */
export class PaletteStore {
  private items: ColorScheme[];

  constructor(private readonly path: string) {
    this.items = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as ColorScheme[]) : [];
  }

  list(): ColorScheme[] {
    return [...this.items];
  }

  get(id: string): ColorScheme | undefined {
    return this.items.find((p) => p.id === id);
  }

  /** Сохраняет палитру после проверки правил схемы. Одинаковые цвета → та же запись (id по хэшу цветов). */
  save(scheme: ColorScheme): { scheme: ColorScheme; warnings: string[] } {
    const { errors, warnings } = validateScheme(scheme);
    if (errors.length) throw new PaletteRuleError(errors.join(' '));
    const clean: ColorScheme = { id: scheme.id, name: scheme.name.slice(0, 60), colors: scheme.colors };
    this.items = [...this.items.filter((p) => p.id !== clean.id), clean];
    this.flush();
    return { scheme: clean, warnings };
  }

  remove(id: string): boolean {
    const before = this.items.length;
    this.items = this.items.filter((p) => p.id !== id);
    if (this.items.length !== before) this.flush();
    return this.items.length !== before;
  }

  private flush() {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.items, null, 2));
    renameSync(tmp, this.path);
  }
}

export class PaletteRuleError extends Error {}
