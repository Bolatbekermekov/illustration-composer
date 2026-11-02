// Запускает API-сервер (tsx watch) и Vite одновременно; Ctrl+C останавливает оба.
import { spawn } from 'node:child_process';

const run = (args) => spawn('npm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
const children = [run(['run', 'dev', '--workspace', '@ic/server']), run(['run', 'dev', '--workspace', '@ic/web'])];
const stop = () => {
  for (const c of children) if (!c.killed) c.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const c of children) c.on('exit', (code) => { stop(); process.exitCode = code ?? 0; });
