// Vite plugin: serves the AI endpoints, and exposes the bundled runtime player and
// the embedded fonts to the editor as virtual modules (used when exporting).

import path from 'node:path';
import type { Plugin } from 'vite';
import { createApiHandler } from './api.ts';
import { bundleRuntime, familyFontCss } from './bundle.ts';

const RUNTIME_ID = 'virtual:pumpkin-runtime';
const FONTS_ID = 'virtual:pumpkin-fonts';

export function pumpkinPoint(env: Record<string, string>): Plugin {
  const root = process.cwd();
  let runtimeInputs = new Set<string>();
  const api = createApiHandler({ apiKey: env.ANTHROPIC_API_KEY || undefined, model: env.PUMPKIN_MODEL || undefined });

  return {
    name: 'pumpkinpoint',
    resolveId(id) {
      if (id === RUNTIME_ID || id === FONTS_ID) return '\0' + id;
      return null;
    },
    async load(id) {
      if (id === '\0' + RUNTIME_ID) {
        const { code, inputs } = await bundleRuntime(root, true);
        runtimeInputs = new Set(inputs);
        for (const file of inputs) this.addWatchFile(file);
        return `export default ${JSON.stringify(code)};`;
      }
      if (id === '\0' + FONTS_ID) {
        return `export const familyFonts = ${JSON.stringify(familyFontCss(root))};`;
      }
      return null;
    },
    handleHotUpdate({ file, server }) {
      // Editing the runtime rebuilds the bundle the editor exports with.
      if (runtimeInputs.has(path.resolve(file))) {
        const mod = server.moduleGraph.getModuleById('\0' + RUNTIME_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
        return [];
      }
      return undefined;
    },
    configureServer(server) {
      server.middlewares.use('/api', api);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api', api);
    },
  };
}
