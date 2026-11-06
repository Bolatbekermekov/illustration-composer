import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import type { MetaphorAnalyzer } from '@ic/core';
import { ClaudeMetaphorAnalyzer, sdkParse } from './claude-analyzer.ts';
import { RateLimitedAnalyzer } from './rate-limited-analyzer.ts';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '127.0.0.1',
  model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
  effort: (process.env.ANTHROPIC_EFFORT ?? 'low') as 'low' | 'medium' | 'high',
  llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 25_000),
  palettesPath: process.env.PALETTES_PATH ?? fileURLToPath(new URL('../../../data/palettes.json', import.meta.url)),
  webDist: fileURLToPath(new URL('../../web/dist', import.meta.url)),
  /** Сколько обращений к модели допускается за окно (защита ключа на публичном демо). */
  llmRateLimit: Number(process.env.LLM_RATE_LIMIT ?? 60),
  llmRateWindowMs: Number(process.env.LLM_RATE_WINDOW_MS ?? 60 * 60 * 1000),
  hasKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
};

/** Адаптер Claude, если есть ключ; иначе undefined → офлайн-анализ метафор в ядре. */
export function createAnalyzer(): MetaphorAnalyzer | undefined {
  if (!config.hasKey) return undefined;
  const client = new Anthropic();
  const claude = new ClaudeMetaphorAnalyzer({ parse: sdkParse(client, config.llmTimeoutMs), model: config.model, effort: config.effort });
  return new RateLimitedAnalyzer(claude, config.llmRateLimit, config.llmRateWindowMs);
}
