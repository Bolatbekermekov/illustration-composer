// Сборка для Vercel по Build Output API v3 (https://vercel.com/docs/build-output-api/v3):
// статика фронтенда + одна Node-функция с API (бандл esbuild) + library.json рядом с ней.
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const out = '.vercel/output';
const fn = `${out}/functions/api.func`;

execSync('npm run build', { stdio: 'inherit' });
rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });

cpSync('apps/web/dist', `${out}/static`, { recursive: true });
cpSync('library/library.json', `${fn}/library.json`);

await build({
  entryPoints: ['apps/server/src/vercel-handler.ts'],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: false,
  // CJS-зависимости (fastify и др.) внутри ESM-бандла используют require/__dirname
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; import { fileURLToPath as __fu } from 'node:url'; import { dirname as __dn } from 'node:path'; const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __dn(__filename);",
  },
  logLevel: 'info',
});

writeFileSync(
  `${fn}/.vc-config.json`,
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 60 }, null, 2),
);
writeFileSync(`${fn}/package.json`, JSON.stringify({ type: 'module' }));

writeFileSync(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/api/(.*)$', dest: '/api?__path=$1' },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log('Vercel output ready:', out);
