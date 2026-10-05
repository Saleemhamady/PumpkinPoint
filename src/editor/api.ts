// Client for the AI endpoints, with offline fallbacks so the editor always works.

import { slideSummary } from '../shared/elements.ts';
import { offlinePlan, offlinePolish, offlineStories, type PolishText } from '../shared/plan.ts';
import type { ScenePlan, Slide, SlideContent, SlideElement, TextElement } from '../shared/types.ts';

export interface AiStatus {
  ai: boolean;
  model: string;
}

export async function fetchStatus(): Promise<AiStatus> {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error();
    return (await res.json()) as AiStatus;
  } catch {
    return { ai: false, model: '' };
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

/** Elements without picture data (the AI only needs their descriptions). */
const lean = (els: SlideElement[]) => els.map((e) => (e.type === 'image' ? { ...e, src: '' } : e));

export async function generateSlides(topic: string, count: number, audience: string): Promise<{ title: string; slides: SlideContent[] }> {
  return post('/slides', { topic, count, audience });
}

/** Better wording for a slide's texts, by element id. */
export async function polishSlide(ai: boolean, slide: Slide, all: Slide[]): Promise<{ id: string; text: string }[]> {
  const texts: PolishText[] = slide.elements
    .filter((e): e is TextElement => e.type === 'text' && e.text.trim() !== '')
    .map((t) => ({ id: t.id, role: t.role, text: t.text, list: t.list }));
  if (!texts.length) return [];
  if (!ai) return offlinePolish(texts);
  const res = await post<{ texts: { id: string; text: string }[] }>('/polish', { texts, context: all.map((s) => slideSummary(s.elements)) });
  return res.texts;
}

/** Stories for every slide, or (with `only`) a rewrite of one slide's story. */
export async function writeStories(ai: boolean, title: string, slides: Slide[], only: number | null): Promise<string[]> {
  if (!ai) return offlineStories(slides.map((s) => s.elements));
  const res = await post<{ stories: string[] }>('/stories', {
    title,
    slides: slides.map((s) => slideSummary(s.elements)),
    existing: slides.map((s) => s.story),
    only,
  });
  return res.stories;
}

export async function compileScene(ai: boolean, slide: Slide, index: number, total: number): Promise<ScenePlan> {
  if (!ai) return offlinePlan(slide.elements, slide.story, index, total);
  return post('/scene', { elements: lean(slide.elements), story: slide.story, index, total });
}
