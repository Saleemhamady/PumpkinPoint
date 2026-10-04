// Animation bookkeeping. Every finite animation of a transition is registered on a
// Timeline so a click in the middle of a transition can jump it to its end state.

export const EASE = {
  out: 'cubic-bezier(.16,1,.3,1)',
  inOut: 'cubic-bezier(.65,0,.35,1)',
  in: 'cubic-bezier(.55,0,1,.45)',
  back: 'cubic-bezier(.34,1.56,.64,1)',
  paper: 'cubic-bezier(.2,.75,.25,1)',
};

export interface Tween {
  finish(): void;
  readonly done: Promise<void>;
}

export class Timeline {
  private anims = new Set<Animation>();
  private tweens = new Set<Tween>();

  /** A finite Web Animation; `fill` defaults to 'both'. */
  animate(el: Element, keyframes: Keyframe[], opts: KeyframeAnimationOptions): Animation {
    const a = el.animate(keyframes, { fill: 'both', ...opts });
    this.anims.add(a);
    const drop = () => this.anims.delete(a);
    a.finished.then(drop, drop);
    return a;
  }

  /** An infinite idle animation: not finished on skip, removed with its element. */
  loop(el: Element, keyframes: Keyframe[], opts: KeyframeAnimationOptions): Animation {
    return el.animate(keyframes, { iterations: Infinity, ...opts });
  }

  /** A JS-driven tween (for effects WAAPI cannot express). `update` receives 0..1. */
  tween(duration: number, delay: number, update: (t: number) => void, ease: (t: number) => number = easeInOut): Tween {
    let raf = 0;
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    const start = performance.now() + delay;
    let finished = false;
    const tween: Tween = {
      done,
      finish: () => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(raf);
        update(1);
        this.tweens.delete(tween);
        resolve();
      },
    };
    const frame = (now: number) => {
      if (finished) return;
      const t = (now - start) / Math.max(1, duration);
      if (t >= 1) return tween.finish();
      if (t >= 0) update(ease(t));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    this.tweens.add(tween);
    return tween;
  }

  /** Jump every running animation to its end. */
  finish(): void {
    // Finishing can trigger callbacks that register new animations; loop until quiet.
    for (let guard = 0; guard < 5 && (this.anims.size || this.tweens.size); guard++) {
      for (const a of [...this.anims]) {
        try {
          a.finish();
        } catch {
          a.cancel();
        }
        this.anims.delete(a);
      }
      for (const t of [...this.tweens]) t.finish();
    }
  }
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const linear = (t: number) => t;
