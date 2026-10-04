// Fonts embedded into exported presentations (as base64), per style. The files come
// from @fontsource packages (SIL Open Font License), so exports work fully offline.

import type { StyleId } from './types.ts';

export interface FontFile {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  /** Path inside node_modules. */
  file: string;
}

const f = (family: string, pkg: string, weight: number, style: 'normal' | 'italic' = 'normal'): FontFile => ({
  family,
  weight,
  style,
  file: `@fontsource/${pkg}/files/${pkg}-latin-${weight}-${style}.woff2`,
});

export const STYLE_FONTS: Record<StyleId, FontFile[]> = {
  kinetic: [f('Anton', 'anton', 400), f('Nunito', 'nunito', 700), f('Nunito', 'nunito', 800)],
  whiteboard: [f('Caveat', 'caveat', 600), f('Caveat', 'caveat', 700)],
  book: [f('Lora', 'lora', 400), f('Lora', 'lora', 400, 'italic'), f('Lora', 'lora', 700)],
  origami: [f('Nunito', 'nunito', 600), f('Nunito', 'nunito', 800), f('Nunito', 'nunito', 900)],
};

/** Fonts for the Layer 1 slide look (editor thumbnails and PDF export). */
export const SLIDE_FONTS: FontFile[] = [f('Nunito', 'nunito', 600), f('Nunito', 'nunito', 800)];

export function fontFaceCss(files: FontFile[], dataFor: (file: FontFile) => string): string {
  return files
    .map(
      (ff) =>
        `@font-face{font-family:'${ff.family}';font-style:${ff.style};font-weight:${ff.weight};font-display:block;src:url(${dataFor(ff)}) format('woff2');}`,
    )
    .join('\n');
}
