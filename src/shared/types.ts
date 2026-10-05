// Core data model shared by the editor, the compiler, the AI server and the runtime player.

/** The four animation styles a deck can be presented in. */
export type StyleId = 'origami' | 'book' | 'whiteboard' | 'kinetic';

export const STYLE_IDS: StyleId[] = ['origami', 'book', 'whiteboard', 'kinetic'];

/** Starting arrangements for a slide's text (templates; slides are free-form after that). */
export type Layout = 'title' | 'bullets' | 'statement' | 'stat';

export const LAYOUTS: Layout[] = ['title', 'bullets', 'statement', 'stat'];

/** Structured text, as the AI writes it and as templates consume it. */
export interface SlideContent {
  layout: Layout;
  title: string;
  /** Subtitle for title slides, label for stat slides, optional line otherwise. */
  subtitle: string;
  bullets: string[];
}

// ---- Slide elements: what a slide is made of (Layer 1) --------------------------

/** Slides are drawn on a 1600x900 canvas, the same size as the presentation stage. */
export const CANVAS_W = 1600;
export const CANVAS_H = 900;

/** Typefaces available to text. 'auto' uses the animation style's own typeface. */
export type FontKey = 'sans' | 'serif' | 'hand' | 'display';
export const FONT_KEYS: FontKey[] = ['sans', 'serif', 'hand', 'display'];

/** What a piece of text is for; used by the AI and by the animations (titles enter differently). */
export type TextRole = 'title' | 'subtitle' | 'body' | 'stat';
export const TEXT_ROLES: TextRole[] = ['title', 'subtitle', 'body', 'stat'];

/**
 * Colours are either a hex value or a theme token. Tokens follow the animation style
 * and the scene's mood, so text stays readable when the background changes.
 */
export type ColorToken = 'ink' | 'accent' | 'muted' | 'paper' | 'none';
export const COLOR_TOKENS: ColorToken[] = ['ink', 'accent', 'muted', 'paper', 'none'];

export type ShapeKind = 'rect' | 'round' | 'ellipse' | 'triangle' | 'diamond' | 'star' | 'arrow' | 'line';
export const SHAPE_KINDS: ShapeKind[] = ['rect', 'round', 'ellipse', 'triangle', 'diamond', 'star', 'arrow', 'line'];

interface ElementBase {
  id: string;
  /** Position and size on the 1600x900 canvas. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise, around the centre. */
  rotation: number;
}

export interface TextElement extends ElementBase {
  type: 'text';
  role: TextRole;
  text: string;
  font: FontKey | 'auto';
  /** Font size in canvas pixels. */
  size: number;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  color: string;
  /** Show each line as a bullet. */
  list: boolean;
}

export interface ShapeElement extends ElementBase {
  type: 'shape';
  shape: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface ImageElement extends ElementBase {
  type: 'image';
  /** A data: URL, so projects and exports stay self-contained. */
  src: string;
  fit: 'cover' | 'contain';
  radius: number;
  /** Describes the picture to the AI (and to screen readers). */
  alt: string;
}

export type SlideElement = TextElement | ShapeElement | ImageElement;

/** A slide in the editor: its elements (Layer 1) plus its story (Layer 2). */
export interface Slide {
  id: string;
  /** Back to front. */
  elements: SlideElement[];
  /** The story told while this slide is on screen (Layer 2 script). */
  story: string;
}

export interface Deck {
  version: 2;
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
  elements: SlideElement[];
  plan: ScenePlan;
}

export interface RuntimeData {
  title: string;
  style: StyleId;
  scenes: RuntimeScene[];
}
