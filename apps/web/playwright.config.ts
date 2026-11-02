import { defineConfig, devices } from '@playwright/test';

const PORT = 8899;

/**
 * E2E: собирает фронтенд и поднимает настоящий сервер на отдельном порту.
 * Ключ Claude принудительно пустой — анализ метафор офлайн, результаты детерминированы.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npm run build && cd ../server && PORT=${PORT} ANTHROPIC_API_KEY= PALETTES_PATH=../../tmp/e2e-palettes-${Date.now()}.json npx tsx src/main.ts`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
