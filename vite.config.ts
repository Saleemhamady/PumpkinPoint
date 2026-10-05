import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { pumpkinPoint } from './server/vite-plugin.ts';

export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') } as Record<string, string>;
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  return {
    plugins: [react(), pumpkinPoint(env)],
    // Shown in the editor's top bar, so it is easy to tell which version is running.
    define: { __APP_VERSION__: JSON.stringify(version) },
    // The editor embeds every style's fonts so exports work offline.
    build: { chunkSizeWarningLimit: 1200 },
    test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  };
});
