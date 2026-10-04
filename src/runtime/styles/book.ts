// 3D folding book: a pop-up storybook. Each scene is a spread: the story pops up on
// the left page, the slide is printed on the right. Clicking turns the page.

import { BOOK_AMBIENT, PAPER, type PaperPalette } from '../../shared/palettes.ts';
import { SETTING_LAYERS, layoutMotifs, polyPath, type Poly } from '../../shared/motifs.ts';
import type { RuntimeData, RuntimeScene } from '../../shared/types.ts';
import { EASE, type Timeline } from '../anim.ts';
import { fitContent, renderContent } from '../content.ts';
import { h, injectStyle, motifSvg, s } from '../dom.ts';
import type { Renderer } from '../player.ts';

const PAGE_W = 650;
const PAGE_H = 820;
const TILT = 34;
const RISE = -(TILT + 24);
const FRAME = { x: 40, y: 40, w: 570, h: 560 };

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
.bk-frame{position:absolute;left:${FRAME.x}px;top:${FRAME.y}px;width:${FRAME.w}px;height:${FRAME.h}px;border-radius:4px;overflow:hidden}
.bk-frame::after{content:'';position:absolute;inset:0;box-shadow:inset 0 0 0 2px rgba(255,255,255,.5),inset 0 0 40px rgba(0,0,0,.08);border-radius:4px}
.bk-piece{position:absolute;transform-origin:50% 100%;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.bk-piece svg{position:absolute;inset:0;overflow:visible;filter:drop-shadow(0 3px 2px rgba(0,0,0,.18))}
.bk-cast{position:absolute;opacity:0;background:linear-gradient(to top,rgba(50,30,10,.2),rgba(50,30,10,0));border-radius:50% 50% 0 0;filter:blur(5px);pointer-events:none}
.bk-piece path{stroke:#FFFDF7;stroke-width:3;paint-order:stroke}
.bk-narr{position:absolute;left:70px;right:70px;top:${FRAME.y + FRAME.h + 28}px;bottom:56px;display:flex;align-items:center;justify-content:center;text-align:center;font-style:italic;font-size:29px;line-height:1.35;color:#4A3B2C}
.bk-narr::first-letter{font-size:1.6em;color:var(--accent);font-style:normal;font-weight:700}
.bk-content{position:absolute;left:70px;top:70px;width:${PAGE_W - 140}px;height:${PAGE_H - 170}px;display:flex;flex-direction:column;justify-content:center}
.bk-content .c-title{font-weight:700;font-size:calc(var(--fs) * 54px);line-height:1.1}
.bk-content .c-statement{font-style:italic;font-size:calc(var(--fs) * 46px);line-height:1.25}
.bk-content .c-statement::before{content:'\\201C';display:block;font-size:2.2em;line-height:.6;color:var(--accent)}
.bk-content .c-stat{white-space:nowrap;font-weight:700;font-size:calc(var(--fs) * 150px);line-height:1;color:var(--accent)}
.bk-content .c-sub{font-style:italic;font-size:calc(var(--fs) * 28px);line-height:1.35;color:#6A5847;margin-top:calc(var(--fs) * 18px)}
.bk-content .c-bullets{list-style:none;margin:calc(var(--fs) * 34px) 0 0;padding:0}
.bk-content .c-bullet{display:flex;gap:18px;align-items:baseline;font-size:calc(var(--fs) * 29px);line-height:1.38;margin:0 0 calc(var(--fs) * 14px)}
.bk-content .c-mark{flex:none;width:10px;height:10px;background:var(--accent);transform:rotate(45deg) translateY(-3px)}
.bk-content .l-title{text-align:center}
.bk-content .l-title .c-title{font-size:calc(var(--fs) * 66px)}
.bk-orn{position:absolute;left:50%;top:48px;width:90px;height:2px;margin-left:-45px;background:var(--accent);opacity:.7}
.bk-folio{position:absolute;left:0;right:0;bottom:36px;text-align:center;font-size:20px;color:#9A8770;font-style:italic}
`;

interface Piece {
  el: HTMLElement;
  /** Soft shadow printed on the page behind the standing piece. */
  shadow: HTMLElement;
}

interface StoryPage {
  face: HTMLElement;
  pieces: Piece[];
  /** Pages are flat (cheap, and safe for 3D sorting) unless their pop-ups are up. */
  up: boolean;
}

export class BookRenderer implements Renderer {
  private data!: RuntimeData;
  private ambHost!: HTMLElement;
  private leaves: HTMLElement[] = [];
  /** The pop-up page of each scene (the back of leaf k is scene k's story). */
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
    // Leaf 0 is the cover; leaf k (1..n) carries slide k-1 on its front and scene k's
    // pop-up page on its back.
    for (let k = 0; k <= n; k++) {
      const leaf = h('div', 'bk-leaf', book);
      const front = h('div', 'bk-face front', leaf);
      const back = h('div', 'bk-face back', leaf);
      if (k === 0) this.buildCover(front);
      else this.buildContentPage(front, data.scenes[k - 1], k);
      this.pages[k] = { face: back, pieces: k < n ? this.buildStoryPage(back, data.scenes[k]) : [], up: false };
      h('div', 'bk-gutter', back);
      h('div', 'bk-shade', front);
      h('div', 'bk-shade', back);
      this.leaves.push(leaf);
      this.flipped.push(false);
      this.setLeaf(k, false);
    }
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

  private buildContentPage(face: HTMLElement, scene: RuntimeScene, folio: number): void {
    const pal = PAPER[scene.plan.mood];
    face.style.setProperty('--accent', accentFor(pal));
    h('div', 'bk-orn', face);
    const box = h('div', 'bk-content', face);
    const parts = renderContent(scene.slide, box);
    fitContent(parts.root, PAGE_W - 140, PAGE_H - 170);
    h('div', 'bk-folio', face, `— ${folio} —`);
    h('div', 'bk-gutter', face);
  }

  private buildStoryPage(face: HTMLElement, scene: RuntimeScene): Piece[] {
    const pal = PAPER[scene.plan.mood];
    face.style.setProperty('--accent', accentFor(pal));
    const frame = h('div', 'bk-frame', face);
    frame.style.background = `linear-gradient(to bottom, ${pal.bg2} 0%, ${pal.bg} 70%)`;
    const pieces: Piece[] = [];
    const bottom = FRAME.y + FRAME.h;

    const addPiece = (left: number, base: number, w: number, ht: number, content: Element, castShadow = true) => {
      const shadow = h('div', 'bk-cast', face);
      if (castShadow) Object.assign(shadow.style, { left: `${left}px`, top: `${base - ht * 0.3}px`, width: `${w}px`, height: `${ht * 0.3}px` });
      const el = h('div', 'bk-piece', face);
      Object.assign(el.style, { left: `${left}px`, top: `${base - ht}px`, width: `${w}px`, height: `${ht}px` });
      el.appendChild(content);
      pieces.push({ el, shadow });
    };

    // Ground strips (waves, hills, skylines) become pop-up layers; anything floating
    // (clouds, stars) is printed on the backdrop.
    const layers = SETTING_LAYERS[scene.plan.setting];
    const strips = layers.filter((l) => l.polys.every((p) => p.f === false || touchesBottom(p)));
    const printed = layers.filter((l) => !strips.includes(l));
    if (printed.length) {
      const svg = s('svg', { width: FRAME.w, height: FRAME.h, viewBox: `0 0 ${FRAME.w} ${FRAME.h}` }, frame);
      svg.style.position = 'absolute';
      for (const l of printed) for (const p of l.polys) if (p.f !== false) s('path', { d: polyPath(scale(p, FRAME.w / 200, FRAME.h / 100), 0, 0, 100), fill: pal.tones[p.t] }, svg);
    }
    const stripBase = (i: number) => bottom - (strips.length - 1 - i) * 30;
    strips.forEach((layer, i) => {
      // Squash the strip so it only hides the feet of the figures behind it.
      const polys = layer.polys.filter((p) => p.f !== false).map((p) => squash(scale(p, FRAME.w / 200, FRAME.h / 100), FRAME.h, 0.55));
      const bb = bbox(polys);
      const ht = bb.y1 - bb.y0;
      const svg = s('svg', { width: FRAME.w, height: ht, viewBox: `0 ${bb.y0} ${FRAME.w} ${ht}` }, null);
      for (const p of polys) s('path', { d: polyPath(p, 0, 0, 100), fill: pal.tones[p.t] }, svg);
      addPiece(FRAME.x, stripBase(i), FRAME.w, ht, svg);
    });

    // The motifs as cut-out figures. Ground figures stand just behind the front strip.
    const placed = layoutMotifs(scene.plan.motifs, FRAME.w, FRAME.h, scene.plan.setting);
    for (const m of placed) {
      const groundBase = strips.length ? bottom - 16 : bottom - 6;
      const base = m.def.place === 'ground' ? groundBase : FRAME.y + m.y + m.size;
      addPiece(FRAME.x + m.x, base, m.size, m.size, motifSvg(m.def, pal.tones, m.size), m.def.place === 'ground');
    }

    if (scene.plan.narration) h('div', 'bk-narr', face, scene.plan.narration);
    for (const p of pieces) p.el.style.transform = 'translateZ(1px) rotateX(0deg)';
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
    page.face.style.transformStyle = 'preserve-3d';
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
      if (!page.up) page.face.style.transformStyle = '';
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
