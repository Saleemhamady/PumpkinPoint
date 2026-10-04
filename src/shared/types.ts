// Core data model shared by the editor, the compiler, the AI server and the runtime player.

/** The four animation styles a deck can be presented in. */
export type StyleId = 'origami' | 'book' | 'whiteboard' | 'kinetic';

export const STYLE_IDS: StyleId[] = ['origami', 'book', 'whiteboard', 'kinetic'];

/** How a slide's content is arranged (Layer 1). */
export type Layout = 'title' | 'bullets' | 'statement' | 'stat';

export const LAYOUTS: Layout[] = ['title', 'bullets', 'statement', 'stat'];

/** Layer 1 content of one slide. */
export interface SlideContent {
  layout: Layout;
  title: string;
  /** Subtitle for title slides, label for stat slides, optional line otherwise. */
  subtitle: string;
  bullets: string[];
}

/** A slide in the editor: its Layer 1 content plus its Layer 2 story. */
export interface Slide extends SlideContent {
  id: string;
  /** The story told while this slide is on screen (Layer 2 script). */
  story: string;
}

export interface Deck {
  version: 1;
  title: string;
  style: StyleId;
  slides: Slide[];
}

// ---- Scene plans: what the compiler produces for each slide -------------------

/** Emotional tone of a scene. Drives the background colours, so the backdrop tells the story. */
export type Mood = 'neutral' | 'calm' | 'tense' | 'hopeful' | 'triumphant' | 'mysterious' | 'energetic';

export const MOODS: Mood[] = ['neutral', 'calm', 'tense', 'hopeful', 'triumphant', 'mysterious', 'energetic'];

/** The world the scene takes place in, drawn behind the motifs. */
export type Setting = 'none' | 'sea' | 'land' | 'city' | 'sky' | 'space';

export const SETTINGS: Setting[] = ['none', 'sea', 'land', 'city', 'sky', 'space'];

/** Idle motion applied to a motif once it has appeared. */
export type Motion = 'none' | 'float' | 'drift' | 'rise' | 'sway' | 'pulse' | 'spin' | 'grow';

export const MOTIONS: Motion[] = ['none', 'float', 'drift', 'rise', 'sway', 'pulse', 'spin', 'grow'];

/** Entrance used for one line of kinetic typography. */
export type KineticMotion = 'rise' | 'slam' | 'slide' | 'drop' | 'zoom';

export const KINETIC_MOTIONS: KineticMotion[] = ['rise', 'slam', 'slide', 'drop', 'zoom'];

export interface PlanMotif {
  /** Id from the motif library (see motifs.ts). */
  motif: string;
  role: 'hero' | 'support';
  motion: Motion;
}

export interface KineticLine {
  text: string;
  /** Word (or short phrase) from `text` to emphasise. */
  emphasis: string;
  motion: KineticMotion;
}

/**
 * The compiled, style-independent visual plan for one scene. Every style renders
 * from the same plan, so switching styles never needs a recompile.
 */
export interface ScenePlan {
  mood: Mood;
  setting: Setting;
  motifs: PlanMotif[];
  /** One short storybook sentence (shown by the book and whiteboard styles). */
  narration: string;
  /** Two to four short lines for kinetic typography. */
  kinetic: KineticLine[];
}

export type Planner = 'ai' | 'offline';

/** One compiled scene in the build cache, keyed by the hash of its inputs. */
export interface CacheEntry {
  key: string;
  planner: Planner;
  plan: ScenePlan;
  builtAt: number;
}

export type BuildCache = Record<string, CacheEntry>;

/** What the editor saves: the deck plus the compiled scenes. */
export interface Project {
  deck: Deck;
  cache: BuildCache;
}

/** Data embedded in the exported HTML and read by the runtime player. */
export interface RuntimeScene {
  slide: SlideContent;
  plan: ScenePlan;
}

export interface RuntimeData {
  title: string;
  style: StyleId;
  scenes: RuntimeScene[];
}
