import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.ts';
import { config, createAnalyzer } from './config.ts';
import { loadLibrary } from './library-repo.ts';
import { PaletteStore } from './palettes-store.ts';

/**
 * Точка входа для serverless-функции Vercel (собирается scripts/vercel-build.mjs в один файл).
 * Фронтенд отдаётся Vercel как статика, сюда приходят только запросы /api/*.
 * library.json кладётся рядом с бандлом; палитры — во временный каталог инстанса.
 */
let appPromise: Promise<FastifyInstance> | undefined;

async function init(): Promise<FastifyInstance> {
  const analyzer = createAnalyzer();
  const app = await buildApp({
    library: loadLibrary(fileURLToPath(new URL('./library.json', import.meta.url))),
    analyzer,
    palettes: new PaletteStore(process.env.PALETTES_PATH ?? '/tmp/illustration-composer/palettes.json'),
    llm: { enabled: Boolean(analyzer), ...(analyzer ? { model: config.model } : {}) },
  });
  await app.ready();
  return app;
}

/** Vercel может передать путь как ?__path=… после rewrite — восстанавливаем исходный /api/… */
export function restoreUrl(url: string): string {
  if (url.startsWith('/api/')) return url;
  const u = new URL(url, 'http://local');
  const path = u.searchParams.get('__path');
  if (path === null) return url;
  u.searchParams.delete('__path');
  return `/api/${path}${u.search}`;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await (appPromise ??= init());
  req.url = restoreUrl(req.url ?? '/');
  app.server.emit('request', req, res);
}
