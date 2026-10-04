// Tiny DOM helpers for the runtime (no framework, so exports stay small).

import { polyPath, type MotifDef, type Poly } from '../shared/motifs.ts';

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  parent?: Element | null,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  parent?.appendChild(el);
  return el;
}

export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element | null,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.appendChild(el);
  return el;
}

export function css(el: HTMLElement | SVGElement, styles: Partial<Record<string, string | number>>): void {
  for (const [k, v] of Object.entries(styles)) {
    if (v === undefined) continue;
    if (k.startsWith('--')) el.style.setProperty(k, String(v));
    else (el.style as unknown as Record<string, string>)[k] = typeof v === 'number' && !/opacity|zIndex|flex/.test(k) ? `${v}px` : String(v);
  }
}

export function injectStyle(id: string, text: string): void {
  if (document.getElementById(id)) return;
  const st = document.createElement('style');
  st.id = id;
  st.textContent = text;
  document.head.appendChild(st);
}

/** A flat-filled SVG of a motif (paper cut-out look). */
export function motifSvg(def: MotifDef, tones: string[], size: number, cls = ''): SVGSVGElement {
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: cls });
  svg.style.overflow = 'visible';
  for (const poly of def.polys) {
    if (poly.f === false) continue;
    s('path', { d: polyPath(poly, 0, 0, size), fill: tones[poly.t], 'stroke-linejoin': 'round' }, svg);
  }
  return svg;
}

/** Polygon points as a CSS clip-path in percentages of a 100-unit box. */
export function clipPolygon(poly: Poly, boxW = 100, boxH = 100, offX = 0, offY = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < poly.p.length; i += 2) {
    pts.push(`${(((poly.p[i] + offX) / boxW) * 100).toFixed(2)}% ${(((poly.p[i + 1] + offY) / boxH) * 100).toFixed(2)}%`);
  }
  return `polygon(${pts.join(',')})`;
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
