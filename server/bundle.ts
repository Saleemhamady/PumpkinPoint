// Build-time helpers shared by the Vite plugin and the CLI export script: bundle the
// runtime player into one IIFE string and inline the fonts as base64.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import { FONT_FAMILIES, fontFaceCss, type FontFile } from '../src/shared/fonts.ts';
import { FONT_KEYS, type FontKey } from '../src/shared/types.ts';

export async function bundleRuntime(root: string, minify = true): Promise<{ code: string; inputs: string[] }> {
  const result = await build({
    entryPoints: [path.join(root, 'src/runtime/main.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify,
    write: false,
    metafile: true,
    legalComments: 'none',
    logLevel: 'silent',
  });
  return {
    code: result.outputFiles[0].text,
    inputs: Object.keys(result.metafile.inputs).map((p) => path.resolve(root, p)),
  };
}

export function fontCss(root: string, files: FontFile[]): string {
  const require = createRequire(path.join(root, 'package.json'));
  return fontFaceCss(files, (f) => `data:font/woff2;base64,${readFileSync(require.resolve(f.file)).toString('base64')}`);
}

/** @font-face rules (with embedded files) for each font family. */
export function familyFontCss(root: string): Record<FontKey, string> {
  return Object.fromEntries(FONT_KEYS.map((k) => [k, fontCss(root, FONT_FAMILIES[k].files)])) as Record<FontKey, string>;
}
