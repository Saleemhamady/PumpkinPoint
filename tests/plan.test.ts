import { describe, expect, it } from 'vitest';
import { MOTIFS, getMotif, layoutMotifs, SETTING_LAYERS } from '../src/shared/motifs.ts';
import { kineticLines, offlinePlan, offlinePolish, offlineStories, sanitizePlan } from '../src/shared/plan.ts';
import { sampleDeck } from '../src/shared/sample.ts';
import { MOODS, SETTINGS, type ScenePlan } from '../src/shared/types.ts';

const fallback: ScenePlan = {
  mood: 'neutral',
  setting: 'land',
  motifs: [{ motif: 'tree', role: 'hero', motion: 'sway' }],
  narration: 'fallback narration',
  kinetic: [{ text: 'fallback line', emphasis: 'line', motion: 'rise' }],
};

describe('sanitizePlan', () => {
  it('keeps a valid plan', () => {
    const raw = {
      mood: 'tense',
      setting: 'sea',
      motifs: [{ motif: 'storm', role: 'hero', motion: 'sway' }, { motif: 'sailboat', role: 'support', motion: 'float' }],
      narration: 'A storm rolls in.',
      kinetic: [{ text: 'The storm arrives', emphasis: 'storm', motion: 'slam' }],
    };
    expect(sanitizePlan(raw, fallback)).toEqual(raw);
  });

  it('repairs invalid values instead of failing', () => {
    const out = sanitizePlan(
      {
        mood: 'furious',
        setting: 'mars',
        motifs: [{ motif: 'dragon', role: 'hero' }, { motif: 'sun', role: 'support', motion: 'teleport' }, { motif: 'sun', role: 'hero' }],
        kinetic: [{ text: 'Light returns at last', emphasis: 'nope', motion: 'warp' }, { text: '' }],
      },
      fallback,
    );
    expect(out.mood).toBe('neutral');
    expect(out.setting).toBe('land');
    expect(out.motifs).toEqual([{ motif: 'sun', role: 'hero', motion: 'spin' }]);
    expect(out.narration).toBe('fallback narration');
    expect(out.kinetic).toHaveLength(1);
    expect(out.kinetic[0].emphasis).toBe('returns');
    expect(out.kinetic[0].motion).toBe('rise');
  });

  it('enforces exactly one hero and at most three motifs', () => {
    const out = sanitizePlan(
      { motifs: ['star', 'heart', 'key', 'globe'].map((motif) => ({ motif, role: 'hero', motion: 'none' })) },
      fallback,
    );
    expect(out.motifs).toHaveLength(3);
    expect(out.motifs.filter((m) => m.role === 'hero')).toHaveLength(1);
  });

  it('falls back entirely on garbage', () => {
    expect(sanitizePlan('nonsense', fallback)).toEqual(fallback);
  });
});

describe('offline planner', () => {
  it('picks motifs, setting and mood from the story', () => {
    const plan = offlinePlan({ layout: 'bullets', title: 'Problem', subtitle: '', bullets: [] }, 'A storm rolls in over the sea and the boat is lost.', 1, 5);
    expect(plan.motifs[0].motif).toBe('storm');
    expect(plan.motifs.map((m) => m.motif)).toContain('sailboat');
    expect(plan.setting).toBe('sea');
    expect(plan.mood).toBe('tense');
  });

  it('always returns a usable plan, even for empty slides', () => {
    for (const [i, total] of [[0, 1], [0, 3], [1, 3], [2, 3]]) {
      const plan = offlinePlan({ layout: 'title', title: '', subtitle: '', bullets: [] }, '', i, total);
      expect(plan.motifs.length).toBeGreaterThan(0);
      expect(MOODS).toContain(plan.mood);
      expect(SETTINGS).toContain(plan.setting);
    }
  });

  it('splits stories into short kinetic lines', () => {
    const lines = kineticLines('Fast now, the wind fills the sails and the boat speeds toward the light.', 'Title', ['boat']);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeLessThanOrEqual(3);
    for (const l of lines) {
      expect(l.text.split(' ').length).toBeLessThanOrEqual(6);
      expect(l.text.toLowerCase()).toContain(l.emphasis.toLowerCase());
    }
  });

  it('writes one story per slide', () => {
    const deck = sampleDeck();
    const stories = offlineStories(deck.slides);
    expect(stories).toHaveLength(deck.slides.length);
    expect(stories.every((s) => s.length > 10)).toBe(true);
  });

  it('tidies slides', () => {
    const out = offlinePolish({ layout: 'bullets', title: 'growth', subtitle: '', bullets: ['- more users.', '', '  faster '] });
    expect(out.title).toBe('Growth');
    expect(out.bullets).toEqual(['More users', 'Faster']);
    expect(offlinePolish({ layout: 'bullets', title: '42%', subtitle: 'retention', bullets: [] }).layout).toBe('stat');
  });
});

describe('motif library', () => {
  it('has unique ids and well-formed polygons inside the box', () => {
    const ids = new Set<string>();
    for (const m of MOTIFS) {
      expect(ids.has(m.id)).toBe(false);
      ids.add(m.id);
      expect(m.polys.some((p) => p.f !== false)).toBe(true);
      for (const p of m.polys) {
        expect(p.p.length % 2).toBe(0);
        expect(p.p.length).toBeGreaterThanOrEqual(4);
        for (const v of p.p) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(-2);
          expect(v).toBeLessThanOrEqual(102);
        }
      }
    }
    expect(getMotif('sailboat')?.place).toBe('ground');
  });

  it('settings stay inside their 200x100 box', () => {
    for (const layers of Object.values(SETTING_LAYERS)) {
      for (const l of layers) for (const p of l.polys) for (let i = 0; i < p.p.length; i += 2) {
        expect(p.p[i]).toBeGreaterThanOrEqual(-1);
        expect(p.p[i]).toBeLessThanOrEqual(201);
        expect(p.p[i + 1]).toBeGreaterThanOrEqual(-1);
        expect(p.p[i + 1]).toBeLessThanOrEqual(101);
      }
    }
  });

  it('lays out a hero and up to two supports inside the region', () => {
    const placed = layoutMotifs(
      [
        { motif: 'lighthouse', role: 'hero', motion: 'none' },
        { motif: 'sun', role: 'support', motion: 'spin' },
        { motif: 'sailboat', role: 'support', motion: 'float' },
        { motif: 'star', role: 'support', motion: 'pulse' },
      ],
      800, 600, 'sea',
    );
    expect(placed).toHaveLength(3);
    expect(placed[0].role).toBe('hero');
    expect(placed[0].size).toBeGreaterThan(placed[1].size);
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.size).toBeLessThanOrEqual(800);
      expect(p.y + p.size).toBeLessThanOrEqual(600);
    }
  });
});
