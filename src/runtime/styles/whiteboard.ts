// Whiteboard animation: a marker sketches each scene's story on an endless board,
// writes the slide, and the camera pans along the board to the next scene, so the
// whole talk ends up as one connected drawing.

import { MARKER } from '../../shared/palettes.ts';
import { SETTING_LAYERS, type Poly } from '../../shared/motifs.ts';
import { themeFor } from '../../shared/theme.ts';
import type { RuntimeData, RuntimeScene } from '../../shared/types.ts';
import { EASE, linear, type Timeline } from '../anim.ts';
import { h, injectStyle, s } from '../dom.ts';
import { readingOrder, renderSlide, shapePath } from '../elements.ts';
import type { Renderer } from '../player.ts';
import { storyLayout } from '../story.ts';

const CSS = `
.pp-whiteboard{background:radial-gradient(ellipse at 35% 25%,#FFFFFF 0%,#F6F6F1 70%,#EEEEE7 100%);font-family:'Caveat','Segoe Print','Bradley Hand',cursive}
.wb-world{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
.wb-cell{position:absolute;width:1600px;height:900px}
.wb-cell svg{position:absolute;left:0;top:0;overflow:visible}
.wb-links{position:absolute;left:0;top:0;overflow:visible}
.wb-slide{position:absolute;inset:0}
.wb-reveal{clip-path:inset(0 100% 0 0)}
.wb-narr{position:absolute;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:600;font-size:38px;line-height:1.12;color:#5A6470}
.wb-narr span{display:block}
.wb-pen{position:absolute;left:0;top:0;width:70px;height:210px;transform-origin:35px 205px;pointer-events:none;filter:drop-shadow(10px 14px 8px rgba(0,0,0,.18));will-change:transform}
`;

const PEN_SVG = `<svg viewBox="0 0 70 210" width="70" height="210"><path d="M29 186 L41 186 L37 205 L33 205 Z" fill="#2B2B2B"/><rect class="wb-pen-body" x="20" y="56" width="30" height="132" rx="6" fill="#2F6FDE"/><rect x="20" y="150" width="30" height="10" fill="rgba(255,255,255,.35)"/><rect x="18" y="4" width="34" height="62" rx="9" fill="#2B2B2B"/><rect x="22" y="12" width="5" height="44" rx="2.5" fill="rgba(255,255,255,.25)"/></svg>`;

const SPEED = 3.8; // pixels of stroke per millisecond
const CELL_W = 1600;
const CELL_H = 900;

interface Pt { x: number; y: number }

/** Rotation applied to a stroke, so the pen follows rotated shapes. */
interface Turn { a: number; cx: number; cy: number }

type Step =
  | { kind: 'stroke'; path: SVGPathElement; len: number; color: string; dur: number; turn?: Turn }
  | { kind: 'write'; el: HTMLElement; color: string; dur: number; box: { x: number; y: number; w: number; h: number }; lines: number; fontPx: number }
  | { kind: 'fade'; els: { el: HTMLElement | SVGElement; from: number; to: number }[]; dur: number }
  | { kind: 'move'; to: Pt; dur: number };

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A slightly wobbly marker path through a polygon, with a small overshoot. */
function sketchPath(poly: Poly, x: number, y: number, size: number, rand: () => number, jitter: number): string {
  const k = size / 100;
  const pts: Pt[] = [];
  for (let i = 0; i < poly.p.length; i += 2) {
    pts.push({ x: x + poly.p[i] * k + (rand() - 0.5) * jitter, y: y + poly.p[i + 1] * k + (rand() - 0.5) * jitter });
  }
  if (!poly.open && pts.length > 2) {
    const a = pts[0];
    const b = pts[1];
    pts.push({ x: a.x + (rand() - 0.5) * jitter, y: a.y + (rand() - 0.5) * jitter });
    pts.push({ x: a.x + (b.x - a.x) * 0.12, y: a.y + (b.y - a.y) * 0.12 });
  }
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');
}

function cellOrigin(i: number): Pt {
  return { x: i * 1780, y: [0, 300, 90, 380][i % 4] };
}

export class WhiteboardRenderer implements Renderer {
  private world!: HTMLElement;
  private links!: SVGSVGElement;
  private pen!: HTMLElement;
  private penBody!: SVGElement;
  private data!: RuntimeData;
  private cells = new Map<number, HTMLElement>();
  private drawn = new Set<number>();
  private linked = new Set<number>();
  private penAt: Pt = { x: 0, y: 0 };

  mount(stage: HTMLElement, data: RuntimeData): void {
    injectStyle('pp-whiteboard', CSS);
    this.data = data;
    this.world = h('div', 'wb-world', stage);
    this.links = s('svg', { class: 'wb-links', width: 1, height: 1 }, this.world);
    this.pen = h('div', 'wb-pen', this.world);
    this.pen.innerHTML = PEN_SVG;
    this.penBody = this.pen.querySelector('.wb-pen-body')!;
  }

  frameColor(): string {
    return '#F1F1EC';
  }

  show(index: number, from: number | null, tl: Timeline): void {
    const target = cellOrigin(index);
    const cam = (cx: number, cy: number, k: number) => `translate(${800 - cx * k}px, ${450 - cy * k}px) scale(${k})`;
    const cell = this.ensureCell(index);
    let delay = 0;

    if (from === null) {
      this.world.style.transform = cam(target.x + 800, target.y + 450, 1);
      this.placePen({ x: target.x + 1500, y: target.y + 960 });
    } else {
      const a = cellOrigin(from);
      const ca = { x: a.x + 800, y: a.y + 450 };
      const cb = { x: target.x + 800, y: target.y + 450 };
      const dist = Math.hypot(cb.x - ca.x, cb.y - ca.y);
      const mid = Math.max(0.28, Math.min(0.74, 1500 / (dist + 520)));
      const dur = Math.min(2200, 1100 + dist * 0.12);
      tl.animate(this.world, [
        { transform: cam(ca.x, ca.y, 1) },
        { transform: cam((ca.x + cb.x) / 2, (ca.y + cb.y) / 2, mid), offset: 0.5 },
        { transform: cam(cb.x, cb.y, 1) },
      ], { duration: dur, easing: EASE.inOut, fill: 'forwards' });
      tl.animate(this.pen, [{ opacity: 1 }, { opacity: 0, offset: 0.2 }, { opacity: 0, offset: 0.8 }, { opacity: 1 }], { duration: dur, fill: 'forwards' });
      if (index === from + 1 && !this.linked.has(index)) {
        this.linked.add(index);
        this.drawLink(a, target, tl, dur);
      }
      delay = dur - 150;
      this.placePen({ x: target.x + 1500, y: target.y + 960 });
    }

    if (!this.drawn.has(index)) {
      this.drawn.add(index);
      this.drawCell(index, cell, this.data.scenes[index], tl, delay);
    }
  }

  private placePen(p: Pt): void {
    this.penAt = p;
    this.pen.style.transform = `translate(${p.x - 35}px, ${p.y - 205}px) rotate(28deg)`;
  }

  private ensureCell(index: number): HTMLElement {
    let cell = this.cells.get(index);
    if (!cell) {
      const o = cellOrigin(index);
      cell = h('div', 'wb-cell', this.world);
      cell.style.left = `${o.x}px`;
      cell.style.top = `${o.y}px`;
      this.world.insertBefore(cell, this.pen);
      this.cells.set(index, cell);
    }
    return cell;
  }

  /** A hand-drawn arrow across the gap between two scenes. */
  private drawLink(a: Pt, b: Pt, tl: Timeline, panDur: number): void {
    const x1 = a.x + CELL_W - 40;
    const y1 = a.y + 470;
    const x2 = b.x + 50;
    const y2 = b.y + 450;
    const mx = (x1 + x2) / 2;
    const d = `M${x1} ${y1} C${mx} ${y1 - 120} ${mx} ${y2 + 120} ${x2} ${y2}`;
    const attrs = { fill: 'none', stroke: '#A3ACB6', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    const path = s('path', { d, ...attrs }, this.links);
    const angle = Math.atan2(y2 - (y2 + 120), x2 - mx);
    const head = s('path', {
      d: `M${x2 - 24 * Math.cos(angle - 0.5)} ${y2 - 24 * Math.sin(angle - 0.5)} L${x2} ${y2} L${x2 - 24 * Math.cos(angle + 0.5)} ${y2 - 24 * Math.sin(angle + 0.5)}`,
      ...attrs,
    }, this.links);
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len} ${len}`;
    tl.animate(path, [{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: panDur * 0.7, delay: panDur * 0.15, easing: EASE.inOut });
    tl.animate(head, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: panDur * 0.82 });
  }

  private drawCell(index: number, cell: HTMLElement, scene: RuntimeScene, tl: Timeline, delay: number): void {
    const marker = MARKER[scene.plan.mood];
    const theme = themeFor('whiteboard', scene.plan.mood);
    const origin = cellOrigin(index);
    const rand = rng(index * 7919 + 17);
    const story = storyLayout(scene.elements, scene.plan, { caption: true });
    const svg = s('svg', { width: CELL_W, height: CELL_H, viewBox: `0 0 ${CELL_W} ${CELL_H}` }, cell);
    if (story.ghost) svg.style.opacity = '0.3';
    const fills = s('g', {}, svg);
    const strokes = s('g', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
    const slideLayer = h('div', 'wb-slide', cell);
    const overlay = s('svg', { width: CELL_W, height: CELL_H, viewBox: `0 0 ${CELL_W} ${CELL_H}` }, cell);
    const overStrokes = s('g', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, overlay);
    const steps: Step[] = [];

    const addStroke = (d: string, color: string, width: number, layer: SVGGElement = strokes, turn?: Turn) => {
      const path = s('path', { d, stroke: color, 'stroke-width': width }, layer);
      if (turn) path.setAttribute('transform', `rotate(${turn.a} ${turn.cx} ${turn.cy})`);
      const len = Math.max(1, path.getTotalLength());
      path.style.strokeDasharray = `${len} ${len}`;
      path.style.strokeDashoffset = `${len}`;
      steps.push({ kind: 'stroke', path, len, color, dur: Math.max(45, Math.min(480, len / SPEED)), turn });
      return path;
    };

    // The story, sketched in the empty part of the slide.
    const region = story.region;
    if (!story.ghost) {
      for (const layer of SETTING_LAYERS[scene.plan.setting]) {
        for (const poly of layer.polys) {
          if (poly.s === false) continue;
          const band = isBand(poly);
          const pts = band ? poly.p.slice(2, -2) : poly.p;
          const scaled: Poly = { ...poly, p: pts.map((v, i) => (i % 2 ? (v / 100) * region.h : (v / 200) * region.w)), open: band || poly.open };
          addStroke(sketchPath(scaled, region.x, region.y, 100, rand, 2), '#A3ACB6', 2.6);
        }
      }
    }
    for (const m of story.placed) {
      const fillEls: { el: SVGElement; from: number; to: number }[] = [];
      for (const poly of m.def.polys) {
        // Colour whole shapes (outlines and plain polygons), not the facets of fans.
        if (poly.s !== false && !poly.open && poly.t >= 2) {
          const color = poly.t === 2 ? marker.ink : marker.accent;
          const to = poly.t === 2 ? 0.16 : poly.t === 3 ? 0.32 : 0.5;
          const fp = s('path', { d: sketchPath({ ...poly, open: false }, m.x, m.y, m.size, rand, 1.2), fill: color }, fills);
          fp.style.opacity = '0';
          fillEls.push({ el: fp, from: 0, to });
        }
        if (poly.s === false) continue;
        const color = poly.t >= 3 ? marker.accent : marker.ink;
        addStroke(sketchPath(poly, m.x, m.y, m.size, rand, m.size * 0.012), color, m.role === 'hero' ? 3.6 : 3);
      }
      if (fillEls.length) steps.push({ kind: 'fade', els: fillEls, dur: 260 });
    }

    // The story caption under the drawing, when there is room.
    if (story.caption && scene.plan.narration) {
      const c = story.caption;
      const narr = h('div', 'wb-narr', cell);
      Object.assign(narr.style, { left: `${c.x}px`, top: `${c.y}px`, width: `${c.w}px`, height: `${c.h}px` });
      const line = h('span', 'wb-reveal', narr, scene.plan.narration);
      steps.push(this.writeStep(line, '#5A6470'));
    }

    // The slide itself, written and drawn where the author placed each element.
    const nodes = renderSlide(scene.elements, theme, slideLayer);
    const items = readingOrder(scene.elements.map((el, i) => ({ el, node: nodes[i] })));
    for (const { el, node } of items) {
      const turn = el.rotation ? { a: el.rotation, cx: el.x + el.w / 2, cy: el.y + el.h / 2 } : undefined;
      if (el.type === 'text') {
        const inner = node.querySelector<HTMLElement>('.pp-words');
        if (!inner || el.rotation) {
          node.style.opacity = '0';
          steps.push({ kind: 'fade', els: [{ el: node, from: 0, to: 1 }], dur: 400 });
          continue;
        }
        inner.classList.add('wb-reveal');
        steps.push(this.writeStep(inner, node.style.color || theme.ink));
        if (el.role === 'title') {
          const tb = this.boxOf(inner);
          const lastLineW = Math.min(tb.w, 560);
          const ux = el.align === 'center' ? tb.x + (tb.w - lastLineW) / 2 : el.align === 'right' ? tb.x + tb.w - lastLineW : tb.x;
          const uy = tb.y + tb.h + 8;
          addStroke(`M${ux} ${uy} Q${ux + lastLineW * 0.3} ${uy + 9} ${ux + lastLineW * 0.55} ${uy + 2} T${ux + lastLineW} ${uy + 4}`, marker.accent, 5, overStrokes);
        }
        continue;
      }
      // Shapes and pictures: sketch the outline, then the real thing fades in under it.
      node.style.opacity = '0';
      const outline = el.type === 'shape' ? shapePath(el.shape, el.w, el.h, 0) : shapePath('rect', el.w, el.h, 0);
      const d = translatePath(outline, el.x, el.y);
      const stroke = addStroke(d, el.type === 'shape' && el.shape === 'line' ? theme.ink : marker.ink, 3.4, overStrokes, turn);
      steps.push({ kind: 'fade', els: [{ el: node, from: 0, to: 1 }, { el: stroke, from: 1, to: 0 }], dur: 420 });
    }
    steps.push({ kind: 'move', to: { x: CELL_W - 100, y: CELL_H + 60 }, dur: 500 });

    this.run(steps, origin, tl, delay);
  }

  private boxOf(el: HTMLElement): { x: number; y: number; w: number; h: number } {
    // Offsets relative to the cell (the text box is absolutely positioned inside it).
    let x = 0;
    let y = 0;
    let node: HTMLElement | null = el;
    while (node && !node.classList.contains('wb-cell')) {
      x += node.offsetLeft;
      y += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }

  private writeStep(el: HTMLElement, color: string): Step {
    const box = this.boxOf(el);
    const fontPx = parseFloat(getComputedStyle(el).fontSize) || 40;
    const lineH = parseFloat(getComputedStyle(el).lineHeight) || fontPx * 1.1;
    const lines = Math.max(1, Math.round(box.h / lineH));
    const dur = Math.max(240, Math.min(1100, (box.w * lines) / 2.3));
    return { kind: 'write', el, color, dur, box, lines, fontPx };
  }

  /** Play the steps with one JS tween so the pen can follow the exact stroke tip. */
  private run(steps: Step[], origin: Pt, tl: Timeline, delay: number): void {
    const starts: number[] = [];
    let total = 0;
    for (const st of steps) {
      starts.push(total);
      total += st.dur + (st.kind === 'stroke' ? 22 : st.kind === 'write' ? 90 : 0);
    }
    let cursor = 0;
    let lastColor = '';
    let moveFrom: Pt | null = null;
    const penTo = (p: Pt) => this.placePen({ x: origin.x + p.x, y: origin.y + p.y });
    const setColor = (c: string) => {
      if (c !== lastColor) this.penBody.setAttribute('fill', (lastColor = c));
    };

    const apply = (st: Step, p: number) => {
      switch (st.kind) {
        case 'stroke': {
          st.path.style.strokeDashoffset = `${st.len * (1 - p)}`;
          setColor(st.color);
          const pt = st.path.getPointAtLength(st.len * p);
          penTo(st.turn ? rotatePoint(pt, st.turn) : pt);
          break;
        }
        case 'write': {
          const line = Math.min(st.lines - 1, Math.floor(p * st.lines));
          const lp = p * st.lines - line;
          const top = (line / st.lines) * 100;
          const bot = ((line + 1) / st.lines) * 100;
          const x = p >= 1 ? 100 : lp * 100;
          st.el.style.clipPath = p >= 1 ? 'none' : `polygon(0 0,100% 0,100% ${top}%,${x}% ${top}%,${x}% ${bot}%,0 ${bot}%)`;
          setColor(st.color);
          const lineH = st.box.h / st.lines;
          penTo({
            x: st.box.x + st.box.w * Math.min(1, lp),
            y: st.box.y + lineH * (line + 0.78) + Math.sin(lp * st.box.w * 0.11) * st.fontPx * 0.12,
          });
          break;
        }
        case 'fade':
          for (const f of st.els) f.el.style.opacity = String(f.from + (f.to - f.from) * p);
          break;
        case 'move': {
          moveFrom ??= { x: this.penAt.x - origin.x, y: this.penAt.y - origin.y };
          const e = 1 - Math.pow(1 - p, 3);
          penTo({ x: moveFrom.x + (st.to.x - moveFrom.x) * e, y: moveFrom.y + (st.to.y - moveFrom.y) * e });
          break;
        }
      }
    };

    tl.tween(total, delay, (t) => {
      const now = t * total;
      while (cursor < steps.length && (t >= 1 || now >= starts[cursor] + steps[cursor].dur)) {
        apply(steps[cursor], 1);
        cursor++;
      }
      if (cursor < steps.length && now >= starts[cursor]) apply(steps[cursor], (now - starts[cursor]) / steps[cursor].dur);
    }, linear);
  }
}

function rotatePoint(p: Pt, t: Turn): Pt {
  const a = (t.a * Math.PI) / 180;
  const dx = p.x - t.cx;
  const dy = p.y - t.cy;
  return { x: t.cx + dx * Math.cos(a) - dy * Math.sin(a), y: t.cy + dx * Math.sin(a) + dy * Math.cos(a) };
}

/** Move an absolute path (M/L/H/V/A/Z commands from shapePath) by (dx, dy). */
function translatePath(d: string, dx: number, dy: number): string {
  return d.replace(/([MLHVA])([^MLHVAZ]*)/g, (_, cmd: string, args: string) => {
    const n = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === 'H') return `H${n[0] + dx}`;
    if (cmd === 'V') return `V${n[0] + dy}`;
    if (cmd === 'A') return `A${n[0]} ${n[1]} ${n[2]} ${n[3]} ${n[4]} ${n[5] + dx} ${n[6] + dy}`;
    const out: number[] = [];
    for (let i = 0; i < n.length; i += 2) out.push(n[i] + dx, n[i + 1] + dy);
    return cmd + out.join(' ');
  });
}

/** Setting bands (waves, hills) are drawn as open lines along their top edge. */
function isBand(poly: Poly): boolean {
  const p = poly.p;
  return p.length > 8 && p[0] === 0 && p[1] === 100 && p[p.length - 2] === 200 && p[p.length - 1] === 100;
}
