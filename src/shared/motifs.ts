// The motif library: low-poly illustrations every style knows how to render.
//
// Each motif is a list of polygons in a 100x100 box (y grows downwards). A polygon
// has a tone (0 light, 1 mid, 2 dark, 3 accent, 4 dark accent) that each style maps
// to its own palette. The same geometry becomes folded paper facets (origami),
// pop-up cut-outs (book) and marker sketches (whiteboard).

import type { Motion, Setting } from './types.ts';

export type Tone = 0 | 1 | 2 | 3 | 4;

export interface Poly {
  t: Tone;
  /** Flat list of coordinates: x1, y1, x2, y2, ... */
  p: number[];
  /** Filled by the paper styles. Default true. */
  f?: boolean;
  /** Stroked by the sketch style. Default true. */
  s?: boolean;
  /** Open polyline (only meaningful for strokes). */
  open?: boolean;
}

/** Where a motif naturally sits in a composition. */
export type Place = 'ground' | 'sky';

export interface MotifDef {
  id: string;
  label: string;
  keywords: string[];
  place: Place;
  motion: Motion;
  polys: Poly[];
}

// ---- geometry helpers ----------------------------------------------------------

const P = (t: Tone, ...p: number[]): Poly => ({ t, p });

const rad = (d: number) => (d * Math.PI) / 180;
const r1 = (n: number) => Math.round(n * 10) / 10;

function ring(cx: number, cy: number, r: number, n: number, rot = -90): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rad(rot + (i * 360) / n);
    pts.push(r1(cx + r * Math.cos(a)), r1(cy + r * Math.sin(a)));
  }
  return pts;
}

/** Fan of facets around a centre, plus one outline for sketching. */
function fan(cx: number, cy: number, pts: number[], tones: Tone[]): Poly[] {
  const n = pts.length / 2;
  const out: Poly[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    out.push({ t: tones[i % tones.length], p: [cx, cy, pts[2 * i], pts[2 * i + 1], pts[2 * j], pts[2 * j + 1]], s: false });
  }
  out.push({ t: tones[0], p: pts, f: false });
  return out;
}

function ngon(cx: number, cy: number, r: number, n: number, tones: Tone[], rot = -90): Poly[] {
  return fan(cx, cy, ring(cx, cy, r, n, rot), tones);
}

function starShape(cx: number, cy: number, ro: number, ri: number, n: number, tones: Tone[]): Poly[] {
  const pts: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rad(-90 + (i * 180) / n);
    const r = i % 2 === 0 ? ro : ri;
    pts.push(r1(cx + r * Math.cos(a)), r1(cy + r * Math.sin(a)));
  }
  return fan(cx, cy, pts, tones);
}

function gearShape(cx: number, cy: number, ro: number, ri: number, teeth: number, tones: Tone[]): Poly[] {
  const pts: number[] = [];
  const step = 360 / teeth;
  for (let i = 0; i < teeth; i++) {
    const a0 = -90 + i * step;
    for (const [a, r] of [[a0, ri], [a0 + step * 0.2, ro], [a0 + step * 0.5, ro], [a0 + step * 0.7, ri]] as const) {
      pts.push(r1(cx + r * Math.cos(rad(a))), r1(cy + r * Math.sin(rad(a))));
    }
  }
  return fan(cx, cy, pts, tones);
}

/** A thick line: quads for filling (with round-ish joints) and an open stroke for sketching. */
function thick(points: number[], w: number, t: Tone): Poly[] {
  const out: Poly[] = [];
  const h = w / 2;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const [x1, y1, x2, y2] = [points[i], points[i + 1], points[i + 2], points[i + 3]];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx = (-(y2 - y1) / len) * h;
    const ny = ((x2 - x1) / len) * h;
    out.push({ t, p: [x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny].map(r1), s: false });
    if (w > 3 && i > 0) out.push({ t, p: ring(x1, y1, h, 6), s: false });
  }
  out.push({ t, p: points, f: false, open: true });
  return out;
}

function person(cx: number, base: number, s: number, tones: [Tone, Tone, Tone, Tone]): Poly[] {
  const y = (v: number) => r1(base - v * s);
  const x = (v: number) => r1(cx + v * s);
  return [
    P(tones[2], x(-18), base, cx, base, cx, y(56), x(-13), y(56)),
    P(tones[3], cx, base, x(18), base, x(13), y(56), cx, y(56)),
    ...ngon(cx, y(76), 11 * s, 8, [tones[0]]),
  ];
}

function arc(cx: number, cy: number, r: number, from: number, to: number, steps: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = rad(from + ((to - from) * i) / steps);
    pts.push(r1(cx + r * Math.cos(a)), r1(cy + r * Math.sin(a)));
  }
  return pts;
}

function crescent(): Poly[] {
  // Outer circle (50,50,r38) from 40deg to 320deg through the left side; inner circle
  // (78.4,50,r24.4) passes through both end points and bulges to x=54.
  const outerBottom = arc(50, 50, 38, 40, 180, 7);
  const outerTop = arc(50, 50, 38, 180, 320, 7);
  const innerTop = arc(78.4, 50, 24.4, 271.6, 180, 6);
  const innerBottom = arc(78.4, 50, 24.4, 180, 88.4, 6);
  return [
    { t: 4, p: [...outerBottom, ...innerBottom.slice(0, -2)], s: false },
    { t: 3, p: [...outerTop, ...innerTop], s: false },
    { t: 3, p: [...outerBottom, ...outerTop.slice(2), ...innerTop.slice(2), ...innerBottom.slice(2, -2)], f: false },
  ];
}

function bars(): Poly[] {
  const out: Poly[] = [];
  const spec: [number, number, Tone, Tone][] = [[12, 70, 1, 2], [32, 58, 1, 2], [52, 44, 1, 2], [72, 26, 3, 4]];
  for (const [x, top, a, b] of spec) {
    out.push(P(a, x, top, x + 7, top, x + 7, 96, x, 96), P(b, x + 7, top, x + 14, top, x + 14, 96, x + 7, 96));
  }
  return out;
}

function bridgeArch(): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(r1(22 + 56 * t), r1(94 - 32 * Math.sin(Math.PI * t)));
  }
  return pts;
}

function bookLines(): Poly[] {
  const out: Poly[] = [];
  for (const y of [36, 46, 56, 66]) {
    out.push(...thick([17, y + 1, 43, y + 7.5], 1.6, 2));
    out.push(...thick([57, y + 7.5, 83, y + 1], 1.6, 2));
  }
  return out;
}

// ---- the library -----------------------------------------------------------------

export const MOTIFS: MotifDef[] = [
  {
    id: 'sailboat', label: 'a sailing boat', place: 'ground', motion: 'float',
    keywords: ['boat', 'ship', 'sail', 'sailing', 'voyage', 'journey', 'crew', 'navigate', 'captain', 'fleet', 'harbor', 'harbour', 'set out'],
    polys: [
      P(2, 48, 10, 51, 10, 51, 70, 48, 70),
      P(0, 53, 14, 53, 66, 68, 66), P(1, 53, 14, 68, 66, 84, 66),
      P(1, 46, 22, 46, 66, 33, 66), P(0, 46, 22, 33, 66, 18, 66),
      P(3, 51, 10, 62, 13, 51, 16),
      P(2, 12, 70, 50, 70, 50, 90, 24, 90), P(1, 50, 70, 88, 70, 76, 90, 50, 90),
    ],
  },
  {
    id: 'lighthouse', label: 'a lighthouse with light beams', place: 'ground', motion: 'none',
    keywords: ['lighthouse', 'beacon', 'guide', 'guidance', 'direction', 'vision', 'safe', 'safety', 'light', 'shine', 'clarity'],
    polys: [
      P(0, 58, 23, 98, 12, 98, 34), P(0, 42, 23, 2, 12, 2, 34),
      P(1, 20, 100, 50, 100, 50, 90, 30, 90), P(2, 50, 100, 80, 100, 70, 90, 50, 90),
      P(3, 36, 90, 50, 90, 50, 76, 37.5, 76), P(4, 50, 90, 64, 90, 62.5, 76, 50, 76),
      P(0, 37.5, 76, 50, 76, 50, 62, 39, 62), P(1, 50, 76, 62.5, 76, 61, 62, 50, 62),
      P(3, 39, 62, 50, 62, 50, 48, 40.5, 48), P(4, 50, 62, 61, 62, 59.5, 48, 50, 48),
      P(0, 40.5, 48, 50, 48, 50, 34, 42, 34), P(1, 50, 48, 59.5, 48, 58, 34, 50, 34),
      P(2, 38, 34, 62, 34, 62, 30, 38, 30),
      P(0, 42, 30, 58, 30, 58, 20, 42, 20),
      P(3, 40, 20, 50, 20, 50, 10), P(4, 50, 20, 60, 20, 50, 10),
    ],
  },
  {
    id: 'sun', label: 'the sun', place: 'sky', motion: 'spin',
    keywords: ['sun', 'sunrise', 'dawn', 'morning', 'bright', 'brighter', 'day', 'warm', 'optimism', 'optimistic', 'sunny', 'hope'],
    polys: [
      ...Array.from({ length: 8 }, (_, i) => {
        const a = i * 45 - 90;
        const pt = (r: number, d: number) => [r1(50 + r * Math.cos(rad(a + d))), r1(50 + r * Math.sin(rad(a + d)))];
        return P((i % 2 ? 4 : 3) as Tone, ...pt(28, -11), ...pt(46, 0), ...pt(28, 11));
      }),
      ...ngon(50, 50, 24, 10, [3, 4]),
    ],
  },
  {
    id: 'cloud', label: 'a soft cloud', place: 'sky', motion: 'drift',
    keywords: ['cloud', 'clouds', 'weather', 'sky', 'dream', 'dreams', 'uncertain', 'uncertainty', 'fog', 'online'],
    polys: [
      ...ngon(34, 56, 16, 8, [0, 1]), ...ngon(56, 46, 22, 8, [0, 1]), ...ngon(74, 58, 14, 8, [0, 1]),
      P(1, 18, 58, 88, 58, 86, 72, 20, 72),
    ],
  },
  {
    id: 'storm', label: 'a storm cloud with lightning', place: 'sky', motion: 'sway',
    keywords: ['storm', 'stormy', 'crisis', 'chaos', 'struggle', 'trouble', 'turbulence', 'turbulent', 'thunder', 'lightning', 'rain', 'disruption', 'pain'],
    polys: [
      ...thick([26, 62, 22, 72], 2.5, 1), ...thick([31, 76, 27, 86], 2.5, 1),
      ...thick([74, 62, 70, 72], 2.5, 1), ...thick([80, 76, 76, 86], 2.5, 1),
      ...ngon(34, 40, 16, 8, [1, 2]), ...ngon(56, 32, 20, 8, [1, 2]), ...ngon(74, 42, 14, 8, [1, 2]),
      P(2, 18, 42, 88, 42, 86, 54, 20, 54),
      P(3, 54, 50, 40, 74, 50, 74, 42, 96, 64, 66, 53, 66, 60, 50),
    ],
  },
  {
    id: 'mountain', label: 'mountains with a snowy peak', place: 'ground', motion: 'none',
    keywords: ['mountain', 'mountains', 'climb', 'obstacle', 'obstacles', 'challenge', 'challenges', 'hard', 'difficult', 'barrier', 'ambition', 'steep'],
    polys: [
      P(0, 0, 96, 26, 48, 24, 96), P(1, 24, 96, 26, 48, 50, 96),
      P(1, 14, 96, 56, 16, 52, 96), P(2, 52, 96, 56, 16, 98, 96),
      P(0, 44, 38, 56, 16, 68, 38, 62, 34, 57, 41, 51, 35),
    ],
  },
  {
    id: 'summit', label: 'a mountain summit with a flag', place: 'ground', motion: 'none',
    keywords: ['summit', 'peak', 'top', 'goal', 'goals', 'milestone', 'achieve', 'achieved', 'reach', 'reached', 'destination', 'finish', 'conquer'],
    polys: [
      P(0, 0, 96, 26, 52, 24, 96), P(1, 24, 96, 26, 52, 50, 96),
      P(1, 14, 96, 56, 22, 52, 96), P(2, 52, 96, 56, 22, 98, 96),
      P(0, 45, 42, 56, 22, 67, 42, 61, 38, 57, 45, 51, 39),
      P(2, 55.5, 4, 57, 4, 57, 22, 55.5, 22),
      P(3, 57, 4, 72, 8, 57, 13),
    ],
  },
  {
    id: 'tree', label: 'a pine tree', place: 'ground', motion: 'sway',
    keywords: ['tree', 'trees', 'forest', 'nature', 'roots', 'sustainable', 'sustainability', 'environment', 'organic', 'mature', 'growth'],
    polys: [
      P(2, 46, 82, 54, 82, 54, 98, 46, 98),
      P(1, 18, 86, 50, 46, 50, 86), P(2, 50, 46, 82, 86, 50, 86),
      P(1, 24, 64, 50, 28, 50, 64), P(2, 50, 28, 76, 64, 50, 64),
      P(1, 30, 42, 50, 8, 50, 42), P(2, 50, 8, 70, 42, 50, 42),
    ],
  },
  {
    id: 'sprout', label: 'a seedling sprouting from soil', place: 'ground', motion: 'grow',
    keywords: ['seed', 'seeds', 'sprout', 'plant', 'start', 'begin', 'beginning', 'early', 'potential', 'grow', 'growing', 'small', 'nurture', 'birth'],
    polys: [
      P(4, 49, 85, 51.5, 85, 51.5, 50, 49, 50),
      P(3, 50, 62, 22, 42, 34, 62), P(4, 50, 62, 22, 42, 42, 46),
      P(3, 51, 54, 80, 30, 66, 54), P(4, 51, 54, 80, 30, 60, 36),
      P(2, 18, 98, 50, 98, 50, 84, 32, 86), P(1, 50, 98, 82, 98, 68, 86, 50, 84),
    ],
  },
  {
    id: 'house', label: 'a house', place: 'ground', motion: 'none',
    keywords: ['house', 'home', 'family', 'shelter', 'local', 'foundation', 'real estate', 'neighborhood', 'neighbourhood', 'belong'],
    polys: [
      P(2, 64, 24, 72, 24, 72, 40, 64, 34),
      P(0, 24, 52, 50, 52, 50, 96, 24, 96), P(1, 50, 52, 76, 52, 76, 96, 50, 96),
      P(3, 16, 56, 50, 20, 50, 56), P(4, 50, 20, 84, 56, 50, 56),
      P(2, 56, 96, 68, 96, 68, 72, 56, 72),
      P(2, 30, 64, 42, 64, 42, 76, 30, 76),
    ],
  },
  {
    id: 'person', label: 'a single person', place: 'ground', motion: 'none',
    keywords: ['person', 'user', 'customer', 'individual', 'human', 'leader', 'hero', 'client', 'founder', 'you', 'student', 'patient', 'employee'],
    polys: person(50, 98, 1.05, [0, 1, 3, 4]),
  },
  {
    id: 'team', label: 'a group of three people', place: 'ground', motion: 'none',
    keywords: ['team', 'teams', 'people', 'group', 'together', 'community', 'users', 'customers', 'audience', 'partners', 'collaboration', 'collaborate', 'network', 'society', 'staff', 'everyone'],
    polys: [...person(22, 98, 0.72, [0, 1, 1, 2]), ...person(78, 98, 0.72, [0, 1, 1, 2]), ...person(50, 98, 0.95, [0, 1, 3, 4])],
  },
  {
    id: 'rocket', label: 'a rocket taking off', place: 'sky', motion: 'rise',
    keywords: ['rocket', 'launch', 'launched', 'takeoff', 'startup', 'boost', 'accelerate', 'fast', 'speed', 'scale', 'innovation', 'moonshot', 'lift'],
    polys: [
      P(3, 45, 78, 55, 78, 50, 98),
      P(3, 40, 54, 26, 80, 40, 72), P(4, 60, 54, 74, 80, 60, 72),
      P(0, 40, 30, 50, 30, 50, 72, 40, 72), P(1, 50, 30, 60, 30, 60, 72, 50, 72),
      P(3, 40, 30, 50, 6, 50, 30), P(4, 50, 6, 60, 30, 50, 30),
      ...ngon(50, 44, 6, 8, [2]),
      P(2, 43, 72, 57, 72, 55, 78, 45, 78),
    ],
  },
  {
    id: 'star', label: 'a five-pointed star', place: 'sky', motion: 'pulse',
    keywords: ['star', 'stars', 'excellence', 'quality', 'best', 'shine', 'wish', 'highlight', 'favorite', 'favourite', 'talent', 'rating', 'brilliant'],
    polys: starShape(50, 54, 46, 19, 5, [3, 4]),
  },
  {
    id: 'heart', label: 'a heart', place: 'ground', motion: 'pulse',
    keywords: ['heart', 'love', 'care', 'caring', 'passion', 'health', 'empathy', 'kindness', 'loyal', 'loyalty', 'feel', 'emotion', 'wellbeing'],
    polys: [
      P(3, 50, 92, 14, 56, 10, 38, 18, 24, 32, 18, 44, 24, 50, 34),
      P(4, 50, 34, 56, 24, 68, 18, 82, 24, 90, 38, 86, 56, 50, 92),
    ],
  },
  {
    id: 'bulb', label: 'a light bulb (an idea)', place: 'sky', motion: 'pulse',
    keywords: ['idea', 'ideas', 'insight', 'insights', 'creative', 'creativity', 'think', 'thinking', 'solution', 'solutions', 'eureka', 'lightbulb', 'inspiration', 'invent', 'imagine'],
    polys: [
      ...ngon(50, 38, 28, 10, [3, 4]),
      P(1, 39, 62, 61, 62, 58, 72, 42, 72),
      P(2, 42, 72, 58, 72, 58, 86, 42, 86),
      P(2, 46, 86, 54, 86, 50, 92),
    ],
  },
  {
    id: 'chart', label: 'a rising bar chart with an arrow', place: 'ground', motion: 'grow',
    keywords: ['chart', 'growth', 'revenue', 'data', 'results', 'increase', 'metrics', 'sales', 'profit', 'numbers', 'traction', 'progress', 'kpi', 'performance', 'statistics', 'double', 'doubled'],
    polys: [...bars(), ...thick([10, 60, 34, 46, 52, 52, 80, 18], 5, 4), P(4, 74.6, 13.5, 87.6, 8.7, 85.4, 22.5)],
  },
  {
    id: 'coins', label: 'a stack of coins', place: 'ground', motion: 'none',
    keywords: ['money', 'cost', 'costs', 'price', 'pricing', 'budget', 'funding', 'investment', 'invest', 'savings', 'cash', 'finance', 'financial', 'pay', 'dollar', 'dollars', 'revenue', 'fund', 'raise', 'capital'],
    polys: [
      P(4, 14, 86, 56, 86, 56, 96, 14, 96), P(3, 16, 76, 58, 76, 58, 86, 16, 86), P(4, 14, 66, 56, 66, 56, 76, 14, 76),
      ...ngon(68, 44, 26, 10, [3, 4]), ...ngon(68, 44, 17, 10, [4, 3]),
    ],
  },
  {
    id: 'globe', label: 'the globe', place: 'ground', motion: 'float',
    keywords: ['world', 'global', 'globe', 'international', 'earth', 'planet', 'worldwide', 'countries', 'expansion', 'expand', 'everywhere', 'markets'],
    polys: [
      ...ngon(50, 50, 42, 12, [1, 2]),
      P(3, 30, 26, 46, 22, 52, 34, 42, 44, 30, 40),
      P(3, 58, 52, 72, 46, 78, 60, 66, 74, 58, 64),
      P(3, 22, 56, 34, 58, 32, 70, 24, 66),
    ],
  },
  {
    id: 'gear', label: 'a gear', place: 'ground', motion: 'spin',
    keywords: ['process', 'system', 'systems', 'operations', 'engineering', 'technology', 'mechanism', 'efficiency', 'efficient', 'automation', 'automate', 'machine', 'build', 'tool', 'tools', 'engine', 'workflow', 'platform'],
    polys: [...gearShape(50, 50, 44, 34, 9, [1, 2]), ...ngon(50, 50, 12, 8, [0])],
  },
  {
    id: 'key', label: 'a key', place: 'ground', motion: 'sway',
    keywords: ['key', 'unlock', 'access', 'secret', 'answer', 'open', 'opportunity', 'opportunities', 'enable', 'crucial'],
    polys: [
      ...ngon(28, 44, 20, 8, [3, 4]), ...ngon(28, 44, 7, 8, [0]),
      P(3, 46, 40, 92, 40, 92, 44, 46, 44), P(4, 46, 44, 92, 44, 92, 48, 46, 48),
      P(4, 80, 48, 86, 48, 86, 60, 80, 60), P(4, 68, 48, 74, 48, 74, 56, 68, 56),
    ],
  },
  {
    id: 'shield', label: 'a shield', place: 'ground', motion: 'none',
    keywords: ['security', 'secure', 'protect', 'protection', 'trust', 'privacy', 'defense', 'defence', 'compliance', 'safe', 'guard', 'resilient', 'insurance'],
    polys: [
      P(1, 50, 6, 50, 94, 18, 60, 14, 20), P(2, 50, 6, 86, 20, 82, 60, 50, 94),
      P(3, 50, 20, 50, 78, 28, 56, 26, 28), P(4, 50, 20, 74, 28, 72, 56, 50, 78),
    ],
  },
  {
    id: 'crane', label: 'an origami crane (a bird)', place: 'sky', motion: 'float',
    keywords: ['bird', 'birds', 'crane', 'fly', 'flying', 'flight', 'freedom', 'free', 'peace', 'spirit', 'soar', 'wings', 'origami'],
    polys: [
      P(2, 50, 56, 66, 60, 80, 14),
      P(1, 66, 62, 72, 60, 94, 34),
      P(0, 32, 62, 52, 54, 52, 72), P(1, 52, 54, 70, 62, 52, 72),
      P(1, 34, 62, 40, 60, 14, 30), P(2, 14, 30, 18, 34, 6, 40),
      P(0, 36, 60, 56, 56, 34, 10),
    ],
  },
  {
    id: 'fish', label: 'a fish', place: 'ground', motion: 'drift',
    keywords: ['fish', 'ocean', 'swim', 'deep', 'catch', 'dive', 'underwater', 'explore', 'water'],
    polys: [
      P(3, 38, 34, 52, 22, 56, 36),
      P(3, 74, 50, 94, 30, 88, 50), P(4, 74, 50, 88, 50, 94, 70),
      P(1, 12, 50, 44, 30, 76, 50), P(2, 12, 50, 76, 50, 44, 70),
      ...ngon(26, 46, 3, 6, [0]),
    ],
  },
  {
    id: 'trophy', label: 'a trophy cup', place: 'ground', motion: 'none',
    keywords: ['win', 'wins', 'winner', 'winning', 'award', 'awards', 'champion', 'victory', 'achievement', 'success', 'successful', 'celebrate', 'celebration', 'reward', 'prize', 'first place'],
    polys: [
      ...thick([27, 18, 14, 20, 16, 34, 30, 40], 4, 4), ...thick([73, 18, 86, 20, 84, 34, 70, 40], 4, 4),
      P(3, 26, 12, 50, 12, 50, 58, 44, 58, 32, 44), P(4, 50, 12, 74, 12, 68, 44, 56, 58, 50, 58),
      P(4, 46, 58, 54, 58, 54, 74, 46, 74),
      P(1, 34, 74, 50, 74, 50, 90, 30, 90), P(2, 50, 74, 66, 74, 70, 90, 50, 90),
    ],
  },
  {
    id: 'book', label: 'an open book', place: 'ground', motion: 'none',
    keywords: ['book', 'books', 'learn', 'learning', 'knowledge', 'education', 'study', 'research', 'read', 'reading', 'school', 'training', 'lesson', 'lessons', 'history', 'story', 'teach'],
    polys: [
      P(3, 6, 80, 50, 90, 94, 80, 94, 86, 50, 96, 6, 86),
      P(0, 50, 30, 10, 20, 10, 80, 50, 88), P(1, 50, 30, 90, 20, 90, 80, 50, 88),
      ...bookLines(),
    ],
  },
  {
    id: 'clock', label: 'a clock', place: 'ground', motion: 'none',
    keywords: ['time', 'deadline', 'schedule', 'timeline', 'hours', 'minutes', 'urgent', 'urgency', 'wait', 'waiting', 'timing', 'years', 'months', 'late', 'faster', 'delay'],
    polys: [
      ...ngon(50, 52, 42, 12, [0, 1]),
      ...thick([50, 52, 50, 20], 4, 2), ...thick([50, 52, 70, 62], 5, 4),
      ...ngon(50, 52, 4, 6, [2]),
    ],
  },
  {
    id: 'target', label: 'a target with an arrow in the bullseye', place: 'ground', motion: 'none',
    keywords: ['target', 'targets', 'focus', 'aim', 'objective', 'objectives', 'precision', 'strategy', 'accurate', 'mission', 'bullseye', 'priority', 'priorities'],
    polys: [
      ...ngon(50, 54, 40, 12, [3, 4]), ...ngon(50, 54, 28, 12, [0, 1]), ...ngon(50, 54, 16, 12, [3, 4]), ...ngon(50, 54, 6, 8, [0]),
      ...thick([50, 54, 88, 16], 3.5, 2),
      P(3, 88, 16, 84, 6, 92, 8), P(4, 88, 16, 98, 12, 96, 20),
    ],
  },
  {
    id: 'road', label: 'a road leading to a flag on the horizon', place: 'ground', motion: 'none',
    keywords: ['road', 'path', 'roadmap', 'plan', 'plans', 'way', 'route', 'next', 'steps', 'ahead', 'future', 'travel', 'direction', 'forward', 'phase', 'phases'],
    polys: [
      P(1, 0, 100, 0, 64, 30, 56, 70, 52, 100, 58, 100, 100),
      P(2, 30, 100, 70, 100, 52, 54, 48, 54),
      P(0, 48.6, 96, 51.4, 96, 51.1, 86, 48.9, 86), P(0, 49.1, 80, 50.9, 80, 50.7, 72, 49.3, 72), P(0, 49.4, 67, 50.6, 67, 50.5, 61, 49.5, 61),
      P(2, 51.5, 40, 52.5, 40, 52.5, 54, 51.5, 54), P(3, 52.5, 40, 60, 43, 52.5, 46),
    ],
  },
  {
    id: 'city', label: 'city buildings', place: 'ground', motion: 'none',
    keywords: ['city', 'cities', 'business', 'company', 'companies', 'enterprise', 'corporate', 'urban', 'office', 'industry', 'organization', 'organisation', 'market', 'firm', 'headquarters'],
    polys: [
      P(1, 6, 96, 6, 50, 22, 50, 22, 96), P(2, 22, 96, 22, 28, 40, 28, 40, 96), P(1, 40, 96, 40, 42, 56, 42, 56, 96),
      P(3, 56, 96, 56, 18, 65, 18, 65, 96), P(4, 65, 96, 65, 18, 74, 18, 74, 96), P(1, 74, 96, 74, 56, 94, 56, 94, 96),
      P(2, 64.5, 6, 65.5, 6, 65.5, 18, 64.5, 18),
      P(0, 26, 34, 30, 34, 30, 40, 26, 40), P(0, 33, 34, 37, 34, 37, 40, 33, 40), P(0, 26, 46, 30, 46, 30, 52, 26, 52), P(0, 33, 46, 37, 46, 37, 52, 33, 52),
      P(0, 59, 26, 63, 26, 63, 32, 59, 32), P(0, 67, 26, 71, 26, 71, 32, 67, 32), P(0, 59, 40, 63, 40, 63, 46, 59, 46), P(0, 67, 40, 71, 40, 71, 46, 67, 46),
    ],
  },
  {
    id: 'plane', label: 'a paper airplane', place: 'sky', motion: 'drift',
    keywords: ['send', 'sent', 'message', 'deliver', 'delivery', 'email', 'paper', 'airplane', 'plane', 'ship', 'shipping', 'release', 'communicate'],
    polys: [P(0, 6, 50, 94, 16, 40, 62), P(1, 40, 62, 94, 16, 54, 86), P(2, 40, 62, 54, 86, 44, 72)],
  },
  {
    id: 'magnifier', label: 'a magnifying glass', place: 'ground', motion: 'sway',
    keywords: ['search', 'analysis', 'analyze', 'analyse', 'discover', 'discovery', 'investigate', 'find', 'understand', 'examine', 'detail', 'details', 'audit', 'review', 'question'],
    polys: [...thick([62, 62, 88, 88], 10, 2), ...ngon(42, 42, 30, 12, [1, 2]), ...ngon(42, 42, 22, 12, [0])],
  },
  {
    id: 'bubble', label: 'a speech bubble', place: 'sky', motion: 'float',
    keywords: ['talk', 'conversation', 'communication', 'feedback', 'voice', 'chat', 'say', 'said', 'discuss', 'discussion', 'social', 'listen', 'ask', 'interview', 'story'],
    polys: [
      { t: 0, p: [10, 16, 90, 16, 10, 66], s: false }, { t: 1, p: [90, 16, 90, 66, 10, 66], s: false },
      { t: 1, p: [28, 64, 46, 64, 24, 88], s: false },
      { t: 0, p: [10, 16, 90, 16, 90, 66, 46, 66, 24, 88, 28, 66, 10, 66], f: false },
      ...ngon(32, 41, 5, 6, [3, 4]), ...ngon(50, 41, 5, 6, [3, 4]), ...ngon(68, 41, 5, 6, [3, 4]),
    ],
  },
  {
    id: 'hourglass', label: 'an hourglass', place: 'ground', motion: 'none',
    keywords: ['hourglass', 'patience', 'running out', 'countdown', 'limited', 'waiting', 'slow', 'legacy', 'era'],
    polys: [
      P(2, 22, 6, 78, 6, 78, 13, 22, 13), P(2, 22, 87, 78, 87, 78, 94, 22, 94),
      P(0, 27, 13, 50, 13, 50, 50, 47, 50), P(1, 50, 13, 73, 13, 53, 50, 50, 50),
      P(0, 47, 50, 50, 50, 50, 87, 27, 87), P(1, 50, 50, 53, 50, 73, 87, 50, 87),
      P(3, 35, 24, 65, 24, 51.5, 46, 48.5, 46), ...thick([50, 46, 50, 80], 1.2, 3),
      P(3, 32, 87, 50, 70, 50, 87), P(4, 50, 70, 68, 87, 50, 87),
    ],
  },
  {
    id: 'warning', label: 'a warning sign', place: 'ground', motion: 'pulse',
    keywords: ['warning', 'risk', 'risks', 'danger', 'dangerous', 'problem', 'problems', 'issue', 'issues', 'alert', 'caution', 'mistake', 'error', 'errors', 'threat', 'broken', 'fail', 'failure', 'pain', 'waste'],
    polys: [
      P(3, 50, 8, 50, 90, 4, 90), P(4, 50, 8, 96, 90, 50, 90),
      P(2, 46, 34, 54, 34, 52, 64, 48, 64), ...ngon(50, 76, 5, 6, [2]),
    ],
  },
  {
    id: 'bridge', label: 'an arched bridge', place: 'ground', motion: 'none',
    keywords: ['bridge', 'connect', 'connection', 'connecting', 'link', 'partnership', 'integration', 'integrate', 'gap', 'cross', 'transition', 'between'],
    polys: [
      P(2, 14, 56, 22, 56, 22, 96, 14, 96), P(2, 78, 56, 86, 56, 86, 96, 78, 96),
      ...thick(bridgeArch(), 4, 1),
      P(3, 2, 50, 50, 50, 50, 57, 2, 57), P(4, 50, 50, 98, 50, 98, 57, 50, 57),
    ],
  },
  {
    id: 'leaf', label: 'a leaf', place: 'ground', motion: 'sway',
    keywords: ['leaf', 'green', 'eco', 'ecology', 'climate', 'fresh', 'natural', 'renewable', 'clean', 'life', 'spring'],
    polys: [
      ...thick([10, 96, 22, 82], 3, 2),
      P(3, 18, 86, 24, 50, 44, 28, 70, 16, 88, 14), P(4, 18, 86, 88, 14, 84, 34, 76, 58, 56, 76, 30, 86),
    ],
  },
  {
    id: 'question', label: 'a question mark', place: 'sky', motion: 'sway',
    keywords: ['why', 'what', 'how', 'unknown', 'question', 'questions', 'curious', 'curiosity', 'wonder', 'confused', 'confusion', 'mystery', 'puzzle'],
    polys: [...thick([30, 32, 34, 18, 46, 10, 60, 12, 70, 22, 68, 36, 56, 46, 50, 54, 50, 66], 9, 3), ...ngon(50, 84, 7, 8, [3, 4])],
  },
  {
    id: 'moon', label: 'a crescent moon', place: 'sky', motion: 'float',
    keywords: ['moon', 'night', 'dark', 'darkness', 'sleep', 'rest', 'quiet', 'calm', 'midnight', 'dream'],
    polys: crescent(),
  },
];

export const MOTIF_IDS = MOTIFS.map((m) => m.id);

const byId = new Map(MOTIFS.map((m) => [m.id, m]));

export function getMotif(id: string): MotifDef | undefined {
  return byId.get(id);
}

// ---- settings: the world behind the motifs (200x100 box) ---------------------------

function waveBand(y0: number, amp: number, step: number, t: Tone): Poly {
  const p: number[] = [0, 100];
  for (let x = 0, i = 0; x <= 200; x += step, i++) p.push(x, i % 2 ? y0 - amp : y0);
  p.push(200, 100);
  return { t, p };
}

function hill(base: number, amp: number, freq: number, phase: number, t: Tone): Poly {
  const p: number[] = [0, 100];
  for (let x = 0; x <= 200; x += 10) p.push(x, r1(base - amp * Math.sin((x / 200) * Math.PI * freq + phase)));
  p.push(200, 100);
  return { t, p };
}

function skyline(base: number, seed: number, minH: number, maxH: number, t: Tone): Poly[] {
  const out: Poly[] = [];
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let x = 0; x < 200; ) {
    const w = 10 + Math.round(rnd() * 12);
    const h = minH + Math.round(rnd() * (maxH - minH));
    out.push({ t, p: [x, 100, x, base - h, Math.min(200, x + w), base - h, Math.min(200, x + w), 100] });
    x += w;
  }
  return out;
}

function sparkle(cx: number, cy: number, r: number, t: Tone): Poly {
  return { t, p: [cx, cy - r, cx + r * 0.3, cy - r * 0.3, cx + r, cy, cx + r * 0.3, cy + r * 0.3, cx, cy + r, cx - r * 0.3, cy + r * 0.3, cx - r, cy, cx - r * 0.3, cy - r * 0.3] };
}

export interface SettingLayer {
  /** 0 = furthest back. Paper styles fold each layer up separately. */
  depth: number;
  polys: Poly[];
}

export const SETTING_LAYERS: Record<Setting, SettingLayer[]> = {
  none: [],
  sea: [
    { depth: 0, polys: [waveBand(70, 5, 12, 1)] },
    { depth: 1, polys: [waveBand(80, 5, 14, 2)] },
    { depth: 2, polys: [waveBand(90, 4, 10, 1)] },
  ],
  land: [
    { depth: 0, polys: [hill(76, 10, 1.3, 0.3, 1)] },
    { depth: 1, polys: [hill(88, 7, 2, 2, 2)] },
  ],
  city: [
    { depth: 0, polys: skyline(92, 7, 20, 40, 1) },
    { depth: 1, polys: skyline(100, 3, 6, 16, 2) },
  ],
  sky: [
    { depth: 0, polys: [...ngon(30, 22, 9, 8, [0]), ...ngon(42, 20, 12, 8, [0]), ...ngon(54, 24, 8, 8, [0])] },
    { depth: 1, polys: [...ngon(150, 34, 8, 8, [0]), ...ngon(162, 30, 11, 8, [0]), ...ngon(174, 35, 7, 8, [0])] },
    { depth: 2, polys: [hill(96, 5, 3, 1, 0)] },
  ],
  space: [
    {
      depth: 0,
      polys: [
        sparkle(14, 12, 3, 0), sparkle(40, 30, 2, 3), sparkle(70, 10, 2.5, 0), sparkle(96, 26, 2, 0), sparkle(124, 8, 3, 3),
        sparkle(150, 44, 2, 0), sparkle(26, 58, 2, 0), sparkle(186, 60, 3, 0), sparkle(110, 52, 2, 3), sparkle(60, 70, 2.5, 0),
      ],
    },
    { depth: 1, polys: [...ngon(176, 22, 14, 10, [3, 4]), ...thick([154, 28, 198, 16], 2.5, 0)] },
  ],
};

// ---- composition -----------------------------------------------------------------

export interface PlacedMotif {
  def: MotifDef;
  role: 'hero' | 'support';
  motion: Motion;
  /** Top-left corner and size of the 100x100 motif box, in region pixels. */
  x: number;
  y: number;
  size: number;
}

/**
 * Arrange up to three motifs in a region: the hero large in the middle, supports
 * smaller in the corners. Ground motifs stand on the horizon, sky motifs float.
 */
export function layoutMotifs(
  motifs: { motif: string; role: 'hero' | 'support'; motion: Motion }[],
  w: number,
  h: number,
  setting: Setting,
): PlacedMotif[] {
  const groundY = setting === 'sea' ? h * 0.86 : setting === 'land' || setting === 'city' ? h * 0.9 : h * 0.94;
  const placed: PlacedMotif[] = [];
  const resolved = motifs
    .map((m) => ({ ...m, def: getMotif(m.motif) }))
    .filter((m): m is typeof m & { def: MotifDef } => !!m.def);
  const hero = resolved.find((m) => m.role === 'hero') ?? resolved[0];
  if (!hero) return placed;
  const supports = resolved.filter((m) => m !== hero).slice(0, 2);
  const s = Math.min(w * 0.64, h * 0.62);
  const heroSky = hero.def.place === 'sky';
  placed.push({
    def: hero.def, role: 'hero', motion: hero.motion, size: s,
    x: w / 2 - s / 2,
    y: heroSky ? h * 0.44 - s / 2 : groundY - s,
  });
  const ss = s * 0.44;
  const slots = {
    sky: [
      { x: w * 0.95 - ss, y: h * 0.04 },
      { x: w * 0.05, y: h * 0.08 },
    ],
    ground: [
      { x: w * 0.02, y: groundY - ss },
      { x: w * 0.98 - ss, y: groundY - ss },
    ],
  };
  for (const sup of supports) {
    const pool = slots[sup.def.place].length ? slots[sup.def.place] : slots[sup.def.place === 'sky' ? 'ground' : 'sky'];
    const slot = pool.shift()!;
    placed.push({ def: sup.def, role: 'support', motion: sup.motion, size: ss, x: slot.x, y: slot.y });
  }
  return placed;
}

/** SVG path data for a polygon placed at (x, y) scaled by size/100. */
export function polyPath(poly: Poly, x: number, y: number, size: number, closeOverride?: boolean): string {
  const k = size / 100;
  const p = poly.p;
  let d = '';
  for (let i = 0; i < p.length; i += 2) d += `${i ? 'L' : 'M'}${r1(x + p[i] * k)} ${r1(y + p[i + 1] * k)}`;
  const close = closeOverride ?? !poly.open;
  return close ? d + 'Z' : d;
}
