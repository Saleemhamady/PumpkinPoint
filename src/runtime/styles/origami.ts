// Origami: the story is folded out of paper. Figures unfold facet by facet, the
// landscape folds up in layers, the slide arrives as a letter unfolding in thirds,
// and figures that appear in consecutive scenes glide over instead of refolding.

import { PAPER, type PaperPalette } from '../../shared/palettes.ts';
import { SETTING_LAYERS, layoutMotifs, polyPath, type PlacedMotif, type Poly } from '../../shared/motifs.ts';
import type { Motion, RuntimeData, RuntimeScene, Setting } from '../../shared/types.ts';
import { EASE, type Timeline } from '../anim.ts';
import { fitContent, renderContent } from '../content.ts';
import { clipPolygon, h, injectStyle, s } from '../dom.ts';
import type { Renderer } from '../player.ts';

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
.og-card-wrap{position:absolute;left:1000px;top:130px;width:520px;height:660px;perspective:1800px}
.og-card{position:absolute;inset:0;transform-style:preserve-3d}
.og-panel{position:absolute;left:0;width:100%;transform-style:preserve-3d}
.og-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;background:#FFFDF7;overflow:hidden}
.og-face.back{transform:rotateX(180deg);background:linear-gradient(#EDE6D8,#E2D9C7)}
.og-p0 .og-face.front::after,.og-p2 .og-face.front::after{content:'';position:absolute;inset:0;pointer-events:none}
.og-p0 .og-face.front::after{background:linear-gradient(to bottom,rgba(0,0,0,0) 70%,rgba(0,0,0,.05))}
.og-p2 .og-face.front::after{background:linear-gradient(to bottom,rgba(0,0,0,.06),rgba(0,0,0,0) 30%)}
.og-p1 .og-face.front{box-shadow:0 30px 60px -20px rgba(0,0,0,.25)}
.og-content{position:absolute;left:0;width:520px;height:660px;padding:52px 46px;box-sizing:border-box;color:#2B2620;display:flex;flex-direction:column;justify-content:center}
.og-content .c-title{font-weight:900;font-size:calc(var(--fs) * 66px);line-height:1.05;letter-spacing:-.01em}
.og-content .c-statement{font-weight:800;font-size:calc(var(--fs) * 54px);line-height:1.15}
.og-content .c-stat{white-space:nowrap;font-weight:900;font-size:calc(var(--fs) * 170px);line-height:1;color:var(--accent);letter-spacing:-.02em}
.og-content .c-sub{font-weight:600;font-size:calc(var(--fs) * 34px);line-height:1.3;color:#6B6155;margin-top:calc(var(--fs) * 16px)}
.og-content .c-bullets{list-style:none;margin:calc(var(--fs) * 30px) 0 0;padding:0}
.og-content .c-bullet{display:flex;gap:16px;align-items:baseline;font-weight:600;font-size:calc(var(--fs) * 34px);line-height:1.28;margin:0 0 calc(var(--fs) * 18px)}
.og-content .c-mark{flex:none;width:16px;height:16px;background:var(--accent);clip-path:polygon(0 0,100% 50%,0 100%,30% 50%);transform:translateY(1px)}
.og-content .l-title .c-title{font-size:calc(var(--fs) * 80px)}
.og-content::before{content:'';position:absolute;left:46px;top:30px;width:56px;height:8px;background:var(--accent);clip-path:polygon(0 0,100% 0,88% 100%,0 100%)}
`;

const FIG_REGION = { x: 30, y: 60, w: 940, h: 800 };
const CARD_H = 660;

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
  private card: HTMLElement | null = null;

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

    // 1. The old letter folds away.
    if (this.card) this.foldCardAway(this.card, tl);

    // 2. The background paper changes colour with the mood.
    if (scene.plan.mood !== prevMood) this.paintBackground(pal, tl, first ? 0 : 200);

    // 3. The landscape: recolour if it stays, refold if it changes.
    this.updateSetting(scene.plan.setting, pal, tl, first ? 100 : 250);

    // 4. Figures: shared motifs glide to their new place, the rest fold away / unfold.
    const placed = layoutMotifs(scene.plan.motifs, FIG_REGION.w, FIG_REGION.h, scene.plan.setting);
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

    // 5. The new letter unfolds.
    this.card = this.unfoldCard(scene, pal, tl, Math.max(first ? 900 : 1250, unfoldAt - 100));
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

  private unfoldCard(scene: RuntimeScene, pal: PaperPalette, tl: Timeline, delay: number): HTMLElement {
    const wrap = h('div', 'og-card-wrap', this.stage);
    wrap.style.setProperty('--accent', pal.tones[4]);
    const card = h('div', 'og-card', wrap);
    const third = CARD_H / 3;

    // Lay the content out once, then reuse it (clipped) on each of the three panels.
    const content = h('div', 'og-content', card);
    const parts = renderContent(scene.slide, content);
    fitContent(parts.root, 520 - 92, CARD_H - 104);
    content.remove();

    const panels = [0, 1, 2].map((i) => {
      const panel = h('div', `og-panel og-p${i}`, card);
      panel.style.top = `${i * third}px`;
      panel.style.height = `${third}px`;
      const front = h('div', 'og-face front', panel);
      const copy = content.cloneNode(true) as HTMLElement;
      copy.style.top = `${-i * third}px`;
      front.appendChild(copy);
      if (i !== 1) h('div', 'og-face back', panel);
      return panel;
    });
    // Paint order matters while the card is still flat: middle, bottom flap, top flap.
    card.append(panels[1], panels[2], panels[0]);
    panels[0].style.transformOrigin = '50% 100%';
    panels[2].style.transformOrigin = '50% 0%';

    tl.animate(wrap, [
      { opacity: 0, transform: 'translateY(60px) rotate(-7deg) scale(.82)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 560, delay, easing: EASE.out });
    tl.animate(panels[0], [
      { transform: 'rotateX(-180deg) translateZ(-4px)' },
      { transform: 'rotateX(0deg) translateZ(0px)' },
    ], { duration: 760, delay: delay + 380, easing: EASE.paper });
    tl.animate(panels[2], [
      { transform: 'rotateX(180deg) translateZ(-2px)' },
      { transform: 'rotateX(0deg) translateZ(0px)' },
    ], { duration: 760, delay: delay + 880, easing: EASE.paper });

    // Little paper arrows pop in next to each bullet once the letter is open.
    const marks = Array.from(card.querySelectorAll<HTMLElement>('.c-mark'));
    const perCopy = parts.bullets.length;
    marks.forEach((m, i) => {
      tl.animate(m, [{ transform: 'translateY(1px) scale(0) rotate(-90deg)' }, { transform: 'translateY(1px) scale(1) rotate(0)' }], {
        duration: 420, delay: delay + 1500 + (i % Math.max(1, perCopy)) * 110, easing: EASE.back,
      });
    });
    return wrap;
  }

  private foldCardAway(wrap: HTMLElement, tl: Timeline): void {
    const panels = Array.from(wrap.querySelectorAll<HTMLElement>('.og-panel'));
    const top = panels.find((p) => p.classList.contains('og-p0'));
    const bottom = panels.find((p) => p.classList.contains('og-p2'));
    if (bottom) tl.animate(bottom, [{ transform: 'rotateX(0deg) translateZ(0px)' }, { transform: 'rotateX(180deg) translateZ(-2px)' }], { duration: 380, easing: EASE.in, fill: 'forwards' });
    if (top) tl.animate(top, [{ transform: 'rotateX(0deg) translateZ(0px)' }, { transform: 'rotateX(-180deg) translateZ(-4px)' }], { duration: 380, delay: 200, easing: EASE.in, fill: 'forwards' });
    tl.animate(wrap, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-40px) rotate(5deg) scale(.8)' }], {
      duration: 380, delay: 560, easing: EASE.in, fill: 'forwards',
    }).finished.then(() => wrap.remove(), () => wrap.remove());
  }
}

// ---- helpers ------------------------------------------------------------------------------

function place(el: HTMLElement, p: PlacedMotif): void {
  el.style.left = `${FIG_REGION.x + p.x}px`;
  el.style.top = `${FIG_REGION.y + p.y}px`;
  el.style.width = `${p.size}px`;
  el.style.height = `${p.size}px`;
}

function placeShadow(el: HTMLElement, p: PlacedMotif): void {
  el.style.left = `${FIG_REGION.x + p.x + p.size * 0.1}px`;
  el.style.top = `${FIG_REGION.y + p.y + p.size * 0.94}px`;
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
