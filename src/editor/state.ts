// Editor state: the project (deck + build cache) with undo/redo and local persistence.

import { sceneKey } from '../shared/compiler.ts';
import { blankSlide, sampleDeck } from '../shared/sample.ts';
import { LAYOUTS, STYLE_IDS, type BuildCache, type Deck, type Project, type Slide } from '../shared/types.ts';

export interface EditorState {
  project: Project;
  past: Deck[];
  future: Deck[];
  lastEdit: { key: string; at: number } | null;
}

export type Action =
  | { type: 'load'; project: Project }
  | { type: 'set-deck'; deck: Deck }
  | { type: 'set-title'; title: string }
  | { type: 'set-style'; style: Deck['style'] }
  | { type: 'update-slide'; id: string; patch: Partial<Slide> }
  | { type: 'add-slide'; after: number }
  | { type: 'remove-slide'; id: string }
  | { type: 'duplicate-slide'; id: string }
  | { type: 'move-slide'; id: string; dir: -1 | 1 }
  | { type: 'merge-cache'; cache: BuildCache }
  | { type: 'undo' }
  | { type: 'redo' };

const HISTORY = 60;
const STORAGE_KEY = 'pumpkinpoint:project';

function withDeck(state: EditorState, deck: Deck, editKey?: string): EditorState {
  const now = Date.now();
  // Typing in the same field within a short window is one undo step.
  const coalesce = editKey && state.lastEdit && state.lastEdit.key === editKey && now - state.lastEdit.at < 1500;
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

export function reducer(state: EditorState, action: Action): EditorState {
  const deck = state.project.deck;
  switch (action.type) {
    case 'load':
      return { project: action.project, past: [], future: [], lastEdit: null };
    case 'set-deck':
      return withDeck(state, action.deck);
    case 'set-title':
      return withDeck(state, { ...deck, title: action.title }, 'title');
    case 'set-style':
      return withDeck(state, { ...deck, style: action.style });
    case 'update-slide': {
      const key = `${action.id}:${Object.keys(action.patch).join(',')}`;
      return withDeck(state, mapSlides(deck, (ss) => ss.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s))), key);
    }
    case 'add-slide':
      return withDeck(state, mapSlides(deck, (ss) => [...ss.slice(0, action.after + 1), blankSlide(), ...ss.slice(action.after + 1)]));
    case 'remove-slide':
      return withDeck(state, mapSlides(deck, (ss) => ss.filter((s) => s.id !== action.id)));
    case 'duplicate-slide':
      return withDeck(state, mapSlides(deck, (ss) => ss.flatMap((s) => (s.id === action.id ? [s, blankSlide({ ...s, id: undefined })] : [s]))));
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

/** Accept a project (or a bare deck) from storage or a file, repairing what it can. */
export function normalizeProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const d = (r.deck ?? r) as Record<string, unknown>;
  if (!Array.isArray(d.slides)) return null;
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  const slides: Slide[] = d.slides.map((s: Record<string, unknown>) =>
    blankSlide({
      layout: LAYOUTS.includes(s.layout as Slide['layout']) ? (s.layout as Slide['layout']) : 'bullets',
      title: text(s.title),
      subtitle: text(s.subtitle),
      bullets: Array.isArray(s.bullets) ? s.bullets.map(text) : [],
      story: text(s.story),
    }),
  );
  const deck: Deck = {
    version: 1,
    title: text(d.title),
    style: STYLE_IDS.includes(d.style as Deck['style']) ? (d.style as Deck['style']) : 'origami',
    slides,
  };
  const cache = r.cache && typeof r.cache === 'object' ? (r.cache as BuildCache) : {};
  return { deck, cache };
}

export function loadInitial(): EditorState {
  let project: Project | null = null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) project = normalizeProject(JSON.parse(saved));
  } catch {
    project = null;
  }
  return { project: project ?? { deck: sampleDeck(), cache: {} }, past: [], future: [], lastEdit: null };
}

export function persist(project: Project): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    /* storage full or blocked: the session still works */
  }
}
