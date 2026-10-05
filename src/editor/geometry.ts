// Canvas maths for the slide editor: snapping, resizing rotated boxes, alignment.

import { bounds, type Rect } from '../shared/elements.ts';
import { CANVAS_H, CANVAS_W, type SlideElement } from '../shared/types.ts';

export interface Guides {
  x: number[];
  y: number[];
}

export function union(rects: Rect[]): Rect {
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Snap a moving box to the slide's edges and centre lines and to the edges and
 * centres of the other elements. Returns the corrected offset and the guides to draw.
 */
export function snapMove(box: Rect, others: SlideElement[], threshold: number): { dx: number; dy: number; guides: Guides } {
  const xs = [0, CANVAS_W / 2, CANVAS_W];
  const ys = [0, CANVAS_H / 2, CANVAS_H];
  for (const o of others) {
    const b = bounds(o);
    xs.push(b.x, b.x + b.w / 2, b.x + b.w);
    ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  const best = (edges: number[], lines: number[]) => {
    let delta = 0;
    let line: number | null = null;
    let dist = threshold + 1;
    for (const e of edges) {
      for (const l of lines) {
        const d = Math.abs(l - e);
        if (d < dist) [dist, delta, line] = [d, l - e, l];
      }
    }
    return { delta: line === null ? 0 : delta, line };
  };
  const bx = best([box.x, box.x + box.w / 2, box.x + box.w], xs);
  const by = best([box.y, box.y + box.h / 2, box.y + box.h], ys);
  return {
    dx: bx.delta,
    dy: by.delta,
    guides: { x: bx.line === null ? [] : [bx.line], y: by.line === null ? [] : [by.line] },
  };
}

/** Rotate a vector by `deg` degrees. */
export function rotate(x: number, y: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
}

/**
 * Resize from a handle at (sx, sy) in {-1, 0, 1}^2, given the pointer offset since the
 * gesture began. The opposite edge stays put, also for rotated elements.
 */
export function resizeBox<T extends SlideElement>(orig: T, sx: number, sy: number, dx: number, dy: number, keepAspect: boolean): T {
  const [lx, ly] = rotate(dx, dy, -orig.rotation);
  let w = Math.max(16, orig.w + sx * lx);
  let h = Math.max(16, orig.h + sy * ly);
  if (keepAspect && sx && sy) {
    const k = Math.max(w / orig.w, h / orig.h);
    w = Math.max(16, orig.w * k);
    h = Math.max(16, orig.h * k);
  }
  const [cx, cy] = rotate((sx * (w - orig.w)) / 2, (sy * (h - orig.h)) / 2, orig.rotation);
  const centerX = orig.x + orig.w / 2 + cx;
  const centerY = orig.y + orig.h / 2 + cy;
  return { ...orig, w: Math.round(w), h: Math.round(h), x: Math.round(centerX - w / 2), y: Math.round(centerY - h / 2) };
}

export type AlignKind = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/** Align elements to each other (several selected) or to the slide (one selected). */
export function align(elements: SlideElement[], ids: string[], kind: AlignKind): SlideElement[] {
  const sel = elements.filter((e) => ids.includes(e.id));
  if (!sel.length) return elements;
  const target = sel.length > 1 ? union(sel.map(bounds)) : { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };
  return elements.map((e) => {
    if (!ids.includes(e.id)) return e;
    const b = bounds(e);
    const offX = e.x - b.x;
    const offY = e.y - b.y;
    switch (kind) {
      case 'left': return { ...e, x: Math.round(target.x + offX) };
      case 'hcenter': return { ...e, x: Math.round(target.x + (target.w - b.w) / 2 + offX) };
      case 'right': return { ...e, x: Math.round(target.x + target.w - b.w + offX) };
      case 'top': return { ...e, y: Math.round(target.y + offY) };
      case 'vcenter': return { ...e, y: Math.round(target.y + (target.h - b.h) / 2 + offY) };
      case 'bottom': return { ...e, y: Math.round(target.y + target.h - b.h + offY) };
    }
  });
}

export type ZMove = 'front' | 'forward' | 'backward' | 'back';

export function reorder(elements: SlideElement[], ids: string[], move: ZMove): SlideElement[] {
  const picked = elements.filter((e) => ids.includes(e.id));
  const rest = elements.filter((e) => !ids.includes(e.id));
  if (move === 'front') return [...rest, ...picked];
  if (move === 'back') return [...picked, ...rest];
  const out = [...elements];
  const order = move === 'forward' ? [...out.keys()].reverse() : [...out.keys()];
  for (const i of order) {
    if (!ids.includes(out[i].id)) continue;
    const j = move === 'forward' ? i + 1 : i - 1;
    if (j < 0 || j >= out.length || ids.includes(out[j].id)) continue;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
