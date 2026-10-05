import { describe, expect, it } from 'vitest';
import { bounds, layoutElements, planInputs, relayout, slideSummary, storyRegion, textsInOrder } from '../src/shared/elements.ts';
import { fontsForDeck } from '../src/shared/fonts.ts';
import { resolveColor, themeFor } from '../src/shared/theme.ts';
import { CANVAS_H, CANVAS_W, type SlideElement, type TextElement } from '../src/shared/types.ts';
import { align, reorder, resizeBox, snapMove } from '../src/editor/geometry.ts';
import { normalizeProject } from '../src/editor/state.ts';

const text = (partial: Partial<TextElement>): TextElement => ({
  id: 't', type: 'text', role: 'body', text: 'x', x: 0, y: 0, w: 100, h: 50, rotation: 0,
  font: 'auto', size: 40, bold: false, italic: false, align: 'left', valign: 'top', color: 'ink', list: false, ...partial,
});

describe('templates', () => {
  it('lays out structured content as positioned text', () => {
    const els = layoutElements({ layout: 'bullets', title: 'Growth', subtitle: '', bullets: ['More users', '', 'Faster'] });
    const texts = els as TextElement[];
    expect(texts.map((t) => t.role)).toEqual(['title', 'body']);
    expect(texts[1].list).toBe(true);
    expect(texts[1].text).toBe('More users\nFaster');
    for (const e of els) {
      expect(e.x).toBeGreaterThanOrEqual(0);
      expect(e.x + e.w).toBeLessThanOrEqual(CANVAS_W);
      expect(e.y + e.h).toBeLessThanOrEqual(CANVAS_H);
    }
  });

  it('uses the stat role and accent colour for big numbers', () => {
    const [stat] = layoutElements({ layout: 'stat', title: '42%', subtitle: 'retention', bullets: [] }) as TextElement[];
    expect(stat.role).toBe('stat');
    expect(stat.color).toBe('accent');
  });

  it('re-arranges text by role and leaves pictures alone', () => {
    const els: SlideElement[] = [
      text({ id: 'a', role: 'title', text: 'Hi', x: 900, y: 700 }),
      { id: 'p', type: 'image', src: 'data:image/png;base64,AA', x: 5, y: 6, w: 70, h: 80, rotation: 0, fit: 'cover', radius: 0, alt: '' },
    ];
    const out = relayout(els, 'title');
    expect(out[0].x).not.toBe(900);
    expect(out[1]).toBe(els[1]);
  });
});

describe('reading a slide', () => {
  it('orders text top to bottom and summarises it for the AI', () => {
    const els = [text({ id: 'b', text: 'second', y: 400 }), text({ id: 'a', role: 'title', text: 'first', y: 100 })];
    expect(textsInOrder(els).map((t) => t.id)).toEqual(['a', 'b']);
    expect(slideSummary(els)).toBe('title: first\nbody: second');
  });

  it('ignores position and styling in plan inputs', () => {
    const a = [text({ text: 'Same words', x: 0 })];
    const b = [text({ text: 'Same words', x: 500, y: 300, color: '#ff0000', size: 90 })];
    expect(planInputs(a)).toEqual(planInputs(b));
    expect(planInputs([text({ text: 'Other words' })])).not.toEqual(planInputs(a));
  });
});

describe('story region', () => {
  it('finds the empty right half next to left-aligned text', () => {
    const r = storyRegion([text({ x: 100, y: 80, w: 800, h: 700 })])!;
    expect(r.x).toBeGreaterThanOrEqual(900);
    expect(r.w).toBeGreaterThan(500);
    expect(r.h).toBeGreaterThan(700);
  });

  it('treats a full-slide shape as a background, and a full slide as having no room', () => {
    const bg: SlideElement = { id: 'bg', type: 'shape', shape: 'rect', x: 0, y: 0, w: CANVAS_W, h: CANVAS_H, rotation: 0, fill: 'paper', stroke: 'none', strokeWidth: 0 };
    expect(storyRegion([bg])).not.toBeNull();
    const grid = Array.from({ length: 4 }, (_, i) => text({ id: `t${i}`, x: (i % 2) * 800, y: Math.floor(i / 2) * 450, w: 780, h: 430 }));
    expect(storyRegion(grid)).toBeNull();
  });

  it('accounts for rotation', () => {
    const b = bounds({ x: 0, y: 0, w: 200, h: 100, rotation: 90 });
    expect(b.w).toBeCloseTo(100);
    expect(b.h).toBeCloseTo(200);
  });
});

describe('themes and fonts', () => {
  it('resolves colour tokens per style and mood so text stays readable', () => {
    expect(resolveColor('ink', themeFor('kinetic', 'tense'))).toBe('#F2F2F2');
    expect(resolveColor('ink', themeFor('kinetic', 'neutral'))).toBe('#141414');
    expect(resolveColor('#123456', themeFor('origami', 'calm'))).toBe('#123456');
    expect(resolveColor('none', themeFor('book', 'calm'))).toBe('transparent');
    expect(themeFor('book', 'calm')).toBe(themeFor('book', 'calm'));
  });

  it('embeds the style fonts plus any chosen typefaces', () => {
    const deck = { style: 'origami' as const, slides: [{ id: 's', story: '', elements: [text({ font: 'hand' })] }] };
    expect(fontsForDeck(deck).sort()).toEqual(['hand', 'sans']);
  });
});

describe('editor geometry', () => {
  it('snaps a box to the slide centre', () => {
    const s = snapMove({ x: 695, y: 10, w: 200, h: 100 }, [], 8);
    expect(s.dx).toBe(5);
    expect(s.guides.x).toEqual([800]);
  });

  it('resizes from a corner keeping the opposite corner fixed', () => {
    const el = text({ x: 100, y: 100, w: 200, h: 100 });
    const r = resizeBox(el, 1, 1, 50, 20, false);
    expect([r.x, r.y, r.w, r.h]).toEqual([100, 100, 250, 120]);
    const l = resizeBox(el, -1, 0, 30, 999, false);
    expect([l.x, l.y, l.w, l.h]).toEqual([130, 100, 170, 100]);
  });

  it('keeps the anchor fixed for rotated boxes', () => {
    const el = text({ x: 100, y: 100, w: 200, h: 100, rotation: 90 });
    const r = resizeBox(el, 1, 0, 0, 40, false);
    expect(r.w).toBe(240);
    // The left edge (top, after a 90° turn) stays where it was: the centre moves down by 20.
    expect(r.y + r.h / 2).toBeCloseTo(170);
  });

  it('aligns and reorders', () => {
    const els = [text({ id: 'a', x: 10, y: 0 }), text({ id: 'b', x: 300, y: 50 })];
    expect(align(els, ['a', 'b'], 'left').map((e) => e.x)).toEqual([10, 10]);
    expect(align(els, ['a'], 'hcenter')[0].x).toBe(750);
    expect(reorder(els, ['a'], 'front').map((e) => e.id)).toEqual(['b', 'a']);
    expect(reorder(els, ['b'], 'backward').map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('loading projects', () => {
  it('upgrades version-1 slides (title and bullets fields) to elements', () => {
    const p = normalizeProject({ deck: { title: 'Old', style: 'book', slides: [{ layout: 'bullets', title: 'Hello', subtitle: '', bullets: ['a', 'b'], story: 'once' }] } })!;
    const slide = p.deck.slides[0];
    expect(p.deck.version).toBe(2);
    expect(slide.story).toBe('once');
    expect(slide.elements.map((e) => (e as TextElement).text)).toEqual(['Hello', 'a\nb']);
  });

  it('drops broken elements and repairs fields', () => {
    const p = normalizeProject({
      deck: { slides: [{ elements: [{ type: 'text', text: 'ok', size: 'big', color: 'url(evil)' }, { type: 'image', src: 'javascript:alert(1)' }, { type: 'blob' }] }] },
    })!;
    const els = p.deck.slides[0].elements as TextElement[];
    expect(els).toHaveLength(1);
    expect(els[0].size).toBe(40);
    expect(els[0].color).toBe('ink');
  });
});
