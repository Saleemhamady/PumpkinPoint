// The AI layer: Claude writes slides, finds the story behind them, and compiles each
// scene into a visual plan. Every call uses structured outputs, and every result is
// validated again before it reaches the editor.

import Anthropic from '@anthropic-ai/sdk';
import { MOTIFS, MOTIF_IDS } from '../src/shared/motifs.ts';
import { offlinePlan, sanitizePlan } from '../src/shared/plan.ts';
import {
  KINETIC_MOTIONS, LAYOUTS, MOODS, MOTIONS, SETTINGS,
  type Layout, type ScenePlan, type SlideContent,
} from '../src/shared/types.ts';

export const DEFAULT_MODEL = 'claude-opus-5-5';

type Effort = 'low' | 'medium' | 'high';

export interface AiConfig {
  apiKey?: string;
  model?: string;
}

const str = { type: 'string' } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const arr = (items: unknown) => ({ type: 'array', items });

const SLIDE_SCHEMA = obj({ layout: { type: 'string', enum: LAYOUTS }, title: str, subtitle: str, bullets: arr(str) });

const PLAN_SCHEMA = obj({
  mood: { type: 'string', enum: MOODS },
  setting: { type: 'string', enum: SETTINGS },
  motifs: arr(obj({ motif: { type: 'string', enum: MOTIF_IDS }, role: { type: 'string', enum: ['hero', 'support'] }, motion: { type: 'string', enum: MOTIONS } })),
  narration: str,
  kinetic: arr(obj({ text: str, emphasis: str, motion: { type: 'string', enum: KINETIC_MOTIONS } })),
});

const MOTIF_CATALOG = MOTIFS.map((m) => `- ${m.id}: ${m.label} (${m.place === 'sky' ? 'floats in the sky' : 'stands on the ground'})`).join('\n');

const LAYOUT_GUIDE = `Slide layouts:
- title: a title with a subtitle (opening slides, section starts)
- bullets: a short title with 2-5 concise bullets
- statement: one strong sentence as the title, optional attribution as subtitle, no bullets
- stat: a number as the title (e.g. "42%", "$3M", "10x"), what it measures as the subtitle`;

function describeSlides(slides: SlideContent[]): string {
  return slides
    .map((s, i) => {
      const lines = [`Slide ${i + 1} (${s.layout}): ${s.title || '(untitled)'}`];
      if (s.subtitle) lines.push(`  subtitle: ${s.subtitle}`);
      for (const b of s.bullets) if (b.trim()) lines.push(`  - ${b}`);
      return lines.join('\n');
    })
    .join('\n');
}

function cleanSlide(raw: unknown): SlideContent {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const layout = (LAYOUTS as string[]).includes(r.layout as string) ? (r.layout as Layout) : 'bullets';
  const bullets = Array.isArray(r.bullets) ? r.bullets.map((b) => text(b, 160)).filter(Boolean).slice(0, 6) : [];
  return { layout, title: text(r.title, 120), subtitle: text(r.subtitle, 200), bullets };
}

export class PumpkinAI {
  private client: Anthropic;
  readonly model: string;
  readonly available: boolean;

  constructor(config: AiConfig = {}) {
    this.client = new Anthropic(config.apiKey ? { apiKey: config.apiKey } : {});
    this.model = config.model || DEFAULT_MODEL;
    this.available = Boolean(config.apiKey || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
  }

  private async json(system: string, user: string, schema: object, effort: Effort): Promise<unknown> {
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      // If a safety classifier declines, the API retries on a suitable fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort, format: { type: 'json_schema', schema: schema as Record<string, unknown> } },
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (response.stop_reason === 'refusal') throw new Error('The model declined this request.');
    if (response.stop_reason === 'max_tokens') throw new Error('The response was cut off before it finished.');
    const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('The model returned malformed JSON.');
    }
  }

  /** Layer 1: draft a whole deck from a topic. */
  async generateSlides(topic: string, count: number, audience: string): Promise<{ title: string; slides: SlideContent[] }> {
    const n = Math.max(2, Math.min(15, Math.round(count) || 6));
    const system = `You write presentation slides that are clear, concrete and short. ${LAYOUT_GUIDE}
Open with a title slide. Bullets are phrases, not paragraphs (under 10 words each). Vary the layouts where it helps the talk.`;
    const user = `Write a ${n}-slide presentation.\nTopic: ${topic}${audience ? `\nAudience: ${audience}` : ''}`;
    const raw = (await this.json(system, user, obj({ title: str, slides: arr(SLIDE_SCHEMA) }), 'medium')) as { title?: unknown; slides?: unknown };
    const slides = Array.isArray(raw.slides) ? raw.slides.map(cleanSlide).filter((s) => s.title) : [];
    if (!slides.length) throw new Error('No slides came back.');
    return { title: typeof raw.title === 'string' ? raw.title.slice(0, 120) : topic.slice(0, 120), slides };
  }

  /** Layer 1: tidy one slide (shorter wording, better layout) without changing its meaning. */
  async polishSlide(slide: SlideContent, context: SlideContent[]): Promise<SlideContent> {
    const system = `You are a presentation editor. Improve one slide so it reads well at a glance: tighten wording, split or merge bullets, fix grammar, and pick the layout that suits the content. Keep the author's meaning and facts; never invent numbers or claims. ${LAYOUT_GUIDE}`;
    const user = `The deck:\n${describeSlides(context)}\n\nImprove this slide:\n${describeSlides([slide])}`;
    return cleanSlide(await this.json(system, user, SLIDE_SCHEMA, 'medium'));
  }

  /** Layer 2: find one story that runs underneath the whole deck. */
  async writeStories(title: string, slides: SlideContent[], existing: string[], only: number | null): Promise<string[]> {
    const system = `You turn presentations into visual stories for an animation engine. The animation does not show the slide's words; it tells the story behind them with images: a world, characters and objects that change from slide to slide.

Choose ONE visual metaphor for the whole deck (for example a voyage at sea, a seed growing into a forest, a climb to a summit, a rocket leaving the ground) and follow it across the slides as an arc: setup, tension, turning point, resolution. For each slide write one or two short sentences describing what happens in that world while the slide is on screen. Be concrete and visual, present tense, no jargon, and do not repeat the slide's text.

The engine can draw these things, so lean on them:
${MOTIF_CATALOG}
Settings it can draw: sea, land, city, sky, space.`;
    let user = `Presentation: ${title || '(untitled)'}\n\n${describeSlides(slides)}`;
    if (only !== null) {
      const others = existing.map((s, i) => `Slide ${i + 1}: ${s || '(empty)'}`).join('\n');
      user += `\n\nThe current story, slide by slide:\n${others}\n\nRewrite only slide ${only + 1}'s story so it fits the slide and stays consistent with the rest. Return the full list with the other slides unchanged.`;
    }
    const raw = (await this.json(system, user, obj({ metaphor: str, stories: arr(str) }), 'medium')) as { stories?: unknown };
    const stories = Array.isArray(raw.stories) ? raw.stories.map((s) => (typeof s === 'string' ? s.trim() : '')) : [];
    if (stories.length !== slides.length) throw new Error(`Expected ${slides.length} stories, got ${stories.length}.`);
    return stories;
  }

  /** Compile one scene: decide what the animation shows while this slide is up. */
  async compileScene(slide: SlideContent, story: string, index: number, total: number): Promise<ScenePlan> {
    const system = `You are the motion-graphics director of a presentation engine. For one scene you decide what the animation shows. The same plan is rendered in four styles (origami paper, pop-up book, whiteboard sketch, kinetic typography), so describe the scene, not the technique.

Motifs you can use (pick 1-3, exactly one hero; the hero is the main image of the story beat):
${MOTIF_CATALOG}

- setting: where the scene takes place.
- mood: the emotional beat. The background colour follows the mood, so moods should change as the story turns.
- motion: how each motif moves once it has appeared.
- narration: one short storybook sentence for this beat (under 20 words).
- kinetic: 2-4 punchy lines (under 7 words each) that retell the story beat for kinetic typography; emphasis is one word taken from its line.`;
    const user = `Scene ${index + 1} of ${total}.\nThe story during this slide: ${story || '(none written: infer a fitting image from the slide)'}\n\nThe slide:\n${describeSlides([slide])}`;
    const raw = await this.json(system, user, PLAN_SCHEMA, 'low');
    return sanitizePlan(raw, offlinePlan(slide, story, index, total));
  }
}
