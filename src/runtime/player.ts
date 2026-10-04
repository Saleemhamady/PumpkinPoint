// The presentation player: a fixed 1600x900 stage scaled to the window, navigation
// (click, keys, clickers, swipe, URL hash) and a small auto-hiding control bar.

import type { RuntimeData } from '../shared/types.ts';
import { Timeline } from './anim.ts';
import { h, injectStyle } from './dom.ts';

export const STAGE_W = 1600;
export const STAGE_H = 900;

export interface Renderer {
  /** Build the persistent DOM of the style inside the stage. */
  mount(stage: HTMLElement, data: RuntimeData): void;
  /** Show scene `index`, animating from scene `from` (null on first show). */
  show(index: number, from: number | null, tl: Timeline): void;
  /** Colour around the stage (letterbox) for a scene. */
  frameColor(index: number): string;
}

const BASE_CSS = `
html,body{margin:0;height:100%;overflow:hidden;background:#111;transition:background-color .8s ease}
#pp-root{position:fixed;inset:0;overflow:hidden;cursor:default;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.pp-stage{position:absolute;left:0;top:0;width:${STAGE_W}px;height:${STAGE_H}px;transform-origin:0 0;overflow:hidden;contain:layout paint}
.pp-hud{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:999px;background:rgba(20,20,24,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fff;font:600 13px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;opacity:0;transition:opacity .3s;z-index:10}
.pp-hud.on{opacity:1}
.pp-hud button{all:unset;cursor:pointer;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;color:#fff}
.pp-hud button:hover{background:rgba(255,255,255,.16)}
.pp-hud button:focus-visible{outline:2px solid #fff}
.pp-hud svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.pp-count{min-width:54px;text-align:center;font-variant-numeric:tabular-nums}
.pp-progress{position:fixed;left:0;bottom:0;height:3px;background:rgba(255,255,255,.55);mix-blend-mode:difference;transition:width .6s cubic-bezier(.16,1,.3,1);z-index:10}
@media print{.pp-hud,.pp-progress{display:none}}
`;

const ICONS = {
  prev: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
};

export class Player {
  private stage: HTMLElement;
  private tl = new Timeline();
  private index = -1;
  private hud: HTMLElement;
  private count: HTMLElement;
  private progress: HTMLElement;
  private hudTimer = 0;
  private typed = '';

  constructor(
    private root: HTMLElement,
    private data: RuntimeData,
    private renderer: Renderer,
  ) {
    injectStyle('pp-base', BASE_CSS);
    this.stage = h('div', `pp-stage pp-${data.style}`, root);
    this.progress = h('div', 'pp-progress', document.body);
    this.hud = h('div', 'pp-hud', document.body);
    this.hud.setAttribute('role', 'toolbar');
    const btn = (icon: string, label: string, fn: () => void) => {
      const b = h('button', '', this.hud);
      b.innerHTML = icon;
      b.setAttribute('aria-label', label);
      b.title = label;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
    };
    btn(ICONS.prev, 'Previous (←)', () => this.prev());
    this.count = h('span', 'pp-count', this.hud);
    btn(ICONS.next, 'Next (→ or click)', () => this.next());
    btn(ICONS.full, 'Full screen (F)', () => this.toggleFullscreen());
  }

  start(): void {
    this.renderer.mount(this.stage, this.data);
    this.fit();
    window.addEventListener('resize', () => this.fit());
    this.bindInput();
    const fromHash = parseInt(location.hash.slice(1), 10);
    const fromName = /^pp-start:(\d+)$/.exec(window.name)?.[1];
    this.go(Number.isFinite(fromHash) ? fromHash - 1 : fromName ? Number(fromName) : 0);
  }

  get total(): number {
    return this.data.scenes.length;
  }

  next(): void {
    if (this.index < this.total - 1) this.go(this.index + 1);
  }

  prev(): void {
    if (this.index > 0) this.go(this.index - 1);
  }

  go(target: number): void {
    const to = Math.max(0, Math.min(this.total - 1, target));
    if (to === this.index || !this.total) return;
    const from = this.index < 0 ? null : this.index;
    this.tl.finish();
    this.index = to;
    this.renderer.show(to, from, this.tl);
    document.body.style.backgroundColor = this.renderer.frameColor(to);
    this.count.textContent = `${to + 1} / ${this.total}`;
    this.progress.style.width = `${((to + 1) / this.total) * 100}%`;
    try {
      history.replaceState(null, '', `#${to + 1}`);
    } catch {
      /* file:// in some browsers */
    }
    window.parent?.postMessage({ type: 'pumpkin:scene', index: to }, '*');
  }

  private fit(): void {
    const k = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    const x = (window.innerWidth - STAGE_W * k) / 2;
    const y = (window.innerHeight - STAGE_H * k) / 2;
    this.stage.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
  }

  private showHud(): void {
    this.hud.classList.add('on');
    clearTimeout(this.hudTimer);
    this.hudTimer = window.setTimeout(() => this.hud.classList.remove('on'), 2200);
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  private bindInput(): void {
    this.root.addEventListener('click', (e) => {
      // Clicking the left tenth of the screen goes back, anywhere else goes forward.
      if (e.clientX < window.innerWidth * 0.1) this.prev();
      else this.next();
    });
    this.root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.prev();
    });
    window.addEventListener('mousemove', () => this.showHud());
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N'].includes(k)) {
        if (k === 'Enter' && this.typed) {
          this.go(parseInt(this.typed, 10) - 1);
          this.typed = '';
        } else this.next();
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'].includes(k)) this.prev();
      else if (k === 'Home') this.go(0);
      else if (k === 'End') this.go(this.total - 1);
      else if (k === 'f' || k === 'F') this.toggleFullscreen();
      else if (k === 'Escape' && window.parent !== window) window.parent.postMessage({ type: 'pumpkin:escape' }, '*');
      else if (/^\d$/.test(k)) {
        this.typed = (this.typed + k).slice(-3);
        return;
      } else return;
      e.preventDefault();
      this.typed = '';
    });
    let touchX = 0;
    let touchY = 0;
    this.root.addEventListener('touchstart', (e) => {
      touchX = e.touches[0].clientX;
      touchY = e.touches[0].clientY;
    }, { passive: true });
    this.root.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchX;
      const dy = e.changedTouches[0].clientY - touchY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        e.preventDefault();
        if (dx < 0) this.next();
        else this.prev();
      }
    });
    window.addEventListener('hashchange', () => {
      const n = parseInt(location.hash.slice(1), 10);
      if (Number.isFinite(n) && n - 1 !== this.index) this.go(n - 1);
    });
    window.addEventListener('message', (e) => {
      const msg = e.data as { type?: string; index?: number } | null;
      if (msg?.type === 'pumpkin:go' && typeof msg.index === 'number') this.go(msg.index);
    });
  }
}
