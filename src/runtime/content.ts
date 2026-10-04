// Builds the Layer 1 content of a slide (title, bullets...) as DOM. Each style
// positions and animates these parts in its own way.

import type { SlideContent } from '../shared/types.ts';
import { h } from './dom.ts';

export interface ContentParts {
  root: HTMLElement;
  /** Big text: the title, the statement, or the number of a stat slide. */
  title: HTMLElement;
  subtitle: HTMLElement | null;
  bullets: HTMLElement[];
}

export function renderContent(slide: SlideContent, parent: HTMLElement, cls = ''): ContentParts {
  const root = h('div', `c-root l-${slide.layout} ${cls}`.trim(), parent);
  const titleCls = slide.layout === 'stat' ? 'c-stat' : slide.layout === 'statement' ? 'c-statement' : 'c-title';
  const title = h('div', titleCls, root, slide.title);
  const subtitle = slide.subtitle.trim() ? h('div', 'c-sub', root, slide.subtitle) : null;
  const bullets: HTMLElement[] = [];
  const items = slide.bullets.filter((b) => b.trim());
  if (items.length) {
    const ul = h('ul', 'c-bullets', root);
    for (const b of items) {
      const li = h('li', 'c-bullet', ul);
      h('span', 'c-mark', li);
      h('span', 'c-text', li, b);
      bullets.push(li);
    }
  }
  return { root, title, subtitle, bullets };
}

/**
 * Shrink the `--fs` font scale of `root` until its content fits inside `box`
 * (width x height in CSS pixels). Styles express font sizes as calc(var(--fs) * N).
 */
export function fitContent(root: HTMLElement, maxW: number, maxH: number, min = 0.45): number {
  let fs = 1;
  root.style.setProperty('--fs', '1');
  const fits = () => root.scrollHeight <= maxH + 1 && root.scrollWidth <= maxW + 1 && noWideChild(root, maxW);
  while (!fits() && fs > min) {
    fs = Math.max(min, fs - 0.05);
    root.style.setProperty('--fs', fs.toFixed(2));
  }
  return fs;
}

function noWideChild(root: HTMLElement, maxW: number): boolean {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('.c-title,.c-stat,.c-statement,.c-sub,.c-text'))) {
    if (el.scrollWidth > maxW + 1) return false;
  }
  return true;
}

/** Wrap each word of an element's text in a span (for staggered word animations). */
export function splitWords(el: HTMLElement, wordCls = 'w'): HTMLElement[] {
  const words = (el.textContent ?? '').split(/(\s+)/);
  el.textContent = '';
  const out: HTMLElement[] = [];
  for (const w of words) {
    if (!w) continue;
    if (/^\s+$/.test(w)) {
      el.appendChild(document.createTextNode(' '));
      continue;
    }
    const span = h('span', wordCls, el, w);
    out.push(span);
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
