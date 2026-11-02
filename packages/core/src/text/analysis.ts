import type { Library, ObjectState } from '../domain/types.ts';
import type { LayoutRole } from '../layout/score.ts';

/** Результат смыслового анализа заголовка/метафоры: какие объекты и почему. */
export interface AnalysisItem {
  objectId: string;
  state: ObjectState;
  role: LayoutRole;
  reason: string;
  lockState?: boolean;
}

export interface MetaphorAnalysis {
  items: AnalysisItem[];
  summary: string;
  /** claude — LLM, keywords — офлайн-анализ по смыслам каталога, names — сценарий 2. */
  source: 'claude' | 'keywords' | 'names';
  confidence: 'high' | 'medium' | 'low';
  model?: string;
  /** Почему пришлось перейти на офлайн-анализ (ошибка/таймаут LLM). */
  fallbackReason?: string;
  /** Слова, которых нет в библиотеке (сценарий 2). */
  unknown?: string[];
}

/** Порт: анализатор метафор (Claude в инфраструктуре сервера или офлайн-анализатор ядра). */
export interface AnalysisContext {
  /** Кадр в единицах L — чтобы не перегружать узкие форматы крупными объектами. */
  width: number;
  height: number;
}

export interface MetaphorAnalyzer {
  readonly name: string;
  analyze(text: string, lib: Library, context?: AnalysisContext): Promise<MetaphorAnalysis>;
}
