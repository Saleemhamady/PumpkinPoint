// Turns the compiled deck into the single-file presentation.

import runtimeCode from 'virtual:pumpkin-runtime';
import { styleFonts } from 'virtual:pumpkin-fonts';
import { assembleHtml } from '../shared/assemble.ts';
import { toRuntimeData } from '../shared/compiler.ts';
import type { Deck, ScenePlan } from '../shared/types.ts';

export function presentationHtml(deck: Deck, plans: ScenePlan[]): string {
  return assembleHtml(toRuntimeData(deck, plans), runtimeCode, styleFonts[deck.style]);
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
