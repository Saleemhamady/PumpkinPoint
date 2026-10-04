// Kinetic typography: the story is told in big animated words over bold colour
// fields; colour wipes carry the mood from scene to scene, then the slide lands.

import { KINETIC } from '../../shared/palettes.ts';
import type { KineticLine, RuntimeData, RuntimeScene } from '../../shared/types.ts';
import { EASE, easeOut, type Timeline } from '../anim.ts';
import { fitContent, formatStat, parseStat, renderContent, splitWords } from '../content.ts';
import { h, injectStyle } from '../dom.ts';
import type { Renderer } from '../player.ts';

const CSS = `
.pp-kinetic{font-family:'Anton',Impact,'Arial Narrow Bold',sans-serif}
.k-bg,.k-wipe{position:absolute;inset:0}
.k-wipe{inset:-10% -30%;transform-origin:50% 50%}
.k-scene{position:absolute;inset:0;color:var(--ink)}
.k-deco{position:absolute;border-radius:50%;pointer-events:none}
.k-ghost{position:absolute;right:-30px;bottom:-90px;font-size:520px;line-height:1;text-transform:uppercase;color:transparent;-webkit-text-stroke:3px var(--ink);opacity:.09;white-space:nowrap}
.k-line{position:absolute;left:0;right:0;top:330px;height:240px;display:flex;align-items:center;justify-content:center}
.k-line-inner{display:inline-block;white-space:nowrap;font-size:130px;line-height:1.05;text-transform:uppercase;letter-spacing:.01em;transform-origin:0 0}
.k-line .w{display:inline-block;will-change:transform}
.k-line .em{color:var(--accent);position:relative}
.k-hl{position:absolute;left:0;right:0;bottom:-.04em;height:.09em;background:var(--accent);transform-origin:0 50%}
.k-content{position:absolute;left:120px;top:150px;width:1360px;height:660px;display:flex;flex-direction:column;justify-content:center}
.k-content .c-root{width:100%}
.k-content .c-title{font-size:calc(var(--fs) * 104px);line-height:.98;text-transform:uppercase}
.k-content .c-sub{font:800 calc(var(--fs) * 34px)/1.25 'Nunito',system-ui,sans-serif;color:var(--accent);margin-top:18px}
.k-content .c-bullets{list-style:none;margin:calc(var(--fs) * 40px) 0 0;padding:0}
.k-content .c-bullet{display:flex;align-items:baseline;gap:22px;font:700 calc(var(--fs) * 40px)/1.25 'Nunito',system-ui,sans-serif;margin:0 0 calc(var(--fs) * 20px)}
.k-content .c-mark{flex:none;width:18px;height:18px;background:var(--accent);transform:translateY(-4px)}
.k-content .c-title .w{display:inline-block}
.k-content .l-title,.k-content .l-statement,.k-content .l-stat{text-align:center}
.k-content .l-title .c-title{font-size:calc(var(--fs) * 170px);line-height:.95}
.k-content .l-title .c-sub{font-size:calc(var(--fs) * 42px);margin-top:28px}
.k-content .c-statement{font-size:calc(var(--fs) * 112px);line-height:1;text-transform:uppercase}
.k-content .c-stat{white-space:nowrap;font-size:calc(var(--fs) * 300px);line-height:.95;color:var(--accent)}
.k-content .l-stat .c-sub{font-size:calc(var(--fs) * 52px);color:var(--ink)}
.k-content .l-stat .c-bullets,.k-content .l-statement .c-bullets,.k-content .l-title .c-bullets{display:inline-block;text-align:left}
`;

const LINE_STEP = 1150;

export class KineticRenderer implements Renderer {
  private stage!: HTMLElement;
  private bg!: HTMLElement;
  private data!: RuntimeData;
  private current: HTMLElement | null = null;

  mount(stage: HTMLElement, data: RuntimeData): void {
    injectStyle('pp-kinetic', CSS);
    this.stage = stage;
    this.data = data;
    this.bg = h('div', 'k-bg', stage);
  }

  frameColor(index: number): string {
    return KINETIC[this.data.scenes[index].plan.mood].bg;
  }

  show(index: number, from: number | null, tl: Timeline): void {
    const scene = this.data.scenes[index];
    const pal = KINETIC[scene.plan.mood];
    const forward = from === null || index > from;
    let t0 = 250;

    if (this.current && from !== null) {
      const old = this.current;
      tl.animate(old, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: `translateY(${forward ? -50 : 50}px)` }], {
        duration: 320,
        easing: EASE.in,
      }).finished.then(() => old.remove(), () => old.remove());

      const dir = forward ? 1 : -1;
      const wipes = [pal.accent, pal.bg].map((color, i) => {
        const w = h('div', 'k-wipe', this.stage);
        w.style.background = color;
        tl.animate(w, [
          { transform: `translateX(${-130 * dir}%) skewX(-14deg)` },
          { transform: 'translateX(0) skewX(-14deg)' },
        ], { duration: 620, delay: 120 + i * 110, easing: EASE.inOut });
        return w;
      });
      const last = wipes[1].getAnimations()[0];
      last.finished.then(() => {
        this.bg.style.background = pal.bg;
        wipes.forEach((w) => w.remove());
      }, () => {});
      t0 = 780;
    } else {
      this.bg.style.background = pal.bg;
    }

    this.current = this.buildScene(scene, index, tl, t0);
  }

  private buildScene(scene: RuntimeScene, index: number, tl: Timeline, t0: number): HTMLElement {
    const pal = KINETIC[scene.plan.mood];
    const root = h('div', 'k-scene', this.stage);
    root.style.setProperty('--ink', pal.ink);
    root.style.setProperty('--accent', pal.accent);
    root.style.setProperty('--bg', pal.bg);

    this.decorate(root, index, tl, t0);

    const lines = scene.plan.kinetic.length ? scene.plan.kinetic : [{ text: scene.slide.title, emphasis: '', motion: 'rise' as const }];
    const ghostWord = (lines[lines.length - 1].emphasis || lines[0].text.split(' ')[0] || '').toUpperCase();
    if (ghostWord) {
      const ghost = h('div', 'k-ghost', root, ghostWord);
      tl.animate(ghost, [{ transform: 'translateX(240px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 0.09 }], {
        duration: 2600, delay: t0, easing: EASE.out,
      });
      tl.loop(ghost, [{ translate: '0 0' }, { translate: '-60px 0' }, { translate: '0 0' }], { duration: 16000, delay: t0 + 2600, easing: 'ease-in-out' });
    }

    lines.forEach((line, k) => this.playLine(root, line, tl, t0 + k * LINE_STEP, k === lines.length - 1));

    const contentStart = t0 + (lines.length - 1) * LINE_STEP + 1000;
    this.playContent(root, scene, tl, contentStart);
    return root;
  }

  /** Geometric motion-graphics shapes behind the text. */
  private decorate(root: HTMLElement, index: number, tl: Timeline, t0: number): void {
    const spots = [
      { x: 1280, y: -120, r: 360 },
      { x: -160, y: 560, r: 300 },
      { x: 1180, y: 640, r: 200 },
      { x: 120, y: -140, r: 240 },
    ];
    for (let i = 0; i < 2; i++) {
      const spot = spots[(index + i * 2) % spots.length];
      const d = h('div', 'k-deco', root);
      Object.assign(d.style, {
        left: `${spot.x}px`, top: `${spot.y}px`, width: `${spot.r * 2}px`, height: `${spot.r * 2}px`,
        background: i === 0 ? 'var(--accent)' : 'transparent',
        border: i === 0 ? 'none' : '22px solid var(--ink)',
        opacity: i === 0 ? '0.16' : '0.07',
      });
      tl.animate(d, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 1100, delay: t0 + i * 150, easing: EASE.out });
      tl.loop(d, [{ translate: '0 0' }, { translate: `${i ? 30 : -40}px ${i ? -20 : 30}px` }, { translate: '0 0' }], {
        duration: 9000 + i * 3000, delay: t0 + 1100, easing: 'ease-in-out',
      });
    }
  }

  private playLine(root: HTMLElement, line: KineticLine, tl: Timeline, start: number, isLast: boolean): void {
    const el = h('div', 'k-line', root);
    const inner = h('span', 'k-line-inner', el, line.text);
    // Fit long lines to the stage width.
    const maxW = 1400;
    if (inner.offsetWidth > maxW) inner.style.fontSize = `${Math.max(56, (130 * maxW) / inner.offsetWidth)}px`;
    const words = splitWords(inner);
    const emph = line.emphasis.toLowerCase().split(/\s+/).filter(Boolean);
    for (const w of words) {
      const bare = (w.textContent ?? '').toLowerCase().replace(/[^\p{L}\p{N}%$€£'-]/gu, '');
      if (emph.includes(bare)) {
        w.classList.add('em');
        const bar = h('span', 'k-hl', w);
        tl.animate(bar, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 380, delay: start + 380, easing: EASE.out });
      }
    }

    const enter = ENTER[line.motion] ?? ENTER.rise;
    words.forEach((w, i) => {
      tl.animate(w, enter.frames, { duration: enter.duration, delay: start + i * 65, easing: enter.easing });
    });

    if (!isLast) {
      words.forEach((w, i) => {
        tl.animate(w, [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-70px)', opacity: 0 }], {
          duration: 240, delay: start + 850 + i * 25, easing: EASE.in, fill: 'forwards',
        });
      });
      return;
    }

    // The last line shrinks into a kicker above the slide content.
    const fontPx = parseFloat(getComputedStyle(inner).fontSize);
    const k = Math.min(0.45, 34 / fontPx);
    const dx = 120 - inner.offsetLeft;
    const dy = 78 - (330 + inner.offsetTop);
    tl.animate(inner, [{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${dx}px, ${dy}px) scale(${k})` }], {
      duration: 600, delay: start + 880, easing: EASE.inOut, fill: 'forwards',
    });
  }

  private playContent(root: HTMLElement, scene: RuntimeScene, tl: Timeline, start: number): void {
    const box = h('div', 'k-content', root);
    const parts = renderContent(scene.slide, box);
    fitContent(parts.root, 1360, 660);

    if (scene.slide.layout === 'stat') {
      const stat = parseStat(scene.slide.title);
      tl.animate(parts.title, [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], {
        duration: 700, delay: start, easing: EASE.back,
      });
      if (stat) {
        const grouped = /\d,\d/.test(scene.slide.title);
        parts.title.textContent = formatStat(stat, 0, grouped);
        tl.tween(1400, start, (t) => (parts.title.textContent = formatStat(stat, stat.value * t, grouped)), easeOut);
      }
    } else {
      const words = splitWords(parts.title);
      words.forEach((w, i) => {
        tl.animate(w, [{ transform: 'translateY(60px) rotate(4deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], {
          duration: 620, delay: start + i * 70, easing: EASE.out,
        });
      });
    }

    let t = start + 450;
    if (parts.subtitle) {
      tl.animate(parts.subtitle, [{ transform: 'translateX(-60px)', opacity: 0 }, { transform: 'none', opacity: 1 }], {
        duration: 560, delay: t, easing: EASE.out,
      });
      t += 200;
    }
    parts.bullets.forEach((li, i) => {
      const mark = li.querySelector('.c-mark')!;
      tl.animate(li, [{ transform: 'translateX(-80px)', opacity: 0 }, { transform: 'none', opacity: 1 }], {
        duration: 560, delay: t + i * 150, easing: EASE.out,
      });
      tl.animate(mark, [{ transform: 'translateY(-4px) scale(0) rotate(90deg)' }, { transform: 'translateY(-4px) scale(1) rotate(0)' }], {
        duration: 480, delay: t + i * 150 + 120, easing: EASE.back,
      });
    });
  }
}

const ENTER: Record<string, { frames: Keyframe[]; duration: number; easing: string }> = {
  rise: { frames: [{ transform: 'translateY(90px)', opacity: 0 }, { transform: 'none', opacity: 1 }], duration: 560, easing: EASE.out },
  slam: { frames: [{ transform: 'scale(2.6)', opacity: 0, filter: 'blur(8px)' }, { transform: 'none', opacity: 1, filter: 'blur(0)' }], duration: 480, easing: EASE.back },
  slide: { frames: [{ transform: 'translateX(-180px) skewX(-14deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], duration: 560, easing: EASE.out },
  drop: { frames: [{ transform: 'translateY(-160px) rotate(-10deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], duration: 620, easing: EASE.back },
  zoom: { frames: [{ transform: 'scale(.15)', opacity: 0 }, { transform: 'none', opacity: 1 }], duration: 560, easing: EASE.out },
};
