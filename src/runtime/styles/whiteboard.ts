// Whiteboard animation: a marker sketches each scene's story on an endless board,
// writes the slide, and the camera pans along the board to the next scene, so the
// whole talk ends up as one connected drawing.

import { MARKER } from '../../shared/palettes.ts';
import { SETTING_LAYERS, layoutMotifs, type Poly } from '../../shared/motifs.ts';
import type { RuntimeData, RuntimeScene } from '../../shared/types.ts';
import { EASE, linear, type Timeline } from '../anim.ts';
import { fitContent, renderContent } from '../content.ts';
import { h, injectStyle, s } from '../dom.ts';
import type { Renderer } from '../player.ts';

const CSS = `
.pp-whiteboard{background:radial-gradient(ellipse at 35% 25%,#FFFFFF 0%,#F6F6F1 70%,#EEEEE7 100%);font-family:'Caveat','Segoe Print','Bradley Hand',cursive}
.wb-world{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
.wb-cell{position:absolute;width:1600px;height:900px}
.wb-cell svg{position:absolute;left:0;top:0;overflow:visible}
.wb-links{position:absolute;left:0;top:0;overflow:visible}
.wb-text{position:absolute;left:880px;top:110px;width:650px;height:700px;color:#1F2A36;display:flex;flex-direction:column;justify-content:center}
.wb-text .c-title{font-weight:700;font-size:calc(var(--fs) * 84px);line-height:1.02}
.wb-text .c-statement{font-weight:700;font-size:calc(var(--fs) * 70px);line-height:1.08}
.wb-text .c-stat{white-space:nowrap;font-weight:700;font-size:calc(var(--fs) * 210px);line-height:1;color:var(--accent)}
.wb-text .c-sub{font-weight:600;font-size:calc(var(--fs) * 44px);line-height:1.15;color:var(--accent);margin-top:calc(var(--fs) * 26px)}
.wb-text .c-bullets{list-style:none;margin:calc(var(--fs) * 34px) 0 0;padding:0}
.wb-text .c-bullet{display:flex;gap:18px;align-items:flex-start;font-weight:600;font-size:calc(var(--fs) * 46px);line-height:1.12;margin:0 0 calc(var(--fs) * 16px)}
.wb-text .c-mark{flex:none;width:30px;height:30px;margin-top:calc(var(--fs) * 10px)}
.wb-text .l-title .c-title{font-size:calc(var(--fs) * 104px)}
.wb-reveal{clip-path:inset(0 100% 0 0)}
.wb-narr{position:absolute;left:70px;top:796px;width:760px;text-align:center;font-weight:600;font-size:40px;line-height:1.15;color:#5A6470}
.wb-pen{position:absolute;left:0;top:0;width:70px;height:210px;transform-origin:35px 205px;pointer-events:none;filter:drop-shadow(10px 14px 8px rgba(0,0,0,.18));will-change:transform}
`;

const PEN_SVG = `<svg viewBox="0 0 70 210" width="70" height="210"><path d="M29 186 L41 186 L37 205 L33 205 Z" fill="#2B2B2B"/><rect class="wb-pen-body" x="20" y="56" width="30" height="132" rx="6" fill="#2F6FDE"/><rect x="20" y="150" width="30" height="10" fill="rgba(255,255,255,.35)"/><rect x="18" y="4" width="34" height="62" rx="9" fill="#2B2B2B"/><rect x="22" y="12" width="5" height="44" rx="2.5" fill="rgba(255,255,255,.25)"/></svg>`;

const SPEED = 3.8; // pixels of stroke per millisecond
const CELL_W = 1600;
const CELL_H = 900;

interface Pt { x: number; y: number }

type Step =
  | { kind: 'stroke'; path: SVGPathElement; len: number; color: string; dur: number }
  | { kind: 'write'; el: HTMLElement; color: string; dur: number; box: { x: number; y: number; w: number; h: number }; lines: number; fontPx: number }
  | { kind: 'fill'; els: { el: SVGElement; to: number }[]; dur: number }
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
    const origin = cellOrigin(index);
    cell.style.setProperty('--accent', marker.accent);
    const rand = rng(index * 7919 + 17);
    const svg = s('svg', { width: CELL_W, height: CELL_H, viewBox: `0 0 ${CELL_W} ${CELL_H}` }, cell);
    const fills = s('g', {}, svg);
    const strokes = s('g', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
    const steps: Step[] = [];

    const addStroke = (d: string, color: string, width: number) => {
      const path = s('path', { d, stroke: color, 'stroke-width': width }, strokes);
      const len = Math.max(1, path.getTotalLength());
      path.style.strokeDasharray = `${len} ${len}`;
      path.style.strokeDashoffset = `${len}`;
      steps.push({ kind: 'stroke', path, len, color, dur: Math.max(45, Math.min(480, len / SPEED)) });
    };

    // The world: a light sketch of the setting along the bottom of the illustration.
    const region = { x: 70, y: 120, w: 760, h: 660 };
    const layers = SETTING_LAYERS[scene.plan.setting];
    for (const layer of layers) {
      for (const poly of layer.polys) {
        if (poly.s === false) continue;
        const band = isBand(poly);
        const pts = band ? poly.p.slice(2, -2) : poly.p;
        const scaled: Poly = { ...poly, p: pts.map((v, i) => (i % 2 ? (v / 100) * region.h : (v / 200) * region.w)), open: band || poly.open };
        const d = sketchPath(scaled, region.x, region.y, 100, rand, 2);
        addStroke(d, '#A3ACB6', 2.6);
      }
    }

    // The motifs: outline first, then a quick marker colouring.
    const placed = layoutMotifs(scene.plan.motifs, region.w, region.h, scene.plan.setting);
    for (const m of placed) {
      const x = region.x + m.x;
      const y = region.y + m.y;
      const fillEls: { el: SVGElement; to: number }[] = [];
      for (const poly of m.def.polys) {
        // Colour whole shapes (outlines and plain polygons), not the facets of fans.
        if (poly.s !== false && !poly.open && poly.t >= 2) {
          const color = poly.t === 2 ? marker.ink : marker.accent;
          const to = poly.t === 2 ? 0.16 : poly.t === 3 ? 0.32 : 0.5;
          const fp = s('path', { d: sketchPath({ ...poly, open: false }, x, y, m.size, rand, 1.2), fill: color, opacity: 0 }, fills);
          fillEls.push({ el: fp, to });
        }
        if (poly.s === false) continue;
        const color = poly.t >= 3 ? marker.accent : marker.ink;
        addStroke(sketchPath(poly, x, y, m.size, rand, m.size * 0.012), color, m.role === 'hero' ? 3.6 : 3);
      }
      if (fillEls.length) steps.push({ kind: 'fill', els: fillEls, dur: 260 });
    }

    // The story caption under the drawing.
    if (scene.plan.narration) {
      const narr = h('div', 'wb-narr wb-reveal', cell, scene.plan.narration);
      steps.push(this.writeStep(narr, '#5A6470'));
    }

    // The slide itself, written on the right.
    const textBox = h('div', 'wb-text', cell);
    const parts = renderContent(scene.slide, textBox);
    fitContent(parts.root, 650, 700);
    parts.title.classList.add('wb-reveal');
    steps.push(this.writeStep(parts.title, marker.ink));
    const tb = this.boxOf(parts.title);
    if (scene.slide.layout !== 'stat') {
      const uy = tb.y + tb.h + 6;
      const uw = Math.min(tb.w, 520);
      addStroke(`M${tb.x} ${uy} Q${tb.x + uw * 0.3} ${uy + 9} ${tb.x + uw * 0.55} ${uy + 2} T${tb.x + uw} ${uy + 4}`, marker.accent, 5);
    }
    if (parts.subtitle) {
      parts.subtitle.classList.add('wb-reveal');
      steps.push(this.writeStep(parts.subtitle, marker.accent));
    }
    for (const li of parts.bullets) {
      const mark = li.querySelector<HTMLElement>('.c-mark')!;
      const text = li.querySelector<HTMLElement>('.c-text')!;
      const mb = this.boxOf(mark);
      addStroke(`M${mb.x + 3} ${mb.y + 16} L${mb.x + 12} ${mb.y + 26} L${mb.x + 28} ${mb.y + 4}`, marker.accent, 4.5);
      text.classList.add('wb-reveal');
      steps.push(this.writeStep(text, marker.ink));
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
          penTo(pt);
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
        case 'fill':
          for (const f of st.els) f.el.setAttribute('opacity', String(f.to * p));
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

/** Setting bands (waves, hills) are drawn as open lines along their top edge. */
function isBand(poly: Poly): boolean {
  const p = poly.p;
  return p.length > 8 && p[0] === 0 && p[1] === 100 && p[p.length - 2] === 200 && p[p.length - 1] === 100;
}
