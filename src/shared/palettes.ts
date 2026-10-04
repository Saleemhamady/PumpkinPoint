// Colour palettes per mood. Each style reads the mood of a scene and picks its own
// palette, so a change of mood between scenes becomes a change of world.

import type { Mood } from './types.ts';

export interface PaperPalette {
  bg: string;
  bg2: string;
  ink: string;
  /** light, mid, dark, accent, dark accent */
  tones: [string, string, string, string, string];
}

/** Paper colours used by the origami and book styles. */
export const PAPER: Record<Mood, PaperPalette> = {
  neutral: { bg: '#EFE8DC', bg2: '#E0D3BF', ink: '#3B3127', tones: ['#FBF7F0', '#D8CBB7', '#A8957C', '#E07A4F', '#B85A35'] },
  calm: { bg: '#DDEAF2', bg2: '#BFD6E6', ink: '#1F3A4D', tones: ['#F5FAFD', '#A8C9DE', '#5F8FB3', '#F2A65A', '#D0843C'] },
  tense: { bg: '#3A4350', bg2: '#232931', ink: '#E8ECF1', tones: ['#8A97A8', '#5C6A7B', '#333C48', '#E8C547', '#C4A12C'] },
  hopeful: { bg: '#FCE6D6', bg2: '#F6C7AA', ink: '#4A2A1A', tones: ['#FFF7F0', '#F5B999', '#D9785B', '#4F9D8A', '#3A7A6A'] },
  triumphant: { bg: '#FFF3CF', bg2: '#FADF8E', ink: '#3F2C05', tones: ['#FFFCF2', '#F6CF5E', '#D9991F', '#C8412F', '#9E2E1F'] },
  mysterious: { bg: '#2F2A4A', bg2: '#1A172C', ink: '#EDE8FF', tones: ['#9A90D4', '#625A9E', '#3B3568', '#F0C674', '#CFA24E'] },
  energetic: { bg: '#FFE0D6', bg2: '#FFBFA9', ink: '#3A1208', tones: ['#FFF4F0', '#FF9478', '#E0452B', '#2B59C3', '#1E3F91'] },
};

export interface KineticPalette {
  bg: string;
  ink: string;
  accent: string;
}

/** Bold flat colours for kinetic typography. */
export const KINETIC: Record<Mood, KineticPalette> = {
  neutral: { bg: '#F2EEE6', ink: '#141414', accent: '#FF4D2E' },
  calm: { bg: '#1E3A5F', ink: '#F4F1EA', accent: '#7FD1D9' },
  tense: { bg: '#111214', ink: '#F2F2F2', accent: '#FF3B30' },
  hopeful: { bg: '#FFB25B', ink: '#2B1608', accent: '#FFFFFF' },
  triumphant: { bg: '#FFD23F', ink: '#141414', accent: '#E4002B' },
  mysterious: { bg: '#24183A', ink: '#EFE7FF', accent: '#B794FF' },
  energetic: { bg: '#FF4D2E', ink: '#FFF8F0', accent: '#141414' },
};

/** Marker colours for the whiteboard style: black ink plus one coloured marker. */
export const MARKER: Record<Mood, { ink: string; accent: string }> = {
  neutral: { ink: '#1F2A36', accent: '#2F6FDE' },
  calm: { ink: '#1F2A36', accent: '#2A7FC9' },
  tense: { ink: '#1F2A36', accent: '#D63B3B' },
  hopeful: { ink: '#1F2A36', accent: '#F08A24' },
  triumphant: { ink: '#1F2A36', accent: '#2E9E5B' },
  mysterious: { ink: '#1F2A36', accent: '#7B4FD6' },
  energetic: { ink: '#1F2A36', accent: '#E0457B' },
};

/** Room light around the book, tinted by mood. */
export const BOOK_AMBIENT: Record<Mood, string> = {
  neutral: '#2B2520',
  calm: '#13283A',
  tense: '#0E1014',
  hopeful: '#3B2216',
  triumphant: '#3A2B0C',
  mysterious: '#1B1430',
  energetic: '#3A120C',
};
