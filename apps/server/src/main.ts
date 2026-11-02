import { buildApp } from './app.ts';
import { config, createAnalyzer } from './config.ts';
import { loadLibrary } from './library-repo.ts';
import { PaletteStore } from './palettes-store.ts';

const analyzer = createAnalyzer();
const app = await buildApp({
  library: loadLibrary(),
  analyzer,
  palettes: new PaletteStore(config.palettesPath),
  llm: { enabled: Boolean(analyzer), ...(analyzer ? { model: config.model } : {}) },
  webDist: config.webDist,
  logger: true,
});

await app.listen({ port: config.port, host: config.host });
app.log.info(
  `Illustration Composer: http://${config.host}:${config.port} · анализ метафор: ${analyzer ? `Claude (${config.model})` : 'офлайн'}`,
);
