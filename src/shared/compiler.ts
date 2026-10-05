// The incremental compiler. Each slide compiles to a scene plan, cached under a hash
// of exactly the inputs that affect it (the slide's content and its story). Editing a
// slide or a story invalidates that one scene; everything else is reused. Switching
// style or reordering slides invalidates nothing, because plans are style-independent
// and keys do not depend on position.

import { planInputs } from './elements.ts';
import type { BuildCache, CacheEntry, Deck, Planner, RuntimeData, ScenePlan, Slide } from './types.ts';

/** Bump when the plan format or planners change in a way that should rebuild everything. */
export const PLAN_VERSION = 2;

/** Stable 53-bit string hash (cyrb53). */
export function hash(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * The cache key of a scene: only what the story plan depends on (the slide's words
 * and its story). Moving, resizing or restyling elements never invalidates a scene,
 * because positions are applied when the presentation is assembled.
 */
export function sceneKey(slide: Slide, planner: Planner): string {
  const inputs = { v: PLAN_VERSION, planner, content: planInputs(slide.elements), story: slide.story.trim() };
  return hash(JSON.stringify(inputs));
}

export type SceneState = 'cached' | 'stale';

export function sceneStates(deck: Deck, cache: BuildCache, planner: Planner): SceneState[] {
  return deck.slides.map((s) => (cache[sceneKey(s, planner)] ? 'cached' : 'stale'));
}

export interface SceneCompileContext {
  slide: Slide;
  index: number;
  total: number;
}

export type SceneCompiler = (ctx: SceneCompileContext) => Promise<ScenePlan>;

export type BuildEvent =
  | { type: 'reused'; index: number }
  | { type: 'building'; index: number }
  | { type: 'built'; index: number }
  | { type: 'failed'; index: number; error: string };

export interface BuildResult {
  cache: BuildCache;
  /** Plans for every slide, in order (failed scenes get the fallback plan). */
  plans: ScenePlan[];
  reused: number;
  rebuilt: number;
  failed: number;
}

/**
 * Compile only the scenes whose inputs changed. `fallback` supplies a plan for a scene
 * whose compile failed; that plan is used for this build but never cached, so the next
 * build retries it.
 */
export async function buildDeck(opts: {
  deck: Deck;
  cache: BuildCache;
  planner: Planner;
  compile: SceneCompiler;
  fallback: SceneCompiler;
  onEvent?: (e: BuildEvent) => void;
  concurrency?: number;
}): Promise<BuildResult> {
  const { deck, cache, planner, compile, fallback, onEvent } = opts;
  const total = deck.slides.length;
  const next: BuildCache = {};
  const plans: ScenePlan[] = new Array(total);
  const todo: number[] = [];
  let reused = 0;
  let rebuilt = 0;
  let failed = 0;

  deck.slides.forEach((slide, index) => {
    const key = sceneKey(slide, planner);
    const hit = cache[key] ?? next[key];
    if (hit) {
      next[key] = hit;
      plans[index] = hit.plan;
      reused++;
      onEvent?.({ type: 'reused', index });
    } else {
      todo.push(index);
    }
  });

  // Identical slides share a key: compile each distinct key once.
  const inflight = new Map<string, Promise<ScenePlan | null>>();
  const work = async (index: number) => {
    const slide = deck.slides[index];
    const key = sceneKey(slide, planner);
    const ctx = { slide, index, total };
    let job = inflight.get(key);
    if (!job) {
      job = (async () => {
        onEvent?.({ type: 'building', index });
        try {
          const plan = await compile(ctx);
          const entry: CacheEntry = { key, planner, plan, builtAt: Date.now() };
          next[key] = entry;
          return plan;
        } catch (err) {
          onEvent?.({ type: 'failed', index, error: err instanceof Error ? err.message : String(err) });
          return null;
        }
      })();
      inflight.set(key, job);
    }
    const plan = await job;
    if (plan) {
      plans[index] = plan;
      rebuilt++;
      onEvent?.({ type: 'built', index });
    } else {
      plans[index] = await fallback(ctx);
      failed++;
    }
  };

  const queue = [...todo];
  const workers = Array.from({ length: Math.min(opts.concurrency ?? 3, queue.length) }, async () => {
    while (queue.length) await work(queue.shift()!);
  });
  await Promise.all(workers);

  return { cache: next, plans, reused, rebuilt, failed };
}

export function toRuntimeData(deck: Deck, plans: ScenePlan[]): RuntimeData {
  return {
    title: deck.title,
    style: deck.style,
    scenes: deck.slides.map((s, i) => ({ elements: s.elements, plan: plans[i] })),
  };
}
