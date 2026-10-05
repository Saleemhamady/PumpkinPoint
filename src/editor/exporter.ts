// Turns the compiled deck into the single-file presentation.

import runtimeCode from 'virtual:pumpkin-runtime';
import { familyFonts } from 'virtual:pumpkin-fonts';
import { assembleHtml } from '../shared/assemble.ts';
import { toRuntimeData } from '../shared/compiler.ts';
import { fontsForDeck } from '../shared/fonts.ts';
import { FONT_KEYS, type Deck, type ScenePlan } from '../shared/types.ts';

/** @font-face rules for every family (the editor shows all of them). */
export const allFontsCss = FONT_KEYS.map((k) => familyFonts[k]).join('\n');

export function presentationHtml(deck: Deck, plans: ScenePlan[]): string {
  const fonts = fontsForDeck(deck).map((k) => familyFonts[k]).join('\n');
  return assembleHtml(toRuntimeData(deck, plans), runtimeCode, fonts);
}

export function safeFilename(title: string, ext: string): string {
  const base = title.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'presentation';
  return `${base}.${ext}`;
}

export function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function openInNewTab(html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
