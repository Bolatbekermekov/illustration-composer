import type { AnalysisContext, Library, MetaphorAnalysis, MetaphorAnalyzer } from '@ic/core';

/**
 * Ограничивает число обращений к платному анализатору в скользящем окне.
 * Сверх лимита бросает ошибку — ядро переключается на офлайн-анализ (fallbackReason).
 * Нужен для публичного демо, чтобы ключ API нельзя было израсходовать массовыми запросами.
 */
export class RateLimitedAnalyzer implements MetaphorAnalyzer {
  private readonly calls: number[] = [];

  constructor(
    private readonly inner: MetaphorAnalyzer,
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get name(): string {
    return this.inner.name;
  }

  analyze(text: string, lib: Library, context?: AnalysisContext): Promise<MetaphorAnalysis> {
    const t = this.now();
    while (this.calls.length && this.calls[0]! <= t - this.windowMs) this.calls.shift();
    if (this.calls.length >= this.limit) {
      return Promise.reject(new Error('превышен лимит запросов к модели, использован офлайн-анализ'));
    }
    this.calls.push(t);
    return this.inner.analyze(text, lib, context);
  }
}
