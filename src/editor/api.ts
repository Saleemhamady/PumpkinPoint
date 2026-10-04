// Client for the AI endpoints, with offline fallbacks so the editor always works.

import { offlinePlan, offlinePolish, offlineStories } from '../shared/plan.ts';
import type { ScenePlan, Slide, SlideContent } from '../shared/types.ts';

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

export const content = (s: Slide): SlideContent => ({ layout: s.layout, title: s.title, subtitle: s.subtitle, bullets: s.bullets.filter((b) => b.trim()) });

export async function generateSlides(topic: string, count: number, audience: string): Promise<{ title: string; slides: SlideContent[] }> {
  return post('/slides', { topic, count, audience });
}

export async function polishSlide(ai: boolean, slide: Slide, all: Slide[]): Promise<SlideContent> {
  if (!ai) return offlinePolish(content(slide));
  return post('/polish', { slide: content(slide), context: all.map(content) });
}

/** Stories for every slide, or (with `only`) a rewrite of one slide's story. */
export async function writeStories(ai: boolean, title: string, slides: Slide[], only: number | null): Promise<string[]> {
  if (!ai) return offlineStories(slides.map(content));
  const res = await post<{ stories: string[] }>('/stories', {
    title,
    slides: slides.map(content),
    existing: slides.map((s) => s.story),
    only,
  });
  return res.stories;
}

export async function compileScene(ai: boolean, slide: Slide, index: number, total: number): Promise<ScenePlan> {
  if (!ai) return offlinePlan(content(slide), slide.story, index, total);
  return post('/scene', { slide: content(slide), story: slide.story, index, total });
}
