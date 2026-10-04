import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { pumpkinPoint } from './server/vite-plugin.ts';

export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') } as Record<string, string>;
  return {
    plugins: [react(), pumpkinPoint(env)],
    // The editor embeds every style's fonts so exports work offline.
    build: { chunkSizeWarningLimit: 1200 },
    test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  };
});
