// Text helpers shared by the styles' animations.

import { h } from './dom.ts';

/** Wrap each word of an element's text in a span (for staggered word animations). */
export function splitWords(el: HTMLElement, wordCls = 'w'): HTMLElement[] {
  const parts = (el.textContent ?? '').split(/(\s+)/);
  el.textContent = '';
  const out: HTMLElement[] = [];
  for (const part of parts) {
    if (!part) continue;
    // Keep whitespace as written so line breaks survive (text uses pre-wrap).
    if (/^\s+$/.test(part)) el.appendChild(document.createTextNode(part));
    else out.push(h('span', wordCls, el, part));
  }
  return out;
}

/** Parse "24%", "$1.2M", "3x" into prefix / number / suffix for count-up effects. */
export function parseStat(text: string): { prefix: string; value: number; decimals: number; suffix: string } | null {
  const m = text.trim().match(/^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/);
  if (!m) return null;
  const raw = m[2].replace(/,/g, '');
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
  return { prefix: m[1], value, decimals, suffix: m[3] };
}

export function formatStat(stat: NonNullable<ReturnType<typeof parseStat>>, v: number, grouped: boolean): string {
  const num = v.toFixed(stat.decimals);
  const withCommas = grouped ? num.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : num;
  return `${stat.prefix}${withCommas}${stat.suffix}`;
}
