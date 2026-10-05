// Where the story illustration goes on a slide: the motifs fill the empty part of the
// slide (so they never cover the author's content), with an optional caption below.

import { storyRegion, type Rect } from '../shared/elements.ts';
import { layoutMotifs, type PlacedMotif } from '../shared/motifs.ts';
import { CANVAS_H, CANVAS_W, type ScenePlan, type SlideElement } from '../shared/types.ts';

export interface StoryLayout {
  /** The area given to the story. */
  region: Rect;
  /** True when the slide had no room: the story is drawn faintly behind everything. */
  ghost: boolean;
  /** Motifs with absolute canvas coordinates. */
  placed: PlacedMotif[];
  caption: Rect | null;
}

export function storyLayout(
  elements: SlideElement[],
  plan: ScenePlan,
  opts: { caption?: boolean; captionAt?: 'top' | 'bottom'; inset?: number } = {},
): StoryLayout {
  const found = storyRegion(elements);
  const ghost = !found;
  const inset = opts.inset ?? 20;
  const base = found ?? { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };
  const region = { x: base.x + inset, y: base.y + inset, w: base.w - inset * 2, h: base.h - inset * 2 };
  let art = region;
  let caption: Rect | null = null;
  if (opts.caption && !ghost && plan.narration && region.h >= 340) {
    const ch = 78;
    if (opts.captionAt === 'top') {
      caption = { x: region.x, y: region.y + 6, w: region.w, h: ch };
      art = { ...region, y: region.y + ch + 10, h: region.h - ch - 10 };
    } else {
      caption = { x: region.x, y: region.y + region.h - ch, w: region.w, h: ch };
      art = { ...region, h: region.h - ch - 10 };
    }
  }
  const placed = layoutMotifs(plan.motifs, art.w, art.h, plan.setting).map((p) => ({ ...p, x: p.x + art.x, y: p.y + art.y }));
  return { region, ghost, placed, caption };
}
