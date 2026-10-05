// The look of a slide in a given style and mood: background, ink and accent colours,
// and typefaces. Colour tokens in elements ('ink', 'accent'...) resolve through this,
// so slides stay readable when the story changes the mood.

import { STYLE_FONTS } from './fonts.ts';
import { KINETIC, MARKER, PAPER } from './palettes.ts';
import type { FontKey, Mood, StyleId } from './types.ts';

export interface Theme {
  style: StyleId;
  mood: Mood;
  /** CSS background of the slide area. */
  background: string;
  ink: string;
  muted: string;
  accent: string;
  /** A light surface colour (cards on dark backgrounds). */
  paper: string;
  fonts: { title: FontKey; body: FontKey };
}

const BOOK_PAGE = '#FBF6EA';
const BOARD = 'radial-gradient(ellipse at 35% 25%,#FFFFFF 0%,#F6F6F1 70%,#EEEEE7 100%)';

function luminance(hex: string): number {
  const v = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const cache = new Map<string, Theme>();

/** The theme for a style and mood (the same object for the same inputs). */
export function themeFor(style: StyleId, mood: Mood): Theme {
  const key = `${style}:${mood}`;
  let theme = cache.get(key);
  if (!theme) cache.set(key, (theme = buildTheme(style, mood)));
  return theme;
}

function buildTheme(style: StyleId, mood: Mood): Theme {
  const fonts = STYLE_FONTS[style];
  switch (style) {
    case 'kinetic': {
      const k = KINETIC[mood];
      return { style, mood, background: k.bg, ink: k.ink, muted: k.ink + 'B3', accent: k.accent, paper: '#FFFDF7', fonts };
    }
    case 'whiteboard': {
      const m = MARKER[mood];
      return { style, mood, background: BOARD, ink: m.ink, muted: '#5A6470', accent: m.accent, paper: '#FFFFFF', fonts };
    }
    case 'book': {
      const p = PAPER[mood];
      // The page is always cream; pick the accent that reads on it.
      const accent = luminance(p.tones[4]) > 0.45 ? p.tones[2] : p.tones[4];
      return { style, mood, background: BOOK_PAGE, ink: '#2B2118', muted: '#6A5847', accent, paper: '#FFFDF7', fonts };
    }
    case 'origami':
    default: {
      const p = PAPER[mood];
      const dark = luminance(p.bg) < 0.4;
      return {
        style: 'origami',
        mood,
        background: `radial-gradient(ellipse at 30% 25%, ${p.bg} 0%, ${p.bg} 35%, ${p.bg2} 100%)`,
        ink: p.ink,
        muted: dark ? '#C9D0D8' : '#6B6155',
        accent: dark ? p.tones[3] : p.tones[4],
        paper: '#FFFDF7',
        fonts,
      };
    }
  }
}

/** Resolve a colour token or pass a literal colour through. */
export function resolveColor(color: string, theme: Theme): string {
  switch (color) {
    case 'ink':
      return theme.ink;
    case 'accent':
      return theme.accent;
    case 'muted':
      return theme.muted;
    case 'paper':
      return theme.paper;
    case 'none':
    case '':
      return 'transparent';
    default:
      return color;
  }
}
