// Scene plans: validation of AI output, plus an offline planner and story writer that
// work without an API key (keyword matching against the motif library).

import { MOTIFS, MOTIF_IDS, getMotif } from './motifs.ts';
import {
  KINETIC_MOTIONS, MOODS, MOTIONS, SETTINGS,
  type KineticLine, type KineticMotion, type Mood, type Motion, type PlanMotif,
  type ScenePlan, type Setting, type SlideContent,
} from './types.ts';

// ---- text helpers ----------------------------------------------------------------

export function tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z']*/g) ?? [];
}

function matchesKeyword(tokenList: string[], text: string, kw: string): number {
  if (kw.includes(' ')) return text.includes(kw) ? 1 : 0;
  let n = 0;
  for (const t of tokenList) {
    if (t === kw || t === kw + 's' || t === kw + 'es' || (kw.length >= 5 && t.startsWith(kw))) n++;
  }
  return n;
}

function firstIndex(tokenList: string[], kw: string): number {
  const i = tokenList.findIndex((t) => t === kw || t === kw + 's' || (kw.length >= 5 && t.startsWith(kw)));
  return i < 0 ? Infinity : i;
}

export function slideText(s: SlideContent): string {
  return [s.title, s.subtitle, ...s.bullets].join(' ');
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:\s]+$/, '') + '…';
}

function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

// ---- sanitising (AI output, loaded files) -----------------------------------------

const asString = (v: unknown, max: number) => (typeof v === 'string' ? clip(v, max) : '');
const oneOf = <T extends string>(v: unknown, list: readonly T[], dflt: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : dflt;

function pickEmphasis(text: string): string {
  const words = text.match(/[\p{L}\p{N}%$€£'-]+/gu) ?? [];
  return words.reduce((best, w) => (w.length > best.length ? w : best), '');
}

export function sanitizePlan(raw: unknown, fallback: ScenePlan): ScenePlan {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const motifs: PlanMotif[] = [];
  if (Array.isArray(r.motifs)) {
    for (const m of r.motifs) {
      if (!m || typeof m !== 'object') continue;
      const mm = m as Record<string, unknown>;
      if (typeof mm.motif !== 'string' || !MOTIF_IDS.includes(mm.motif)) continue;
      if (motifs.some((x) => x.motif === mm.motif)) continue;
      motifs.push({
        motif: mm.motif,
        role: mm.role === 'hero' ? 'hero' : 'support',
        motion: oneOf<Motion>(mm.motion, MOTIONS, getMotif(mm.motif)!.motion),
      });
      if (motifs.length === 3) break;
    }
  }
  if (!motifs.length) motifs.push(...fallback.motifs);
  const heroIdx = Math.max(0, motifs.findIndex((m) => m.role === 'hero'));
  motifs.forEach((m, i) => (m.role = i === heroIdx ? 'hero' : 'support'));

  const kinetic: KineticLine[] = [];
  if (Array.isArray(r.kinetic)) {
    r.kinetic.forEach((l, i) => {
      if (!l || typeof l !== 'object' || kinetic.length >= 4) return;
      const ll = l as Record<string, unknown>;
      const text = asString(ll.text, 48);
      if (!text) return;
      let emphasis = asString(ll.emphasis, 48);
      if (!emphasis || !text.toLowerCase().includes(emphasis.toLowerCase())) emphasis = pickEmphasis(text);
      kinetic.push({ text, emphasis, motion: oneOf<KineticMotion>(ll.motion, KINETIC_MOTIONS, KINETIC_MOTIONS[i % 5]) });
    });
  }

  return {
    mood: oneOf<Mood>(r.mood, MOODS, fallback.mood),
    setting: oneOf<Setting>(r.setting, SETTINGS, fallback.setting),
    motifs,
    narration: asString(r.narration, 200) || fallback.narration,
    kinetic: kinetic.length ? kinetic : fallback.kinetic,
  };
}

// ---- offline planner ----------------------------------------------------------------

const MOOD_WORDS: Record<Exclude<Mood, 'neutral'>, string[]> = {
  tense: ['storm', 'problem', 'risk', 'danger', 'fail', 'failure', 'lost', 'crisis', 'struggle', 'broken', 'pain', 'threat', 'dark', 'fear', 'waste', 'stuck', 'slow', 'hard', 'chaos', 'trouble', 'rough'],
  hopeful: ['dawn', 'hope', 'begin', 'beginning', 'new', 'start', 'first', 'light', 'idea', 'seed', 'sprout', 'opportunity', 'imagine', 'possible', 'sunrise', 'promise'],
  triumphant: ['win', 'success', 'achieve', 'goal', 'summit', 'celebrate', 'victory', 'record', 'growth', 'doubled', 'result', 'results', 'milestone', 'proud', 'reward', 'trophy'],
  calm: ['calm', 'steady', 'stable', 'peace', 'simple', 'balance', 'clear', 'gentle', 'quiet', 'trust', 'safe', 'together'],
  mysterious: ['mystery', 'unknown', 'night', 'secret', 'hidden', 'question', 'why', 'curious', 'discover', 'explore', 'moon', 'deep'],
  energetic: ['fast', 'launch', 'rocket', 'energy', 'rush', 'speed', 'boost', 'accelerate', 'scale', 'now', 'go', 'momentum', 'race'],
};

function detectMood(story: string, slide: string, index: number, total: number): Mood {
  const st = tokens(story);
  const sl = tokens(slide);
  let best: Mood = 'neutral';
  let bestScore = 0;
  for (const [mood, words] of Object.entries(MOOD_WORDS) as [Mood, string[]][]) {
    const score = words.reduce((n, w) => n + 2 * matchesKeyword(st, story, w) + matchesKeyword(sl, slide, w), 0);
    if (score > bestScore) [best, bestScore] = [mood, score];
  }
  if (bestScore) return best;
  if (index === 0) return 'hopeful';
  if (index === total - 1 && total > 1) return 'triumphant';
  return 'calm';
}

const SETTING_HINTS: [Setting, string[]][] = [
  ['sea', ['sea', 'ocean', 'wave', 'waves', 'boat', 'ship', 'sail', 'harbor', 'harbour', 'shore', 'voyage', 'island', 'fish', 'lighthouse', 'tide']],
  ['space', ['space', 'rocket', 'planet', 'stars', 'orbit', 'galaxy', 'moon', 'universe', 'astronaut']],
  ['city', ['city', 'street', 'building', 'buildings', 'office', 'downtown', 'urban', 'skyline']],
  ['sky', ['sky', 'fly', 'flying', 'bird', 'birds', 'cloud', 'clouds', 'wind', 'air', 'soar', 'plane']],
  ['land', ['road', 'path', 'mountain', 'hill', 'hills', 'field', 'garden', 'tree', 'forest', 'seed', 'land', 'ground', 'valley', 'farm', 'climb']],
];

function detectSetting(story: string, slide: string, heroId: string): Setting {
  const text = `${story} ${slide}`.toLowerCase();
  const tk = tokens(text);
  let best: Setting = 'none';
  let bestScore = 0;
  for (const [setting, words] of SETTING_HINTS) {
    const score = words.reduce((n, w) => n + matchesKeyword(tk, text, w), 0);
    if (score > bestScore) [best, bestScore] = [setting, score];
  }
  if (bestScore) return best;
  const place = getMotif(heroId)?.place;
  return place === 'sky' ? 'sky' : 'land';
}

function scoreMotifs(story: string, slide: string): { id: string; score: number; first: number }[] {
  const st = tokens(story);
  const sl = tokens(slide);
  const storyLc = story.toLowerCase();
  const slideLc = slide.toLowerCase();
  return MOTIFS.map((m) => {
    let score = 0;
    let first = Infinity;
    for (const kw of m.keywords) {
      score += 2 * matchesKeyword(st, storyLc, kw) + matchesKeyword(sl, slideLc, kw);
      first = Math.min(first, firstIndex(st, kw));
    }
    return { id: m.id, score, first };
  })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.first - b.first);
}

const ARC_DEFAULTS: Record<'start' | 'middle' | 'end', string[]> = {
  start: ['sprout', 'sun'],
  middle: ['road', 'gear'],
  end: ['summit', 'star'],
};

const KINETIC_CYCLE: KineticMotion[] = ['slam', 'rise', 'slide', 'zoom', 'drop'];

/** Split a story into two to four short punchy lines for kinetic typography. */
export function kineticLines(story: string, fallbackText: string, motifWords: string[]): KineticLine[] {
  const source = story.trim() || fallbackText;
  const chunks: string[] = [];
  for (const sentence of sentences(source)) {
    for (const part of sentence.split(/[,;:—–]\s*|\s-\s/)) {
      const words = part.replace(/[.!?]+$/, '').trim().split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length; i += 6) {
        const chunk = words.slice(i, i + 6).join(' ');
        if (chunk) chunks.push(chunk);
      }
    }
  }
  const picked = chunks.slice(0, 3);
  if (picked.length < 2 && fallbackText && !picked.includes(fallbackText)) picked.push(clip(fallbackText, 40));
  return picked.map((text, i) => {
    const words = text.match(/[\p{L}\p{N}%$€£'-]+/gu) ?? [];
    const hit = words.find((w) => motifWords.includes(w.toLowerCase()));
    return { text: clip(text, 48), emphasis: hit ?? pickEmphasis(text), motion: KINETIC_CYCLE[i % KINETIC_CYCLE.length] };
  });
}

export function offlinePlan(slide: SlideContent, story: string, index: number, total: number): ScenePlan {
  const sText = slideText(slide);
  const scored = scoreMotifs(story, sText);
  const arc = index === 0 ? 'start' : index === total - 1 && total > 1 ? 'end' : 'middle';
  // The hero is the best match; supports must come from the story or repeat in the slide.
  const ids = scored.filter((m, i) => i === 0 || m.score >= 2).map((m) => m.id);
  for (const d of ARC_DEFAULTS[arc]) if (ids.length < 2 && !ids.includes(d)) ids.push(d);
  const chosen = ids.slice(0, 3);
  const motifs: PlanMotif[] = chosen.map((id, i) => ({ motif: id, role: i === 0 ? 'hero' : 'support', motion: getMotif(id)!.motion }));
  const motifWords = chosen.flatMap((id) => getMotif(id)!.keywords);
  const narration = clip(sentences(story)[0] ?? (slide.subtitle || slide.title), 200);
  return {
    mood: detectMood(story, sText, index, total),
    setting: detectSetting(story, sText, chosen[0]),
    motifs,
    narration,
    kinetic: kineticLines(story, slide.title, motifWords),
  };
}

// ---- offline story writer ---------------------------------------------------------------

type Intent = 'opening' | 'problem' | 'solution' | 'growth' | 'team' | 'future' | 'other';

const INTENT_WORDS: [Intent, string[]][] = [
  ['problem', ['problem', 'problems', 'challenge', 'challenges', 'risk', 'risks', 'pain', 'issue', 'issues', 'broken', 'slow', 'cost', 'costs', 'waste', 'struggle', 'why']],
  ['solution', ['solution', 'idea', 'product', 'how', 'approach', 'introducing', 'meet', 'platform', 'answer', 'fix', 'feature', 'features', 'works']],
  ['growth', ['growth', 'traction', 'results', 'revenue', 'users', 'customers', 'sales', 'increase', 'grew', 'doubled', 'metrics', 'numbers', 'market']],
  ['team', ['team', 'people', 'founders', 'about us', 'who', 'hiring', 'culture', 'partners']],
  ['future', ['next', 'future', 'roadmap', 'ask', 'plan', 'vision', 'goal', 'goals', 'thank', 'thanks', 'join', 'invest', 'contact', 'summary', 'conclusion']],
];

function detectIntent(slide: SlideContent, index: number, total: number): Intent {
  if (index === 0) return 'opening';
  const text = slideText(slide).toLowerCase();
  const tk = tokens(text);
  let best: Intent = 'other';
  let bestScore = 0;
  for (const [intent, words] of INTENT_WORDS) {
    const score = words.reduce((n, w) => n + matchesKeyword(tk, text, w), 0);
    if (score > bestScore) [best, bestScore] = [intent, score];
  }
  if (!bestScore && index === total - 1) return 'future';
  return best;
}

const METAPHORS: Record<'voyage' | 'garden' | 'climb', Record<Intent, string>> = {
  voyage: {
    opening: 'A small boat waits in the harbour at dawn, sails folded, ready for the voyage.',
    problem: 'Dark clouds gather and the sea turns rough. The little boat is tossed off course.',
    solution: 'A lighthouse beam cuts through the storm and shows the way home.',
    growth: 'The wind fills the sails, the sun breaks through, and more boats follow in its wake.',
    team: 'Every hand on deck pulls the same rope, and the boat sails faster together.',
    future: 'The horizon opens wide. A brand-new voyage begins under a bright sky.',
    other: 'The boat sails on across calm water, steady and sure.',
  },
  garden: {
    opening: 'A single seed rests in the soil, waiting for its first morning sun.',
    problem: 'A storm rolls over the field and the young sprout bends in the wind.',
    solution: 'The rain passes, the sun returns, and the sprout finds its light.',
    growth: 'Leaves unfold, branches spread, and a small forest begins to grow.',
    team: 'Tree beside tree, roots intertwined, the forest stands stronger together.',
    future: 'The garden keeps growing toward a wide, bright sky.',
    other: 'The garden grows quietly, season after season.',
  },
  climb: {
    opening: 'A long road starts at the foot of the mountain, the summit hidden in clouds.',
    problem: 'The path turns steep and a storm rolls over the ridge.',
    solution: 'A key unlocks a hidden trail, and the way up becomes clear.',
    growth: 'Step after step, the climb speeds up and the summit comes into view.',
    team: 'Roped together, the team climbs as one.',
    future: 'At the top, a flag flies, and a new horizon stretches ahead.',
    other: 'The road winds on, higher with every step.',
  },
};

/** Write one story line per slide using a single metaphor for the whole deck. */
export function offlineStories(slides: SlideContent[]): string[] {
  const all = slides.map(slideText).join(' ').toLowerCase();
  const tk = tokens(all);
  const count = (words: string[]) => words.reduce((n, w) => n + matchesKeyword(tk, all, w), 0);
  const scores = {
    voyage: count(['sea', 'boat', 'ship', 'navigate', 'voyage', 'journey', 'course', 'harbor', 'harbour', 'storm']),
    garden: count(['grow', 'growth', 'growing', 'seed', 'nature', 'plant', 'green', 'sustainable', 'roots', 'nurture']),
    climb: count(['goal', 'goals', 'climb', 'challenge', 'mountain', 'peak', 'summit', 'road', 'roadmap', 'path', 'step', 'steps']),
  };
  const metaphor = (Object.entries(scores) as [keyof typeof METAPHORS, number][]).sort((a, b) => b[1] - a[1])[0];
  const set = METAPHORS[metaphor[1] > 0 ? metaphor[0] : 'voyage'];
  return slides.map((s, i) => set[detectIntent(s, i, slides.length)]);
}

/** Light tidy-up of slide text, used when no AI is available. */
export function offlinePolish(slide: SlideContent): SlideContent {
  const tidy = (t: string) => {
    const s = t.replace(/\s+/g, ' ').replace(/^[-*•·\s]+/, '').trim();
    return s ? s[0].toUpperCase() + s.slice(1) : s;
  };
  const bullets = slide.bullets.map(tidy).filter(Boolean).map((b) => b.replace(/[.;,]+$/, ''));
  let layout = slide.layout;
  if (!bullets.length && layout === 'bullets') layout = slide.subtitle ? 'title' : 'statement';
  if (/^[^\s]{0,3}[\d.,]+\s*[%xkKmMbB+]?$/.test(slide.title.trim()) && !bullets.length) layout = 'stat';
  return { layout, title: tidy(slide.title), subtitle: tidy(slide.subtitle), bullets: bullets.slice(0, 6) };
}
