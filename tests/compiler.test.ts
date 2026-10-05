import { describe, expect, it, vi } from 'vitest';
import { buildDeck, sceneKey, sceneStates, toRuntimeData } from '../src/shared/compiler.ts';
import { offlinePlan } from '../src/shared/plan.ts';
import { sampleDeck } from '../src/shared/sample.ts';
import type { BuildCache, Deck, ScenePlan, Slide, TextElement } from '../src/shared/types.ts';

const plan = (tag: string): ScenePlan => ({
  mood: 'calm',
  setting: 'none',
  motifs: [{ motif: 'star', role: 'hero', motion: 'none' }],
  narration: tag,
  kinetic: [{ text: tag, emphasis: tag, motion: 'rise' }],
});

const titleOf = (slide: Slide) => (slide.elements.find((e) => e.type === 'text') as TextElement | undefined)?.text ?? '';

async function run(deck: Deck, cache: BuildCache) {
  const compile = vi.fn(async ({ slide }: { slide: Slide }) => plan(titleOf(slide)));
  const result = await buildDeck({ deck, cache, planner: 'offline', compile, fallback: async () => plan('fallback') });
  return { result, compile };
}

describe('incremental build', () => {
  it('compiles every scene the first time and nothing the second time', async () => {
    const deck = sampleDeck();
    const first = await run(deck, {});
    expect(first.compile).toHaveBeenCalledTimes(deck.slides.length);
    expect(first.result.rebuilt).toBe(deck.slides.length);

    const second = await run(deck, first.result.cache);
    expect(second.compile).not.toHaveBeenCalled();
    expect(second.result.reused).toBe(deck.slides.length);
  });

  it('rebuilds only the scene whose words or story changed', async () => {
    const deck = sampleDeck();
    const { result } = await run(deck, {});
    const edited: Deck = {
      ...deck,
      slides: deck.slides.map((s, i) =>
        i === 2 ? { ...s, story: 'A brand new story.' }
        : i === 4 ? { ...s, elements: s.elements.map((e) => (e.type === 'text' && e.list ? { ...e, text: e.text + '\nOne more' } : e)) }
        : s,
      ),
    };
    expect(sceneStates(edited, result.cache, 'offline')).toEqual(['cached', 'cached', 'stale', 'cached', 'stale', 'cached']);
    const again = await run(edited, result.cache);
    expect(again.compile).toHaveBeenCalledTimes(2);
    expect(again.result.reused).toBe(deck.slides.length - 2);
  });

  it('does not rebuild when elements move, resize, restyle or get decorations', async () => {
    const deck = sampleDeck();
    const { result } = await run(deck, {});
    const restyled: Deck = {
      ...deck,
      slides: deck.slides.map((s) => ({
        ...s,
        elements: [
          ...s.elements.map((e) => ({ ...e, x: e.x + 50, y: e.y - 20, w: e.w * 0.8, rotation: 5, ...(e.type === 'text' ? { color: '#ff0000', size: 12, bold: !e.bold } : {}) })),
          { id: 'deco', type: 'shape' as const, shape: 'star' as const, x: 10, y: 10, w: 50, h: 50, rotation: 0, fill: 'accent', stroke: 'none', strokeWidth: 0 },
        ],
      })),
    };
    const again = await run(restyled, result.cache);
    expect(again.compile).not.toHaveBeenCalled();
  });

  it('does not rebuild when the style changes, slides move or whitespace changes', async () => {
    const deck = sampleDeck();
    const { result } = await run(deck, {});
    const moved: Deck = { ...deck, style: 'kinetic', slides: [...deck.slides].reverse().map((s) => ({ ...s, story: ` ${s.story} ` })) };
    const again = await run(moved, result.cache);
    expect(again.compile).not.toHaveBeenCalled();
  });

  it('keys depend on the planner, so turning AI on rebuilds once', () => {
    const slide = sampleDeck().slides[0];
    expect(sceneKey(slide, 'ai')).not.toBe(sceneKey(slide, 'offline'));
  });

  it('uses the fallback for failed scenes without caching them', async () => {
    const deck = sampleDeck();
    const compile = vi.fn(async ({ index }: { index: number }) => {
      if (index === 1) throw new Error('boom');
      return plan(String(index));
    });
    const events: string[] = [];
    const result = await buildDeck({
      deck, cache: {}, planner: 'ai', compile, fallback: async () => plan('fallback'),
      onEvent: (e) => events.push(`${e.type}:${e.index}`),
    });
    expect(result.failed).toBe(1);
    expect(result.plans[1].narration).toBe('fallback');
    expect(result.cache[sceneKey(deck.slides[1], 'ai')]).toBeUndefined();
    expect(events).toContain('failed:1');
  });

  it('compiles identical slides once', async () => {
    const deck = sampleDeck();
    const twin: Deck = { ...deck, slides: [deck.slides[0], { ...deck.slides[0], id: 'twin' }] };
    const { compile, result } = await run(twin, {});
    expect(compile).toHaveBeenCalledTimes(1);
    expect(result.plans[0]).toEqual(result.plans[1]);
  });

  it('produces runtime data with every slide\'s elements in order', () => {
    const deck = sampleDeck();
    const plans = deck.slides.map((s, i) => offlinePlan(s.elements, s.story, i, deck.slides.length));
    const data = toRuntimeData(deck, plans);
    expect(data.scenes).toHaveLength(deck.slides.length);
    expect(data.scenes[2].elements).toBe(deck.slides[2].elements);
    expect(data.style).toBe(deck.style);
  });
});
