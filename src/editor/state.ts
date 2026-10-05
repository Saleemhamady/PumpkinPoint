// Editor state: the project (deck + build cache) with undo/redo.

import { sceneKey } from '../shared/compiler.ts';
import { layoutElements, newText, normalizeElement, uid } from '../shared/elements.ts';
import { newSlide, sampleDeck } from '../shared/sample.ts';
import {
  LAYOUTS, STYLE_IDS,
  type BuildCache, type Deck, type Layout, type Project, type Slide, type SlideElement,
} from '../shared/types.ts';

export interface EditorState {
  project: Project;
  past: Deck[];
  future: Deck[];
  lastEdit: { key: string; at: number } | null;
}

/**
 * How an edit enters the undo history: 'push' is its own step, 'coalesce' merges with
 * the previous edit of the same key (typing, nudging), 'none' records nothing (the
 * moves of a drag, after a 'checkpoint' at the start of the gesture).
 */
export type History = 'push' | 'coalesce' | 'none';

export type Action =
  | { type: 'load'; project: Project }
  | { type: 'set-deck'; deck: Deck }
  | { type: 'set-title'; title: string }
  | { type: 'set-style'; style: Deck['style'] }
  | { type: 'update-slide'; id: string; patch: Partial<Slide> }
  | { type: 'set-elements'; id: string; elements: SlideElement[]; history: History; key?: string }
  | { type: 'checkpoint' }
  | { type: 'add-slide'; after: number; layout: Layout | 'blank' }
  | { type: 'remove-slide'; id: string }
  | { type: 'duplicate-slide'; id: string }
  | { type: 'move-slide'; id: string; dir: -1 | 1 }
  | { type: 'merge-cache'; cache: BuildCache }
  | { type: 'undo' }
  | { type: 'redo' };

const HISTORY = 80;

function withDeck(state: EditorState, deck: Deck, history: History = 'push', editKey?: string): EditorState {
  const now = Date.now();
  if (history === 'none') return { ...state, project: { ...state.project, deck }, future: [] };
  // Edits with the same key in quick succession are one undo step.
  const coalesce = history === 'coalesce' && editKey && state.lastEdit && state.lastEdit.key === editKey && now - state.lastEdit.at < 1500;
  return {
    project: { ...state.project, deck },
    past: coalesce ? state.past : [...state.past, state.project.deck].slice(-HISTORY),
    future: [],
    lastEdit: editKey ? { key: editKey, at: now } : null,
  };
}

function mapSlides(deck: Deck, fn: (slides: Slide[]) => Slide[]): Deck {
  return { ...deck, slides: fn(deck.slides) };
}

const cloneElements = (els: SlideElement[]) => els.map((e) => ({ ...e, id: uid() }));

export function reducer(state: EditorState, action: Action): EditorState {
  const deck = state.project.deck;
  switch (action.type) {
    case 'load':
      return { project: action.project, past: [], future: [], lastEdit: null };
    case 'set-deck':
      return withDeck(state, action.deck);
    case 'set-title':
      return withDeck(state, { ...deck, title: action.title }, 'coalesce', 'title');
    case 'set-style':
      return withDeck(state, { ...deck, style: action.style });
    case 'update-slide': {
      const key = `${action.id}:${Object.keys(action.patch).join(',')}`;
      return withDeck(state, mapSlides(deck, (ss) => ss.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s))), 'coalesce', key);
    }
    case 'set-elements':
      return withDeck(
        state,
        mapSlides(deck, (ss) => ss.map((s) => (s.id === action.id ? { ...s, elements: action.elements } : s))),
        action.history,
        action.key,
      );
    case 'checkpoint':
      return { ...state, past: [...state.past, deck].slice(-HISTORY), future: [], lastEdit: null };
    case 'add-slide': {
      const slide = action.layout === 'blank' ? { id: uid('s'), elements: [], story: '' } : newSlide(action.layout);
      return withDeck(state, mapSlides(deck, (ss) => [...ss.slice(0, action.after + 1), slide, ...ss.slice(action.after + 1)]));
    }
    case 'remove-slide':
      return withDeck(state, mapSlides(deck, (ss) => ss.filter((s) => s.id !== action.id)));
    case 'duplicate-slide':
      return withDeck(state, mapSlides(deck, (ss) => ss.flatMap((s) => (s.id === action.id ? [s, { ...s, id: uid('s'), elements: cloneElements(s.elements) }] : [s]))));
    case 'move-slide':
      return withDeck(state, mapSlides(deck, (ss) => {
        const i = ss.findIndex((s) => s.id === action.id);
        const j = i + action.dir;
        if (i < 0 || j < 0 || j >= ss.length) return ss;
        const next = [...ss];
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      }));
    case 'merge-cache': {
      // Keep only scenes the current deck can still use (with or without AI).
      const keep = new Set(deck.slides.flatMap((s) => [sceneKey(s, 'ai'), sceneKey(s, 'offline')]));
      const merged = { ...state.project.cache, ...action.cache };
      const cache = Object.fromEntries(Object.entries(merged).filter(([k]) => keep.has(k)));
      return { ...state, project: { ...state.project, cache } };
    }
    case 'undo': {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return { project: { ...state.project, deck: prev }, past: state.past.slice(0, -1), future: [deck, ...state.future], lastEdit: null };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return { project: { ...state.project, deck: next }, past: [...state.past, deck], future: state.future.slice(1), lastEdit: null };
    }
  }
}

const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** Read one slide from storage or a file. Version-1 slides (title/bullets fields) are laid out with templates. */
function normalizeSlide(raw: Record<string, unknown>): Slide {
  const story = text(raw.story);
  if (Array.isArray(raw.elements)) {
    return { id: text(raw.id) || uid('s'), elements: raw.elements.map(normalizeElement).filter((e): e is SlideElement => !!e), story };
  }
  const layout = LAYOUTS.includes(raw.layout as Layout) ? (raw.layout as Layout) : 'bullets';
  const content = {
    layout,
    title: text(raw.title),
    subtitle: text(raw.subtitle),
    bullets: Array.isArray(raw.bullets) ? raw.bullets.map(text) : [],
  };
  const elements = content.title || content.subtitle || content.bullets.length ? layoutElements(content) : [newText()];
  return { id: text(raw.id) || uid('s'), elements, story };
}

/** Accept a project (or a bare deck) from storage or a file, repairing what it can. */
export function normalizeProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const d = (r.deck ?? r) as Record<string, unknown>;
  if (!Array.isArray(d.slides)) return null;
  const deck: Deck = {
    version: 2,
    title: text(d.title),
    style: STYLE_IDS.includes(d.style as Deck['style']) ? (d.style as Deck['style']) : 'origami',
    slides: d.slides.filter((s) => s && typeof s === 'object').map((s) => normalizeSlide(s as Record<string, unknown>)),
  };
  const cache = r.cache && typeof r.cache === 'object' ? (r.cache as BuildCache) : {};
  return { deck, cache };
}

export function initialState(project: Project | null): EditorState {
  return { project: project ?? { deck: sampleDeck(), cache: {} }, past: [], future: [], lastEdit: null };
}
