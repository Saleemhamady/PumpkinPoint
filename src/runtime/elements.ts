// Renders slide elements (text, shapes, images) as DOM at their canvas positions.
// The editor uses this same code for its canvas and thumbnails, so what you place in
// the editor is exactly what the presentation shows.

import { FONT_FAMILIES, fontFor } from '../shared/fonts.ts';
import { resolveColor, type Theme } from '../shared/theme.ts';
import type { ShapeElement, ShapeKind, SlideElement, TextElement } from '../shared/types.ts';
import { h, injectStyle, s } from './dom.ts';

export const ELEMENT_CSS = `
.pp-el{position:absolute;box-sizing:border-box;transform-origin:50% 50%}
.pp-txt{display:flex;flex-direction:column;overflow-wrap:break-word;word-break:normal}
.pp-txt .pp-t{white-space:pre-wrap;margin:0}
.pp-list{list-style:none;margin:0;padding:0}
.pp-list li{position:relative;padding-left:1.1em;margin:0 0 .32em;white-space:pre-wrap}
.pp-list li:last-child{margin-bottom:0}
.pp-list li::before{content:'';position:absolute;left:.12em;top:.48em;width:.4em;height:.4em;border-radius:50%;background:var(--pp-accent)}
.pp-el svg{position:absolute;left:0;top:0;overflow:visible}
.pp-el img{position:absolute;left:0;top:0;width:100%;height:100%;display:block;user-select:none;-webkit-user-drag:none}
`;

const R = (n: number) => Math.round(n * 10) / 10;

/** SVG path for a shape filling a w x h box, inset so a stroke stays inside the box. */
export function shapePath(kind: ShapeKind, w: number, h: number, inset: number): string {
  const x0 = inset;
  const y0 = inset;
  const x1 = Math.max(x0 + 1, w - inset);
  const y1 = Math.max(y0 + 1, h - inset);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const pts = (list: number[][]) => 'M' + list.map(([x, y]) => `${R(x)} ${R(y)}`).join('L') + 'Z';
  switch (kind) {
    case 'rect':
      return pts([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    case 'round': {
      const r = Math.min(x1 - x0, y1 - y0) * 0.18;
      return `M${R(x0 + r)} ${R(y0)}H${R(x1 - r)}A${R(r)} ${R(r)} 0 0 1 ${R(x1)} ${R(y0 + r)}V${R(y1 - r)}A${R(r)} ${R(r)} 0 0 1 ${R(x1 - r)} ${R(y1)}H${R(x0 + r)}A${R(r)} ${R(r)} 0 0 1 ${R(x0)} ${R(y1 - r)}V${R(y0 + r)}A${R(r)} ${R(r)} 0 0 1 ${R(x0 + r)} ${R(y0)}Z`;
    }
    case 'ellipse': {
      const rx = (x1 - x0) / 2;
      const ry = (y1 - y0) / 2;
      return `M${R(cx - rx)} ${R(cy)}A${R(rx)} ${R(ry)} 0 1 0 ${R(cx + rx)} ${R(cy)}A${R(rx)} ${R(ry)} 0 1 0 ${R(cx - rx)} ${R(cy)}Z`;
    }
    case 'triangle':
      return pts([[cx, y0], [x1, y1], [x0, y1]]);
    case 'diamond':
      return pts([[cx, y0], [x1, cy], [cx, y1], [x0, cy]]);
    case 'star': {
      const list: number[][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 0.4 : 1;
        list.push([cx + Math.cos(a) * r * (x1 - x0) / 2, cy + Math.sin(a) * r * (y1 - y0) / 2 + (y1 - y0) * 0.05]);
      }
      return pts(list);
    }
    case 'arrow': {
      const head = Math.min((x1 - x0) * 0.45, (y1 - y0) * 1.1);
      const t = (y1 - y0) * 0.22;
      return pts([[x0, cy - t], [x1 - head, cy - t], [x1 - head, y0], [x1, cy], [x1 - head, y1], [x1 - head, cy + t], [x0, cy + t]]);
    }
    case 'line':
      return `M${R(x0)} ${R(cy)}L${R(x1)} ${R(cy)}`;
  }
}

function place(node: HTMLElement, el: SlideElement): void {
  node.style.left = `${el.x}px`;
  node.style.top = `${el.y}px`;
  node.style.width = `${el.w}px`;
  node.style.height = `${el.h}px`;
  if (el.rotation) node.style.rotate = `${el.rotation}deg`;
}

export function textStyle(el: TextElement, theme: Theme): Partial<CSSStyleDeclaration> {
  const fam = FONT_FAMILIES[fontFor(el.font, el.role, theme.style)];
  return {
    fontFamily: fam.css,
    fontWeight: String(el.bold ? fam.bold : fam.normal),
    fontStyle: el.italic ? 'italic' : 'normal',
    fontSize: `${el.size}px`,
    lineHeight: el.role === 'title' || el.role === 'stat' ? '1.06' : '1.28',
    color: resolveColor(el.color, theme),
    textAlign: el.align,
  };
}

/** Fill a text element's inner container with its words (plain or as a list). */
export function fillText(inner: HTMLElement, el: TextElement): void {
  inner.textContent = '';
  if (el.list) {
    const ul = h('ul', 'pp-list pp-words', inner);
    for (const line of el.text.split('\n')) if (line.trim()) h('li', '', ul, line.trim());
  } else {
    h('p', 'pp-t pp-words', inner, el.text);
  }
}

export function renderElement(el: SlideElement, theme: Theme, parent?: HTMLElement | null): HTMLElement {
  const node = h('div', `pp-el pp-${el.type}`, parent);
  node.dataset.id = el.id;
  place(node, el);
  switch (el.type) {
    case 'text': {
      node.classList.add('pp-txt');
      Object.assign(node.style, textStyle(el, theme));
      node.style.justifyContent = el.valign === 'middle' ? 'center' : el.valign === 'bottom' ? 'flex-end' : 'flex-start';
      node.style.setProperty('--pp-accent', resolveColor('accent', theme));
      fillText(node, el);
      break;
    }
    case 'shape':
      node.appendChild(shapeSvg(el, theme));
      break;
    case 'image': {
      const img = h('img', '', node);
      img.src = el.src;
      img.alt = el.alt;
      img.draggable = false;
      img.style.objectFit = el.fit;
      img.style.borderRadius = `${el.radius}px`;
      break;
    }
  }
  return node;
}

export function shapeSvg(el: ShapeElement, theme: Theme): SVGSVGElement {
  const stroke = resolveColor(el.stroke, theme);
  const hasStroke = el.stroke !== 'none' && el.strokeWidth > 0;
  const sw = el.shape === 'line' ? Math.max(1, el.strokeWidth) : hasStroke ? el.strokeWidth : 0;
  const svg = s('svg', { width: el.w, height: el.h, viewBox: `0 0 ${el.w} ${el.h}` });
  s('path', {
    d: shapePath(el.shape, el.w, el.h, el.shape === 'line' ? 0 : sw / 2),
    fill: el.shape === 'line' ? 'none' : resolveColor(el.fill, theme),
    stroke: el.shape === 'line' ? resolveColor(el.stroke === 'none' ? 'ink' : el.stroke, theme) : hasStroke ? stroke : 'none',
    'stroke-width': sw,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }, svg);
  return svg;
}

/** Render every element of a slide, back to front. */
export function renderSlide(elements: SlideElement[], theme: Theme, parent: HTMLElement): HTMLElement[] {
  injectStyle('pp-elements', ELEMENT_CSS);
  return elements.map((el) => renderElement(el, theme, parent));
}

/** Reading order (top to bottom, left to right), used to sequence entrances. */
export function readingOrder<T extends { el: SlideElement }>(items: T[]): T[] {
  return [...items].sort((a, b) => Math.round((a.el.y - b.el.y) / 40) || a.el.x - b.el.x);
}
