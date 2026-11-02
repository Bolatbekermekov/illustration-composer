import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import {
  autoLayout,
  ComposeError,
  composeFromText,
  parsePalette,
  renderComposition,
  resolveScheme,
  type Composition,
  type Library,
  type MetaphorAnalyzer,
} from '@ic/core';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PaletteRuleError, type PaletteStore } from './palettes-store.ts';

export interface AppDeps {
  library: Library;
  /** Анализатор метафор (Claude); без него — офлайн-анализ ядра. */
  analyzer?: MetaphorAnalyzer;
  palettes: PaletteStore;
  llm: { enabled: boolean; model?: string };
  /** Собранный фронтенд (apps/web/dist) — отдаётся в production. */
  webDist?: string;
  logger?: boolean;
}

const Hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const SchemeBody = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  colors: z.object({ bg1: Hex, bg2: Hex, bg3: Hex, ink: Hex, obj1: Hex, obj2: Hex, obj3: Hex, paper: Hex }),
});
const LayoutMode = z.enum(['compact', 'offset', 'heading']);
const Size = z.enum(['L', 'S']);

const ComposeBody = z.object({
  mode: z.enum(['metaphor', 'names']),
  text: z.string().min(1).max(500),
  formatId: z.string().max(40).optional(),
  width: z.number().min(200).max(4000).optional(),
  height: z.number().min(200).max(4000).optional(),
  size: Size.optional(),
  schemeId: z.string().max(80).optional(),
  layout: z.union([LayoutMode, z.literal('auto')]).optional(),
  variants: z.number().int().min(1).max(8).optional(),
  seed: z.number().int().optional(),
  decor: z.enum(['strokes', 'plane', 'none', 'auto']).optional(),
});

const ItemBody = z.object({
  uid: z.string().max(80),
  objectId: z.string().max(40),
  state: z.enum(['main', 'background']),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  flipX: z.boolean().optional(),
});
const CompositionBody = z.object({
  width: z.number().min(50).max(8000),
  height: z.number().min(50).max(8000),
  formatId: z.string().max(40).optional(),
  size: Size,
  schemeId: z.string().max(80),
  background: z.enum(['bg1', 'bg2', 'bg3']),
  decor: z.enum(['strokes', 'plane', 'none']),
  items: z.array(ItemBody).max(40),
});

const LayoutBody = z.object({
  items: z
    .array(
      z.object({
        objectId: z.string().max(40),
        state: z.enum(['main', 'background']),
        role: z.enum(['hero', 'support', 'background']).optional(),
        lockState: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(8),
  width: z.number().min(200).max(4000),
  height: z.number().min(200).max(4000),
  mode: LayoutMode.optional(),
  seed: z.number().int().optional(),
  variants: z.number().int().min(1).max(8).optional(),
});

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false, bodyLimit: 2 * 1024 * 1024 });
  const lib = deps.library;
  const knownObjects = new Set(lib.objects.map((o) => o.id));

  const bad = (issues: z.core.$ZodIssue[]) => ({
    error: 'Некорректный запрос',
    details: issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`),
  });
  const schemeFor = (id: string) => deps.palettes.get(id) ?? resolveScheme(lib, id);

  app.get('/api/health', async () => ({ ok: true, llm: deps.llm, objects: lib.objects.length }));

  app.get('/api/library', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=300');
    return lib;
  });

  app.post('/api/compose', async (req, reply) => {
    const parsed = ComposeBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(bad(parsed.error.issues));
    try {
      return await composeFromText(parsed.data, lib, deps.analyzer);
    } catch (e) {
      if (e instanceof ComposeError) return reply.code(422).send({ error: e.message, code: e.code });
      throw e;
    }
  });

  app.post('/api/layout', async (req, reply) => {
    const parsed = LayoutBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(bad(parsed.error.issues));
    const unknown = parsed.data.items.filter((i) => !knownObjects.has(i.objectId)).map((i) => i.objectId);
    if (unknown.length) return reply.code(422).send({ error: `Нет в библиотеке: ${unknown.join(', ')}` });
    return { variants: autoLayout(parsed.data, lib) };
  });

  app.post('/api/render', async (req, reply) => {
    const body = z.object({ composition: CompositionBody, title: z.string().max(200).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send(bad(body.error.issues));
    const c = body.data.composition as Composition;
    const unknown = c.items.filter((i) => !knownObjects.has(i.objectId));
    if (unknown.length) return reply.code(422).send({ error: `Нет в библиотеке: ${unknown.map((i) => i.objectId).join(', ')}` });
    const svg = renderComposition(c, lib, { scheme: schemeFor(c.schemeId), ...(body.data.title ? { title: body.data.title } : {}) });
    reply.header('content-type', 'image/svg+xml; charset=utf-8');
    if ((req.query as { download?: string }).download) {
      reply.header('content-disposition', `attachment; filename="composition-${c.size}-${c.width}x${c.height}.svg"`);
    }
    return svg;
  });

  app.get('/api/palettes', async () => ({ palettes: deps.palettes.list() }));

  app.post('/api/palettes', async (req, reply) => {
    const body = z
      .union([z.object({ content: z.string().min(1).max(500_000), filename: z.string().max(200).optional() }), z.object({ scheme: SchemeBody })])
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send(bad(body.error.issues));
    let scheme;
    let warnings: string[] = [];
    if ('content' in body.data) {
      const res = parsePalette(body.data.content, body.data.filename);
      if (!res.ok) return reply.code(422).send({ error: res.error });
      scheme = res.scheme;
      warnings = res.warnings;
    } else {
      scheme = body.data.scheme;
    }
    try {
      const saved = deps.palettes.save(scheme);
      return reply.code(201).send({ scheme: saved.scheme, warnings: [...new Set([...warnings, ...saved.warnings])] });
    } catch (e) {
      if (e instanceof PaletteRuleError) return reply.code(422).send({ error: e.message });
      throw e;
    }
  });

  app.delete('/api/palettes/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return deps.palettes.remove(id) ? reply.code(204).send() : reply.code(404).send({ error: 'Палитра не найдена' });
  });

  if (deps.webDist && existsSync(deps.webDist)) {
    await app.register(fastifyStatic, { root: deps.webDist, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Не найдено' });
      return reply.sendFile('index.html');
    });
  }

  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err);
    reply.code(500).send({ error: 'Внутренняя ошибка сервера' });
  });

  return app;
}
