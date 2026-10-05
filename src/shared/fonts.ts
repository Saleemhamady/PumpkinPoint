// Typefaces. Exports embed the files (as base64) for every family a deck uses, so
// presentations work fully offline. Files come from @fontsource (SIL Open Font License).

import type { Deck, FontKey, StyleId, TextRole } from './types.ts';

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

export interface FontFamily {
  label: string;
  css: string;
  normal: number;
  bold: number;
  files: FontFile[];
}

export const FONT_FAMILIES: Record<FontKey, FontFamily> = {
  sans: { label: 'Rounded sans', css: "'Nunito',system-ui,-apple-system,'Segoe UI',sans-serif", normal: 600, bold: 800, files: [f('Nunito', 'nunito', 600), f('Nunito', 'nunito', 800)] },
  serif: { label: 'Book serif', css: "'Lora',Georgia,'Times New Roman',serif", normal: 400, bold: 700, files: [f('Lora', 'lora', 400), f('Lora', 'lora', 400, 'italic'), f('Lora', 'lora', 700)] },
  hand: { label: 'Handwriting', css: "'Caveat','Segoe Print','Bradley Hand',cursive", normal: 600, bold: 700, files: [f('Caveat', 'caveat', 600), f('Caveat', 'caveat', 700)] },
  display: { label: 'Poster', css: "'Anton',Impact,'Arial Narrow Bold',sans-serif", normal: 400, bold: 400, files: [f('Anton', 'anton', 400)] },
};

/** The typefaces each style uses for text set to 'auto'. */
export const STYLE_FONTS: Record<StyleId, { title: FontKey; body: FontKey }> = {
  kinetic: { title: 'display', body: 'sans' },
  origami: { title: 'sans', body: 'sans' },
  whiteboard: { title: 'hand', body: 'hand' },
  book: { title: 'serif', body: 'serif' },
};

export function fontFor(font: FontKey | 'auto', role: TextRole, style: StyleId): FontKey {
  if (font !== 'auto') return font;
  const set = STYLE_FONTS[style];
  return role === 'title' || role === 'stat' ? set.title : set.body;
}

/** Every family a deck needs when presented in its style. */
export function fontsForDeck(deck: Pick<Deck, 'style' | 'slides'>): FontKey[] {
  const keys = new Set<FontKey>([STYLE_FONTS[deck.style].title, STYLE_FONTS[deck.style].body]);
  for (const slide of deck.slides) {
    for (const el of slide.elements) if (el.type === 'text' && el.font !== 'auto') keys.add(el.font);
  }
  return [...keys];
}

export function fontFaceCss(files: FontFile[], dataFor: (file: FontFile) => string): string {
  return files
    .map(
      (ff) =>
        `@font-face{font-family:'${ff.family}';font-style:${ff.style};font-weight:${ff.weight};font-display:block;src:url(${dataFor(ff)}) format('woff2');}`,
    )
    .join('\n');
}
