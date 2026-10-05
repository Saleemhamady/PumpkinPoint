// 3D folding book: a pop-up storybook. Each slide is printed across a spread and its
// story pops up out of the empty part of the pages. Clicking turns the page.

import { BOOK_AMBIENT, PAPER, type PaperPalette } from '../../shared/palettes.ts';
import { SETTING_LAYERS, polyPath, type Poly } from '../../shared/motifs.ts';
import { themeFor } from '../../shared/theme.ts';
import { CANVAS_H, CANVAS_W, type RuntimeData, type RuntimeScene } from '../../shared/types.ts';
import { EASE, type Timeline } from '../anim.ts';
import { h, injectStyle, motifSvg, s } from '../dom.ts';
import { renderSlide } from '../elements.ts';
import type { Renderer } from '../player.ts';
import { storyLayout } from '../story.ts';

const PAGE_W = 650;
const PAGE_H = 820;
const TILT = 34;
const RISE = -(TILT + 24);
/** The slide canvas printed across the spread. */
const K = (PAGE_W * 2) / CANVAS_W;
const SLIDE_TOP = (PAGE_H - CANVAS_H * K) / 2;

const CSS = `
.pp-book{font-family:'Lora',Georgia,'Times New Roman',serif}
.bk-amb{position:absolute;inset:0}
.bk-view{position:absolute;inset:0;perspective:2600px;perspective-origin:50% 8%}
.bk-book{position:absolute;left:${800 - PAGE_W}px;top:52px;width:${PAGE_W * 2}px;height:${PAGE_H}px;transform-style:preserve-3d;transform:rotateX(${TILT}deg)}
.bk-shadow{position:absolute;left:-60px;right:-60px;top:40px;bottom:-80px;background:radial-gradient(closest-side,rgba(0,0,0,.55),rgba(0,0,0,0));transform:translateZ(-30px)}
.bk-board{position:absolute;top:-12px;width:${PAGE_W + 14}px;height:${PAGE_H + 24}px;background:#5B2A26;border-radius:6px;box-shadow:inset 0 0 0 3px rgba(0,0,0,.25)}
.bk-board.right{left:${PAGE_W}px;transform:translateZ(-6px);border-radius:0 8px 8px 0}
.bk-block{position:absolute;left:${PAGE_W}px;top:-2px;width:${PAGE_W + 4}px;height:${PAGE_H + 4}px;background:#EFE6D2;transform:translateZ(-3px);box-shadow:3px 3px 0 #E4D8BF,6px 6px 0 #D8CBB0}
.bk-leaf{position:absolute;left:${PAGE_W}px;top:0;width:${PAGE_W}px;height:${PAGE_H}px;transform-origin:0 50%;transform-style:preserve-3d}
.bk-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;background:#FBF6EA;color:#2B2118}
.bk-face.back{transform:rotateY(180deg)}
.bk-face.front{border-radius:0 6px 6px 0}
.bk-face.back{border-radius:6px 0 0 6px}
.bk-gutter{position:absolute;inset:0;pointer-events:none}
.bk-face.front .bk-gutter{background:linear-gradient(to right,rgba(60,40,20,.22),rgba(60,40,20,0) 9%),linear-gradient(to left,rgba(60,40,20,.06),rgba(60,40,20,0) 3%)}
.bk-face.back .bk-gutter{background:linear-gradient(to left,rgba(60,40,20,.22),rgba(60,40,20,0) 9%),linear-gradient(to right,rgba(60,40,20,.06),rgba(60,40,20,0) 3%)}
.bk-shade{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none}
.bk-cover{background:#6E2F2B;color:#E9C46A;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:90px;box-sizing:border-box}
.bk-cover::before{content:'';position:absolute;inset:26px;border:3px solid rgba(233,196,106,.6);border-radius:4px}
.bk-cover::after{content:'';position:absolute;inset:38px;border:1px solid rgba(233,196,106,.4);border-radius:2px}
.bk-cover-title{font-weight:700;font-size:58px;line-height:1.1}
.bk-cover-orn{width:120px;height:2px;background:#E9C46A;margin:30px auto;box-shadow:0 8px 0 -0.5px rgba(233,196,106,.5)}
.bk-clip{position:absolute;inset:0;overflow:hidden;border-radius:inherit}
.bk-slide{position:absolute;top:${SLIDE_TOP}px;width:${CANVAS_W}px;height:${CANVAS_H}px;transform:scale(${K});transform-origin:0 0}
.bk-story{position:absolute;border-radius:14px;overflow:hidden;box-shadow:inset 0 0 0 3px rgba(255,255,255,.55),inset 0 0 50px rgba(0,0,0,.08)}
.bk-story svg{position:absolute;inset:0}
.bk-caption{position:absolute;display:flex;align-items:center;justify-content:center;text-align:center;font-family:'Lora',Georgia,serif;font-style:italic;font-size:34px;line-height:1.3;color:#4A3B2C}
.bk-piece{position:absolute;transform-origin:50% 100%;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.bk-piece svg{position:absolute;inset:0;overflow:visible;filter:drop-shadow(0 3px 2px rgba(0,0,0,.18))}
.bk-cast{position:absolute;opacity:0;background:linear-gradient(to top,rgba(50,30,10,.2),rgba(50,30,10,0));border-radius:50% 50% 0 0;filter:blur(5px);pointer-events:none}
.bk-piece path{stroke:#FFFDF7;stroke-width:3;paint-order:stroke}
`;

interface Piece {
  el: HTMLElement;
  /** Soft shadow printed on the page behind the standing piece. */
  shadow: HTMLElement;
}

interface StoryPage {
  /** The two pages of the spread (left: back of leaf i, right: front of leaf i+1). */
  faces: HTMLElement[];
  pieces: Piece[];
  /** Pages are flat (cheap, and safe for 3D sorting) unless their pop-ups are up. */
  up: boolean;
}

export class BookRenderer implements Renderer {
  private data!: RuntimeData;
  private ambHost!: HTMLElement;
  private leaves: HTMLElement[] = [];
  /** The spread of each scene. */
  private pages: StoryPage[] = [];
  private flipped: boolean[] = [];

  mount(stage: HTMLElement, data: RuntimeData): void {
    injectStyle('pp-book', CSS);
    this.data = data;
    this.ambHost = h('div', '', stage);
    const view = h('div', 'bk-view', stage);
    const book = h('div', 'bk-book', view);
    h('div', 'bk-shadow', book);
    h('div', 'bk-board right', book);
    h('div', 'bk-block', book);

    const n = data.scenes.length;
    // Leaf 0 is the cover. Scene i is printed on the back of leaf i (left page) and
    // the front of leaf i+1 (right page).
    const fronts: HTMLElement[] = [];
    const backs: HTMLElement[] = [];
    for (let k = 0; k <= n; k++) {
      const leaf = h('div', 'bk-leaf', book);
      fronts.push(h('div', 'bk-face front', leaf));
      backs.push(h('div', 'bk-face back', leaf));
      this.leaves.push(leaf);
      this.flipped.push(false);
      this.setLeaf(k, false);
    }
    this.buildCover(fronts[0]);
    data.scenes.forEach((scene, i) => {
      const faces = [backs[i], fronts[i + 1]];
      this.pages[i] = { faces, pieces: this.buildSpread(faces, scene), up: false };
    });
    for (const face of [...fronts.slice(1), ...backs]) {
      h('div', 'bk-gutter', face);
      h('div', 'bk-shade', face);
    }
    h('div', 'bk-shade', fronts[0]);
  }

  frameColor(index: number): string {
    return BOOK_AMBIENT[this.data.scenes[index].plan.mood];
  }

  show(index: number, from: number | null, tl: Timeline): void {
    const mood = this.data.scenes[index].plan.mood;
    if (from === null || this.data.scenes[from].plan.mood !== mood) this.paintAmbient(mood, tl, from === null ? 0 : 300);

    if (from === null) {
      // Open straight to the requested spread; the cover opens with a flourish.
      for (let k = 1; k <= index; k++) this.setLeaf(k, true);
      this.flip(0, true, tl, 500, 1500);
      this.popUp(index, tl, 1700);
      return;
    }

    // Fold the current pop-ups flat before a page covers them.
    this.foldDown(from, tl, 0);
    const forward = index > from;
    const steps = Math.abs(index - from);
    const dur = steps > 1 ? 900 : 1150;
    for (let i = 0; i < steps; i++) {
      const k = forward ? from + 1 + i : from - i;
      this.flip(k, forward, tl, 250 + i * 160, dur);
    }
    for (let k = Math.min(index, from) + 1; k < Math.max(index, from); k++) this.foldDown(k, tl, 0);
    this.popUp(index, tl, 250 + (steps - 1) * 160 + dur * 0.82);
  }

  // ---- building pages ---------------------------------------------------------------------

  private buildCover(face: HTMLElement): void {
    face.classList.add('bk-cover');
    h('div', 'bk-cover-orn', face);
    h('div', 'bk-cover-title', face, this.data.title || 'A Story');
    h('div', 'bk-cover-orn', face);
  }

  /** Print the slide across both pages and build the pop-ups for its empty part. */
  private buildSpread(faces: HTMLElement[], scene: RuntimeScene): Piece[] {
    const pal = PAPER[scene.plan.mood];
    const theme = themeFor('book', scene.plan.mood);
    const story = storyLayout(scene.elements, scene.plan, { caption: true, captionAt: 'top' });
    const slides = faces.map((face, side) => {
      face.style.setProperty('--accent', accentFor(pal));
      const clip = h('div', 'bk-clip', face);
      const slide = h('div', 'bk-slide', clip);
      slide.style.left = `${-side * PAGE_W}px`;
      return slide;
    });

    // Printed: the story window, floating scenery, the caption, then the slide itself.
    const r = story.region;
    const layers = SETTING_LAYERS[scene.plan.setting];
    const strips = story.ghost ? [] : layers.filter((l) => l.polys.every((p) => p.f === false || touchesBottom(p)));
    const printed = story.ghost ? [] : layers.filter((l) => !strips.includes(l));
    for (const slide of slides) {
      if (!story.ghost) {
        const win = h('div', 'bk-story', slide);
        Object.assign(win.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, background: `linear-gradient(to bottom, ${pal.bg2} 0%, ${pal.bg} 75%)` });
        if (printed.length) {
          const svg = s('svg', { width: r.w, height: r.h, viewBox: `0 0 ${r.w} ${r.h}` }, win);
          for (const l of printed) for (const p of l.polys) if (p.f !== false) s('path', { d: polyPath(scale(p, r.w / 200, r.h / 100), 0, 0, 100), fill: pal.tones[p.t] }, svg);
        }
      } else {
        // No room on this slide: the story is printed faintly behind it instead.
        for (const m of story.placed) {
          const svg = motifSvg(m.def, pal.tones, m.size);
          Object.assign(svg.style, { position: 'absolute', left: `${m.x}px`, top: `${m.y}px`, opacity: '0.22' });
          slide.appendChild(svg);
        }
      }
      if (story.caption && scene.plan.narration) {
        const c = story.caption;
        const cap = h('div', 'bk-caption', slide, scene.plan.narration);
        Object.assign(cap.style, { left: `${c.x}px`, top: `${c.y}px`, width: `${c.w}px`, height: `${c.h}px` });
      }
      renderSlide(scene.elements, theme, slide);
    }
    if (story.ghost) return [];

    // Pop-ups, placed in canvas units and converted to the page they stand on.
    const pieces: Piece[] = [];
    const addPiece = (x: number, base: number, w: number, ht: number, content: (vx: number, vw: number) => Element, castShadow: boolean, clip = false) => {
      // A piece crossing the spine is split in two, one half on each page.
      const spine = CANVAS_W / 2;
      const parts = x < spine && x + w > spine ? [[x, spine], [spine, x + w]] : [[x, x + w]];
      for (const [a, b] of parts) {
        const side = (a + b) / 2 < spine ? 0 : 1;
        const face = faces[side];
        const left = a * K - side * PAGE_W;
        const top = SLIDE_TOP + (base - ht) * K;
        const shadow = h('div', 'bk-cast', face);
        if (castShadow) Object.assign(shadow.style, { left: `${left}px`, top: `${SLIDE_TOP + (base - ht * 0.3) * K}px`, width: `${(b - a) * K}px`, height: `${ht * 0.3 * K}px` });
        const el = h('div', 'bk-piece', face);
        Object.assign(el.style, { left: `${left}px`, top: `${top}px`, width: `${(b - a) * K}px`, height: `${ht * K}px`, transform: 'translateZ(1px) rotateX(0deg)' });
        const c = content(a - x, b - a);
        // Clip to the half that belongs on this page.
        if (parts.length > 1 || clip) (c as SVGSVGElement).style.overflow = 'hidden';
        c.setAttribute('width', String((b - a) * K));
        c.setAttribute('height', String(ht * K));
        el.appendChild(c);
        pieces.push({ el, shadow });
      }
    };

    // Ground strips (waves, hills, skylines) stand along the bottom of the story window.
    const bottom = r.y + r.h;
    strips.forEach((layer, i) => {
      const polys = layer.polys.filter((p) => p.f !== false).map((p) => squash(scale(p, r.w / 200, r.h / 100), r.h, 0.55));
      const bb = bbox(polys);
      const ht = bb.y1 - bb.y0;
      addPiece(r.x, bottom - (strips.length - 1 - i) * 34, r.w, ht, (vx, vw) => {
        const svg = s('svg', { viewBox: `${vx} ${bb.y0} ${vw} ${ht}`, preserveAspectRatio: 'none' }, null);
        for (const p of polys) s('path', { d: polyPath(p, 0, 0, 100), fill: pal.tones[p.t] }, svg);
        return svg;
      }, true, true);
    });

    // The motifs as cut-out figures; ground figures stand just behind the front strip.
    for (const m of story.placed) {
      const ground = m.def.place === 'ground';
      const base = ground ? bottom - (strips.length ? 20 : 8) : m.y + m.size;
      addPiece(m.x, base, m.size, m.size, (vx, vw) => {
        const svg = motifSvg(m.def, pal.tones, m.size);
        svg.setAttribute('viewBox', `${vx} 0 ${vw} ${m.size}`);
        svg.setAttribute('preserveAspectRatio', 'none');
        return svg;
      }, ground);
    }
    return pieces;
  }

  // ---- motion -------------------------------------------------------------------------------

  private zFor(k: number, flipped: boolean): number {
    // Unflipped leaves stack on the right with the lowest index on top; flipped
    // leaves stack on the left with the highest index on top.
    const n = this.data.scenes.length + 1;
    return flipped ? -(k + 1) * 1.6 : (n + 1 - k) * 1.6;
  }

  private setLeaf(k: number, flipped: boolean): void {
    this.flipped[k] = flipped;
    this.leaves[k].style.transform = `rotateY(${flipped ? -180 : 0}deg) translateZ(${this.zFor(k, flipped)}px)`;
  }

  private flip(k: number, forward: boolean, tl: Timeline, delay: number, dur: number): void {
    const leaf = this.leaves[k];
    if (!leaf || this.flipped[k] === forward) return;
    const a = `rotateY(${forward ? 0 : -180}deg) translateZ(${this.zFor(k, !forward)}px)`;
    const b = `rotateY(${forward ? -180 : 0}deg) translateZ(${this.zFor(k, forward)}px)`;
    const mid = `rotateY(-90deg) translateZ(${Math.max(this.zFor(k, true), this.zFor(k, false)) + 4}px)`;
    this.flipped[k] = forward;
    leaf.style.transform = b;
    tl.animate(leaf, [{ transform: a }, { transform: mid, offset: 0.5 }, { transform: b }], { duration: dur, delay, easing: EASE.inOut });
    const shades = leaf.querySelectorAll<HTMLElement>(':scope > .bk-face > .bk-shade');
    shades.forEach((sh) => tl.animate(sh, [{ opacity: 0 }, { opacity: 0.32, offset: 0.5 }, { opacity: 0 }], { duration: dur, delay, easing: 'ease-in-out' }));
  }

  private popUp(index: number, tl: Timeline, delay: number): void {
    const page = this.pages[index];
    if (!page) return;
    page.up = true;
    for (const face of page.faces) face.style.transformStyle = 'preserve-3d';
    page.pieces.forEach((p, i) => {
      tl.animate(p.el, [
        { transform: 'translateZ(1px) rotateX(0deg)' },
        { transform: `translateZ(1px) rotateX(${RISE - 10}deg)`, offset: 0.7 },
        { transform: `translateZ(1px) rotateX(${RISE}deg)` },
      ], { duration: 720, delay: delay + i * 110, easing: EASE.out, fill: 'forwards' });
      tl.animate(p.shadow, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: delay + i * 110 + 150, fill: 'forwards' });
    });
  }

  private foldDown(index: number, tl: Timeline, delay: number): void {
    const page = this.pages[index];
    if (!page || !page.up) return;
    page.up = false;
    let last: Animation | null = null;
    page.pieces.forEach((p) => {
      const current = getComputedStyle(p.el).transform;
      last = tl.animate(p.el, [{ transform: current === 'none' ? 'translateZ(1px) rotateX(0deg)' : current }, { transform: 'translateZ(1px) rotateX(0deg)' }], {
        duration: 380, delay, easing: EASE.in, fill: 'forwards',
      });
      tl.animate(p.shadow, [{ opacity: 1 }, { opacity: 0 }], { duration: 250, delay, fill: 'forwards' });
    });
    const flatten = () => {
      if (!page.up) for (const face of page.faces) face.style.transformStyle = '';
    };
    if (last) (last as Animation).finished.then(flatten, flatten);
    else flatten();
  }

  private paintAmbient(mood: keyof typeof BOOK_AMBIENT, tl: Timeline, delay: number): void {
    const amb = BOOK_AMBIENT[mood];
    const layer = h('div', 'bk-amb', this.ambHost);
    layer.style.background = `radial-gradient(ellipse at 50% 38%, ${mix(amb, '#FFE6BF', 0.32)} 0%, ${amb} 58%, ${mix(amb, '#000000', 0.55)} 100%)`;
    const older = Array.from(this.ambHost.children).slice(0, -1);
    tl.animate(layer, [{ opacity: 0 }, { opacity: 1 }], { duration: delay ? 1000 : 1, delay })
      .finished.then(() => older.forEach((o) => o.remove()), () => {});
  }
}

function accentFor(pal: PaperPalette): string {
  // The dark accent reads well on cream paper for every mood except the yellow ones.
  return luminance(pal.tones[4]) > 0.45 ? pal.tones[2] : pal.tones[4];
}

function scale(poly: Poly, kx: number, ky: number): Poly {
  return { ...poly, p: poly.p.map((v, i) => (i % 2 ? v * ky : v * kx)) };
}

function touchesBottom(p: Poly): boolean {
  for (let i = 1; i < p.p.length; i += 2) if (p.p[i] >= 99.5) return true;
  return false;
}

/** Compress a strip vertically towards the bottom edge (y = h). */
function squash(p: Poly, h: number, k: number): Poly {
  return { ...p, p: p.p.map((v, i) => (i % 2 ? h - (h - v) * k : v)) };
}

function bbox(polys: Poly[]): { y0: number; y1: number } {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of polys) {
    for (let i = 1; i < p.p.length; i += 2) {
      y0 = Math.min(y0, p.p[i]);
      y1 = Math.max(y1, p.p[i]);
    }
  }
  return { y0, y1 };
}

function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexRgb(a);
  const [r2, g2, b2] = hexRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexRgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
