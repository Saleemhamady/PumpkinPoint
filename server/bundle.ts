// Build-time helpers shared by the Vite plugin and the CLI export script: bundle the
// runtime player into one IIFE string and inline the fonts as base64.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import { SLIDE_FONTS, STYLE_FONTS, fontFaceCss, type FontFile } from '../src/shared/fonts.ts';
import { STYLE_IDS, type StyleId } from '../src/shared/types.ts';

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

export function allFontCss(root: string): { styles: Record<StyleId, string>; slides: string } {
  const styles = Object.fromEntries(STYLE_IDS.map((id) => [id, fontCss(root, STYLE_FONTS[id])])) as Record<StyleId, string>;
  return { styles, slides: fontCss(root, SLIDE_FONTS) };
}
