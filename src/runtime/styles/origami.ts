// Origami: the story is folded out of paper. Figures unfold facet by facet in the
// empty part of the slide, the landscape folds up in layers, the slide's own text
// folds down like paper flaps and its shapes and pictures unfold from the middle.
// Figures that appear in consecutive scenes glide over instead of refolding.

import { PAPER, type PaperPalette } from '../../shared/palettes.ts';
import { SETTING_LAYERS, polyPath, type PlacedMotif, type Poly } from '../../shared/motifs.ts';
import { themeFor } from '../../shared/theme.ts';
import { CANVAS_H, CANVAS_W, type Motion, type RuntimeData, type RuntimeScene, type Setting, type SlideElement } from '../../shared/types.ts';
import { EASE, type Timeline } from '../anim.ts';
import { clipPolygon, h, injectStyle, s } from '../dom.ts';
import { readingOrder, renderSlide } from '../elements.ts';
import type { Renderer } from '../player.ts';
import { storyLayout } from '../story.ts';

const CSS = `
.pp-origami{font-family:'Nunito',system-ui,sans-serif}
.og-bg{position:absolute;inset:0}
.og-grain{position:absolute;inset:0;pointer-events:none;mix-blend-mode:multiply;opacity:.6;
  background:
    linear-gradient(115deg,transparent 49.6%,rgba(0,0,0,.045) 50%,rgba(255,255,255,.05) 50.4%,transparent 51%),
    linear-gradient(62deg,transparent 49.7%,rgba(0,0,0,.035) 50%,transparent 50.5%),
    repeating-linear-gradient(45deg,rgba(0,0,0,.012) 0 2px,transparent 2px 6px),
    repeating-linear-gradient(-45deg,rgba(0,0,0,.01) 0 1px,transparent 1px 5px)}
.og-setting{position:absolute;inset:0;perspective:1400px;perspective-origin:50% 30%}
.og-layer{position:absolute;inset:0;filter:drop-shadow(0 -6px 8px rgba(0,0,0,.14))}
.og-layer svg{position:absolute;inset:0;overflow:visible}
.og-layer path{transition:fill .9s ease}
.og-fig{position:absolute;perspective:1100px}
.og-fig-inner{position:absolute;inset:0;transform-style:preserve-3d}
.og-facet{position:absolute;inset:0;transition:background-color .9s ease;backface-visibility:visible}
.og-shadow{position:absolute;height:26px;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.22),rgba(0,0,0,0));transform-origin:50% 50%}
.og-slide{position:absolute;inset:0;perspective:1600px}
.og-fold{position:absolute;perspective:1200px;transform-origin:50% 50%}
.og-fold>.pp-el{left:0!important;top:0!important;rotate:none!important}
`;


interface Fig {
  motif: string;
  el: HTMLElement;
  inner: HTMLElement;
  facets: HTMLElement[];
  shadow: HTMLElement | null;
  placed: PlacedMotif;
}

interface SettingView {
  setting: Setting;
  root: HTMLElement;
  layers: { el: HTMLElement; paths: { el: SVGPathElement; t: number }[] }[];
}

export class OrigamiRenderer implements Renderer {
  private stage!: HTMLElement;
  private data!: RuntimeData;
  private bgHost!: HTMLElement;
  private settingHost!: HTMLElement;
  private figHost!: HTMLElement;
  private figs: Fig[] = [];
  private settingView: SettingView | null = null;
  private slide: HTMLElement | null = null;

  mount(stage: HTMLElement, data: RuntimeData): void {
    injectStyle('pp-origami', CSS);
    this.stage = stage;
    this.data = data;
    this.bgHost = h('div', '', stage);
    h('div', 'og-grain', stage);
    this.settingHost = h('div', '', stage);
    this.figHost = h('div', '', stage);
  }

  frameColor(index: number): string {
    return PAPER[this.data.scenes[index].plan.mood].bg2;
  }

  show(index: number, from: number | null, tl: Timeline): void {
    const scene = this.data.scenes[index];
    const pal = PAPER[scene.plan.mood];
    const prevMood = from === null ? null : this.data.scenes[from].plan.mood;
    const first = from === null;

    // 1. The old slide folds away.
    if (this.slide) this.foldSlideAway(this.slide, tl);

    // 2. The background paper changes colour with the mood.
    if (scene.plan.mood !== prevMood) this.paintBackground(pal, tl, first ? 0 : 200);

    // 3. The landscape: recolour if it stays, refold if it changes.
    this.updateSetting(scene.plan.setting, pal, tl, first ? 100 : 250);

    // 4. Figures: shared motifs glide to their new place, the rest fold away / unfold.
    const story = storyLayout(scene.elements, scene.plan);
    const placed = story.placed;
    tl.animate(this.figHost, [{ opacity: Number(getComputedStyle(this.figHost).opacity) }, { opacity: story.ghost ? 0.28 : 1 }], { duration: 600, fill: 'forwards' });
    const next: Fig[] = [];
    const leaving = [...this.figs];
    let unfoldAt = first ? 450 : 950;
    for (const p of placed) {
      const i = leaving.findIndex((f) => f.motif === p.def.id);
      if (i >= 0) {
        const fig = leaving.splice(i, 1)[0];
        this.moveFig(fig, p, pal, tl, first ? 0 : 350);
        next.push(fig);
      } else {
        next.push(this.unfoldFig(p, pal, tl, unfoldAt));
        unfoldAt += 260;
      }
    }
    for (const fig of leaving) this.foldFigAway(fig, tl);
    this.figs = next;

    // 5. The slide's own elements unfold.
    this.slide = this.unfoldSlide(scene, tl, Math.max(first ? 800 : 1150, unfoldAt - 200));
  }

  // ---- background -------------------------------------------------------------------

  private paintBackground(pal: PaperPalette, tl: Timeline, delay: number): void {
    const layer = h('div', 'og-bg', this.bgHost);
    layer.style.background = `radial-gradient(ellipse at 30% 25%, ${pal.bg} 0%, ${pal.bg} 35%, ${pal.bg2} 100%)`;
    const older = Array.from(this.bgHost.children).slice(0, -1);
    tl.animate(layer, [{ opacity: 0 }, { opacity: 1 }], { duration: delay ? 900 : 1, delay, easing: 'ease' })
      .finished.then(() => older.forEach((o) => o.remove()), () => {});
  }

  // ---- landscape ----------------------------------------------------------------------

  private updateSetting(setting: Setting, pal: PaperPalette, tl: Timeline, delay: number): void {
    const view = this.settingView;
    if (view && view.setting === setting) {
      for (const layer of view.layers) for (const p of layer.paths) p.el.style.fill = pal.tones[p.t];
      return;
    }
    let upAt = delay;
    if (view) {
      view.layers.forEach((layer, i) => {
        tl.animate(layer.el, [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(88deg)' }], {
          duration: 420, delay: delay + (view.layers.length - 1 - i) * 70, easing: EASE.in, fill: 'forwards',
        });
      });
      const old = view.root;
      setTimeout(() => old.remove(), delay + 900);
      upAt = delay + 420 + view.layers.length * 70;
    }
    const root = h('div', 'og-setting', this.settingHost);
    const layers = SETTING_LAYERS[setting].map((layer, i) => {
      const el = h('div', 'og-layer', root);
      const svg = s('svg', { viewBox: '0 0 1600 900', preserveAspectRatio: 'none', width: 1600, height: 900 }, el);
      let bottom = 0;
      const paths = layer.polys
        .filter((p) => p.f !== false)
        .map((poly) => {
          const scaled = scalePoly(poly, 8, 9);
          for (let k = 1; k < scaled.p.length; k += 2) bottom = Math.max(bottom, scaled.p[k]);
          const path = s('path', { d: polyPath(scaled, 0, 0, 100) }, svg);
          path.style.fill = pal.tones[poly.t];
          return { el: path, t: poly.t };
        });
      el.style.transformOrigin = `50% ${bottom}px`;
      tl.animate(el, [{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(-6deg)', offset: 0.75 }, { transform: 'rotateX(0deg)' }], {
        duration: 760, delay: upAt + i * 120, easing: EASE.paper,
      });
      return { el, paths };
    });
    this.settingView = { setting, root, layers };
  }

  // ---- figures -------------------------------------------------------------------------

  private unfoldFig(p: PlacedMotif, pal: PaperPalette, tl: Timeline, delay: number): Fig {
    const el = h('div', 'og-fig', this.figHost);
    place(el, p);
    let shadow: HTMLElement | null = null;
    if (p.def.place === 'ground') {
      shadow = h('div', 'og-shadow', this.figHost);
      placeShadow(shadow, p);
      this.figHost.insertBefore(shadow, el);
      tl.animate(shadow, [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 700, delay, easing: EASE.out });
    }
    const inner = h('div', 'og-fig-inner', el);
    const fills = p.def.polys.filter((poly) => poly.f !== false);
    const c = centroid(fills);
    const facets = fills.map((poly) => {
      const f = h('div', 'og-facet', inner);
      f.style.clipPath = clipPolygon(poly);
      f.style.backgroundColor = pal.tones[poly.t];
      f.dataset.tone = String(poly.t);
      return { f, poly, d: dist(polyCenter(poly), c) };
    });
    const order = [...facets].sort((a, b) => a.d - b.d);
    order.forEach(({ f, poly }, i) => {
      const fold = foldTransform(poly, c, p.size);
      f.style.transformOrigin = fold.origin;
      tl.animate(f, [
        { transform: fold.at(fold.sign * 175), opacity: 0, filter: 'brightness(.55)' },
        { opacity: 1, offset: 0.12 },
        { transform: fold.at(fold.sign * 70), filter: 'brightness(.8)', offset: 0.55 },
        { transform: fold.at(0), opacity: 1, filter: 'brightness(1)' },
      ], { duration: 640, delay: delay + i * 45, easing: EASE.paper });
    });
    tl.animate(inner, [{ transform: 'rotateY(-28deg) scale(.92)' }, { transform: 'rotateY(0deg) scale(1)' }], {
      duration: 900 + order.length * 45, delay, easing: EASE.out,
    });
    const settle = delay + 700 + order.length * 45;
    idle(inner, p.motion, tl, settle);
    return { motif: p.def.id, el, inner, facets: facets.map((x) => x.f), shadow, placed: p };
  }

  private moveFig(fig: Fig, p: PlacedMotif, pal: PaperPalette, tl: Timeline, delay: number): void {
    const a = fig.placed;
    const k = a.size / p.size;
    place(fig.el, p);
    tl.animate(fig.el, [
      { transform: `translate(${a.x - p.x}px, ${a.y - p.y}px) scale(${k})`, transformOrigin: '0 0' },
      { transform: 'translate(0,0) scale(1)', transformOrigin: '0 0' },
    ], { duration: 1100, delay, easing: EASE.inOut });
    if (fig.shadow) {
      placeShadow(fig.shadow, p);
      tl.animate(fig.shadow, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: delay + 700 });
    }
    fig.facets.forEach((f) => (f.style.backgroundColor = pal.tones[Number(f.dataset.tone)]));
    if (p.motion !== fig.placed.motion) {
      fig.inner.getAnimations().forEach((an) => an.cancel());
      idle(fig.inner, p.motion, tl, delay + 1100);
    }
    fig.placed = p;
  }

  private foldFigAway(fig: Fig, tl: Timeline): void {
    const fills = fig.placed.def.polys.filter((poly) => poly.f !== false);
    const c = centroid(fills);
    const n = fig.facets.length;
    fig.facets.forEach((f, i) => {
      const fold = foldTransform(fills[i], c, fig.placed.size);
      tl.animate(f, [
        { transform: fold.at(0), opacity: 1 },
        { transform: fold.at(fold.sign * 175), opacity: 0 },
      ], { duration: 420, delay: (n - 1 - i) * 22, easing: EASE.in, fill: 'forwards' });
    });
    const out = tl.animate(fig.el, [{ transform: 'scale(1)' }, { transform: 'scale(.8)' }], { duration: 420 + n * 22, easing: EASE.in, fill: 'forwards' });
    if (fig.shadow) tl.animate(fig.shadow, [{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
    out.finished.then(() => {
      fig.el.remove();
      fig.shadow?.remove();
    }, () => {});
  }

  // ---- the letter -----------------------------------------------------------------------

  private unfoldSlide(scene: RuntimeScene, tl: Timeline, delay: number): HTMLElement {
    const layer = h('div', 'og-slide', this.stage);
    const theme = themeFor('origami', scene.plan.mood);
    const nodes = renderSlide(scene.elements, theme, layer);
    // Big panels and pictures first (they are usually backdrops), then reading order.
    const items = scene.elements.map((el, i) => ({ el, node: nodes[i] }));
    const big = (el: SlideElement) => el.type !== 'text' && el.w * el.h > CANVAS_W * CANVAS_H * 0.08;
    const ordered = [...items.filter((it) => big(it.el)), ...readingOrder(items.filter((it) => !big(it.el)))];
    ordered.forEach(({ el, node }, i) => {
      const at = delay + i * 150;
      if (el.type === 'text') {
        node.style.transformOrigin = '50% 0%';
        tl.animate(node, [
          { transform: 'rotateX(-100deg)', opacity: 0, filter: 'brightness(.6)' },
          { opacity: 1, offset: 0.2 },
          { transform: 'rotateX(12deg)', filter: 'brightness(1.08)', offset: 0.75 },
          { transform: 'rotateX(0deg)', opacity: 1, filter: 'brightness(1)' },
        ], { duration: 820, delay: at, easing: EASE.paper });
      } else {
        this.unfoldHalves(layer, el, node, tl, at);
      }
    });
    return layer;
  }

  /** A sheet folded in half unfolds: the lower half swings down from behind the upper. */
  private unfoldHalves(layer: HTMLElement, el: SlideElement, node: HTMLElement, tl: Timeline, at: number): void {
    const wrap = h('div', 'og-fold', layer);
    Object.assign(wrap.style, { left: `${el.x}px`, top: `${el.y}px`, width: `${el.w}px`, height: `${el.h}px` });
    if (el.rotation) wrap.style.rotate = `${el.rotation}deg`;
    layer.insertBefore(wrap, node);
    const top = node.cloneNode(true) as HTMLElement;
    const bottom = node.cloneNode(true) as HTMLElement;
    top.style.clipPath = 'inset(0 0 50% 0)';
    bottom.style.clipPath = 'inset(50% 0 0 0)';
    bottom.style.transformOrigin = '50% 50%';
    wrap.append(top, bottom);
    node.style.visibility = 'hidden';
    tl.animate(wrap, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none', offset: 0.25 }, { opacity: 1, transform: 'none' }], { duration: 900, delay: at, easing: EASE.out });
    tl.animate(top, [{ filter: 'brightness(.85)' }, { filter: 'brightness(1)' }], { duration: 900, delay: at });
    const open = tl.animate(bottom, [
      { transform: 'rotateX(178deg)', filter: 'brightness(.6)' },
      { transform: 'rotateX(80deg)', filter: 'brightness(.75)', offset: 0.5 },
      { transform: 'rotateX(0deg)', filter: 'brightness(1)' },
    ], { duration: 900, delay: at, easing: EASE.paper });
    const settle = () => {
      node.style.visibility = '';
      wrap.remove();
    };
    open.finished.then(settle, settle);
  }

  private foldSlideAway(layer: HTMLElement, tl: Timeline): void {
    const nodes = Array.from(layer.children) as HTMLElement[];
    let last: Animation | null = null;
    nodes.forEach((node, i) => {
      node.style.transformOrigin = '50% 0%';
      last = tl.animate(node, [{ transform: 'rotateX(0deg)', opacity: 1 }, { transform: 'rotateX(-95deg)', opacity: 0 }], {
        duration: 420, delay: (nodes.length - 1 - i) * 40, easing: EASE.in, fill: 'forwards',
      });
    });
    const done = () => layer.remove();
    if (last) (last as Animation).finished.then(done, done);
    else done();
  }
}

// ---- helpers ------------------------------------------------------------------------------

function place(el: HTMLElement, p: PlacedMotif): void {
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  el.style.width = `${p.size}px`;
  el.style.height = `${p.size}px`;
}

function placeShadow(el: HTMLElement, p: PlacedMotif): void {
  el.style.left = `${p.x + p.size * 0.1}px`;
  el.style.top = `${p.y + p.size * 0.94}px`;
  el.style.width = `${p.size * 0.8}px`;
}

function scalePoly(poly: Poly, kx: number, ky: number): Poly {
  return { ...poly, p: poly.p.map((v, i) => (i % 2 ? v * ky : v * kx)) };
}

function polyCenter(poly: Poly): { x: number; y: number } {
  let x = 0;
  let y = 0;
  const n = poly.p.length / 2;
  for (let i = 0; i < poly.p.length; i += 2) {
    x += poly.p[i];
    y += poly.p[i + 1];
  }
  return { x: x / n, y: y / n };
}

function centroid(polys: Poly[]): { x: number; y: number } {
  const cs = polys.map(polyCenter);
  return { x: cs.reduce((a, c) => a + c.x, 0) / cs.length, y: cs.reduce((a, c) => a + c.y, 0) / cs.length };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Fold a facet around the edge nearest to the figure's centre, so the paper seems to
 * open outwards from the middle. Returns a transform builder for a given fold angle.
 */
function foldTransform(poly: Poly, c: { x: number; y: number }, size: number) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < poly.p.length; i += 2) pts.push({ x: poly.p[i], y: poly.p[i + 1] });
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const d = dist({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, c);
    if (d < bestD) [best, bestD] = [i, d];
  }
  const a = pts[best];
  const b = pts[(best + 1) % pts.length];
  const theta = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const pc = polyCenter(poly);
  const cross = (b.x - a.x) * (pc.y - a.y) - (b.y - a.y) * (pc.x - a.x);
  const k = size / 100;
  return {
    origin: `${(a.x * k).toFixed(1)}px ${(a.y * k).toFixed(1)}px`,
    sign: cross > 0 ? 1 : -1,
    at: (deg: number) => `rotate(${theta.toFixed(2)}deg) rotateX(${deg}deg) rotate(${(-theta).toFixed(2)}deg)`,
  };
}

const IDLE: Record<Motion, { frames: Keyframe[]; duration: number; easing: string } | null> = {
  none: null,
  float: { frames: [{ transform: 'translateY(0)' }, { transform: 'translateY(-14px)' }, { transform: 'translateY(0)' }], duration: 4200, easing: 'ease-in-out' },
  drift: { frames: [{ transform: 'translateX(0)' }, { transform: 'translateX(22px)' }, { transform: 'translateX(0)' }], duration: 7000, easing: 'ease-in-out' },
  rise: { frames: [{ transform: 'translateY(0)' }, { transform: 'translateY(-24px)' }, { transform: 'translateY(0)' }], duration: 5200, easing: 'ease-in-out' },
  sway: { frames: [{ transform: 'rotate(0)' }, { transform: 'rotate(3deg)' }, { transform: 'rotate(-3deg)' }, { transform: 'rotate(0)' }], duration: 5200, easing: 'ease-in-out' },
  pulse: { frames: [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }], duration: 2400, easing: 'ease-in-out' },
  spin: { frames: [{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], duration: 26000, easing: 'linear' },
  grow: { frames: [{ transform: 'scale(.97)' }, { transform: 'scale(1.03)' }, { transform: 'scale(.97)' }], duration: 4200, easing: 'ease-in-out' },
};

function idle(el: HTMLElement, motion: Motion, tl: Timeline, delay: number): void {
  const spec = IDLE[motion];
  if (!spec) return;
  tl.loop(el, spec.frames, { duration: spec.duration, delay, easing: spec.easing });
}
