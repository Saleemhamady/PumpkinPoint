// Slide elements: creation, layout templates, validation, and finding the empty part
// of a slide where the story illustration can live.

import {
  CANVAS_H, CANVAS_W, COLOR_TOKENS, FONT_KEYS, SHAPE_KINDS, TEXT_ROLES,
  type ImageElement, type Layout, type ShapeElement, type ShapeKind, type SlideContent,
  type SlideElement, type TextElement, type TextRole,
} from './types.ts';

let counter = 0;
export function uid(prefix = 'e'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ---- creation ------------------------------------------------------------------------

export function newText(partial: Partial<TextElement> = {}): TextElement {
  return {
    id: uid(), type: 'text', x: 500, y: 380, w: 600, h: 120, rotation: 0,
    role: 'body', text: 'New text', font: 'auto', size: 40, bold: false, italic: false,
    align: 'left', valign: 'top', color: 'ink', list: false,
    ...partial,
  };
}

export function newShape(shape: ShapeKind, partial: Partial<ShapeElement> = {}): ShapeElement {
  const line = shape === 'line' || shape === 'arrow';
  return {
    id: uid(), type: 'shape', shape, x: 650, y: line ? 410 : 300, w: 300, h: line ? 80 : 300, rotation: 0,
    fill: shape === 'line' ? 'none' : 'accent', stroke: shape === 'line' ? 'ink' : 'none', strokeWidth: shape === 'line' ? 6 : 4,
    ...partial,
  };
}

export function newImage(src: string, naturalW: number, naturalH: number, partial: Partial<ImageElement> = {}): ImageElement {
  const k = Math.min(1, 640 / naturalW, 480 / naturalH);
  const w = Math.max(40, Math.round(naturalW * k));
  const h = Math.max(40, Math.round(naturalH * k));
  return {
    id: uid(), type: 'image', src, x: Math.round((CANVAS_W - w) / 2), y: Math.round((CANVAS_H - h) / 2), w, h, rotation: 0,
    fit: 'cover', radius: 12, alt: '',
    ...partial,
  };
}

// ---- layout templates ----------------------------------------------------------------------

type Box = { x: number; y: number; w: number; h: number };

const TEMPLATES: Record<Layout, Partial<Record<TextRole, Box & { size: number; align: TextElement['align']; valign?: TextElement['valign'] }>>> = {
  // Text high and centred; the story fills the lower half.
  title: {
    title: { x: 160, y: 150, w: 1280, h: 190, size: 104, align: 'center', valign: 'bottom' },
    subtitle: { x: 260, y: 352, w: 1080, h: 70, size: 40, align: 'center' },
    body: { x: 420, y: 440, w: 760, h: 150, size: 32, align: 'left' },
  },
  // Text on the left; the story fills the right.
  bullets: {
    title: { x: 120, y: 80, w: 860, h: 160, size: 66, align: 'left', valign: 'bottom' },
    subtitle: { x: 120, y: 250, w: 860, h: 56, size: 32, align: 'left' },
    body: { x: 120, y: 320, w: 860, h: 500, size: 38, align: 'left' },
  },
  statement: {
    title: { x: 160, y: 120, w: 1280, h: 320, size: 80, align: 'center', valign: 'middle' },
    subtitle: { x: 260, y: 450, w: 1080, h: 60, size: 34, align: 'center' },
    body: { x: 420, y: 520, w: 760, h: 120, size: 30, align: 'left' },
  },
  stat: {
    stat: { x: 120, y: 170, w: 860, h: 280, size: 220, align: 'center', valign: 'middle' },
    subtitle: { x: 120, y: 460, w: 860, h: 70, size: 42, align: 'center' },
    body: { x: 220, y: 560, w: 660, h: 240, size: 30, align: 'left' },
  },
};

const ROLE_STYLE: Record<TextRole, Partial<TextElement>> = {
  title: { bold: true, color: 'ink' },
  stat: { bold: true, color: 'accent' },
  subtitle: { bold: false, color: 'muted' },
  body: { bold: false, color: 'ink' },
};

/** Elements for structured content (AI drafts, new slides, old projects). */
export function layoutElements(content: SlideContent): SlideElement[] {
  const t = TEMPLATES[content.layout];
  const out: SlideElement[] = [];
  const mainRole: TextRole = content.layout === 'stat' ? 'stat' : 'title';
  const add = (role: TextRole, text: string, list = false) => {
    const box = t[role];
    if (!box) return;
    out.push(newText({ role, text, list, ...box, valign: box.valign ?? 'top', ...ROLE_STYLE[role] }));
  };
  add(mainRole, content.title || (content.layout === 'stat' ? '42%' : 'Title'));
  if (content.subtitle.trim()) add('subtitle', content.subtitle);
  const bullets = content.bullets.map((b) => b.trim()).filter(Boolean);
  if (bullets.length) {
    add('body', bullets.join('\n'), true);
    // Tuck the list under a short subtitle-less title.
    const body = out[out.length - 1];
    if (content.layout === 'bullets' && !content.subtitle.trim()) body.y = 270;
  }
  return out;
}

/** Re-arrange a slide's text by role into a template, keeping images and shapes where they are. */
export function relayout(elements: SlideElement[], layout: Layout): SlideElement[] {
  const t = TEMPLATES[layout];
  const used = new Set<TextRole>();
  return elements.map((el) => {
    if (el.type !== 'text') return el;
    let role: TextRole = el.role;
    if (layout === 'stat' && role === 'title') role = 'stat';
    if (layout !== 'stat' && role === 'stat') role = 'title';
    const box = t[role];
    if (!box || used.has(role)) return el;
    used.add(role);
    return { ...el, role, ...box, valign: box.valign ?? 'top', rotation: 0, ...ROLE_STYLE[role], list: el.list };
  });
}

// ---- reading the content -----------------------------------------------------------------

/** Text elements in reading order (top to bottom, then left to right). */
export function textsInOrder(elements: SlideElement[]): TextElement[] {
  return elements
    .filter((e): e is TextElement => e.type === 'text' && e.text.trim() !== '')
    .sort((a, b) => Math.round((a.y - b.y) / 40) || a.x - b.x);
}

/** A plain-text description of a slide for the AI and the offline planner. */
export function slideSummary(elements: SlideElement[]): string {
  const lines: string[] = [];
  for (const t of textsInOrder(elements)) {
    const text = t.list ? t.text.split('\n').filter((l) => l.trim()).map((l) => `• ${l.trim()}`).join('\n') : t.text.trim();
    lines.push(`${t.role}: ${text}`);
  }
  for (const el of elements) if (el.type === 'image') lines.push(`image: ${el.alt.trim() || 'a picture'}`);
  return lines.join('\n');
}

/** Words only, for keyword matching. */
export function slidePlainText(elements: SlideElement[]): string {
  return [...textsInOrder(elements).map((t) => t.text), ...elements.flatMap((e) => (e.type === 'image' ? [e.alt] : []))].join(' ');
}

export function slideTitle(elements: SlideElement[]): string {
  const texts = textsInOrder(elements);
  return (texts.find((t) => t.role === 'title' || t.role === 'stat') ?? texts[0])?.text.split('\n')[0].trim() ?? '';
}

/** The inputs that influence the story plan, independent of position and styling. */
export function planInputs(elements: SlideElement[]): string[] {
  const order: Record<TextRole, number> = { title: 0, stat: 1, subtitle: 2, body: 3 };
  const texts = elements
    .filter((e): e is TextElement => e.type === 'text' && e.text.trim() !== '')
    .map((t) => `${order[t.role]}${t.role}:${t.text.trim()}`);
  const images = elements.flatMap((e) => (e.type === 'image' ? [`9image:${e.alt.trim()}`] : []));
  return [...texts, ...images].sort();
}

// ---- geometry ----------------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Axis-aligned bounds of a (possibly rotated) element. */
export function bounds(el: Box & { rotation: number }): Rect {
  if (!el.rotation) return { x: el.x, y: el.y, w: el.w, h: el.h };
  const a = (el.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(a));
  const sin = Math.abs(Math.sin(a));
  const w = el.w * cos + el.h * sin;
  const h = el.w * sin + el.h * cos;
  return { x: el.x + el.w / 2 - w / 2, y: el.y + el.h / 2 - h / 2, w, h };
}

const CELL = 50;

/**
 * The best empty area of the slide for the story illustration: the largest roughly
 * square rectangle not covered by any element. Elements covering most of the slide
 * count as backgrounds. Returns null when the slide is too full.
 */
export function storyRegion(elements: SlideElement[], width = CANVAS_W, height = CANVAS_H): Rect | null {
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const busy: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const pad = 26;
  for (const el of elements) {
    const b = bounds(el);
    if (b.w * b.h > width * height * 0.55) continue;
    const c0 = Math.max(0, Math.floor((b.x - pad) / CELL));
    const c1 = Math.min(cols - 1, Math.floor((b.x + b.w + pad) / CELL));
    const r0 = Math.max(0, Math.floor((b.y - pad) / CELL));
    const r1 = Math.min(rows - 1, Math.floor((b.y + b.h + pad) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) busy[r][c] = true;
  }

  let best: Rect | null = null;
  let bestScore = 0;
  const heights = new Array(cols).fill(0);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) heights[c] = busy[r][c] ? 0 : heights[c] + 1;
    // For every bar, find how far it extends left and right at its height.
    for (let c = 0; c < cols; c++) {
      const hgt = heights[c];
      if (!hgt) continue;
      let left = c;
      while (left > 0 && heights[left - 1] >= hgt) left--;
      let right = c;
      while (right < cols - 1 && heights[right + 1] >= hgt) right++;
      const w = (right - left + 1) * CELL;
      const h = hgt * CELL;
      const score = Math.pow(Math.min(w, h), 1.6) * Math.pow(Math.max(w, h), 0.4);
      if (score > bestScore) {
        bestScore = score;
        best = { x: left * CELL, y: (r - hgt + 1) * CELL, w: Math.min(w, width - left * CELL), h: Math.min(h, height - (r - hgt + 1) * CELL) };
      }
    }
  }
  if (!best || Math.min(best.w, best.h) < 240) return null;
  return best;
}

// ---- validation -------------------------------------------------------------------------------

const num = (v: unknown, dflt: number, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
const str = (v: unknown, dflt = '') => (typeof v === 'string' ? v : dflt);
const oneOf = <T extends string>(v: unknown, list: readonly T[], dflt: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : dflt;
const color = (v: unknown, dflt: string) =>
  typeof v === 'string' && ((COLOR_TOKENS as string[]).includes(v) || /^#[0-9a-f]{3,8}$/i.test(v)) ? v : dflt;

/** Repair an element from storage or a file; returns null if it is unusable. */
export function normalizeElement(raw: unknown): SlideElement | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const base = {
    id: str(r.id) || uid(),
    x: num(r.x, 100, -2000, 4000),
    y: num(r.y, 100, -2000, 4000),
    w: num(r.w, 300, 4, 6000),
    h: num(r.h, 100, 4, 6000),
    rotation: num(r.rotation, 0, -360, 360),
  };
  switch (r.type) {
    case 'text':
      return {
        ...base, type: 'text',
        role: oneOf(r.role, TEXT_ROLES, 'body'),
        text: str(r.text),
        font: r.font === 'auto' ? 'auto' : oneOf(r.font, FONT_KEYS, 'sans'),
        size: num(r.size, 40, 6, 600),
        bold: r.bold === true,
        italic: r.italic === true,
        align: oneOf(r.align, ['left', 'center', 'right'] as const, 'left'),
        valign: oneOf(r.valign, ['top', 'middle', 'bottom'] as const, 'top'),
        color: color(r.color, 'ink'),
        list: r.list === true,
      };
    case 'shape':
      return {
        ...base, type: 'shape',
        shape: oneOf(r.shape, SHAPE_KINDS, 'rect'),
        fill: color(r.fill, 'accent'),
        stroke: color(r.stroke, 'none'),
        strokeWidth: num(r.strokeWidth, 4, 0, 80),
      };
    case 'image': {
      const src = str(r.src);
      if (!/^data:image\//.test(src)) return null;
      return { ...base, type: 'image', src, fit: oneOf(r.fit, ['cover', 'contain'] as const, 'cover'), radius: num(r.radius, 0, 0, 2000), alt: str(r.alt) };
    }
    default:
      return null;
  }
}
