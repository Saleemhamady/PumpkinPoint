// Presentational pieces of the editor.

import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { getMotif } from '../shared/motifs.ts';
import { PAPER } from '../shared/palettes.ts';
import type { Theme } from '../shared/theme.ts';
import { CANVAS_H, CANVAS_W, type Layout, type ScenePlan, type ShapeKind, type SlideElement, type StyleId } from '../shared/types.ts';
import { shapePath } from '../runtime/elements.ts';
import { drawSlide } from './slideView.ts';

export const STYLE_INFO: Record<StyleId, { name: string; blurb: string; icon: ReactNode }> = {
  origami: {
    name: 'Origami',
    blurb: 'Paper figures fold into shape; your slide unfolds like paper.',
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M6 30 L24 12 L24 34 Z" fill="#F6B999" />
        <path d="M24 12 L42 26 L24 34 Z" fill="#E07A4F" />
        <path d="M6 30 L24 34 L18 40 Z" fill="#B85A35" />
      </svg>
    ),
  },
  book: {
    name: 'Pop-up book',
    blurb: 'Pages turn and the story pops up off the page.',
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M4 14 L24 18 L24 40 L4 36 Z" fill="#FBF6EA" stroke="#B89F7E" strokeWidth="1.5" />
        <path d="M44 14 L24 18 L24 40 L44 36 Z" fill="#F3EADB" stroke="#B89F7E" strokeWidth="1.5" />
        <path d="M9 30 L15 18 L21 30 Z" fill="#4F9D8A" />
        <circle cx="16" cy="13" r="3" fill="#F2A65A" />
      </svg>
    ),
  },
  whiteboard: {
    name: 'Whiteboard',
    blurb: 'A marker sketches the story and writes each slide.',
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="4" y="8" width="40" height="30" rx="3" fill="#fff" stroke="#9AA3AD" strokeWidth="1.5" />
        <path d="M10 28 C14 18 18 18 22 26 S30 30 36 16" fill="none" stroke="#2F6FDE" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="31" y="30" width="5" height="14" rx="1.5" transform="rotate(30 33 37)" fill="#2B2B2B" />
      </svg>
    ),
  },
  kinetic: {
    name: 'Kinetic type',
    blurb: 'Bold words tell the story in motion over colour wipes.',
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="2" y="6" width="44" height="36" rx="4" fill="#FFD23F" />
        <text x="8" y="31" fontFamily="Impact, Anton, sans-serif" fontSize="20" fill="#141414">
          AB
        </text>
        <rect x="8" y="34" width="18" height="3" fill="#E4002B" />
      </svg>
    ),
  },
};

export const LAYOUT_LABELS: Record<Layout, string> = {
  title: 'Title',
  bullets: 'Bullets',
  statement: 'Statement',
  stat: 'Big number',
};

/** A slide drawn with the presentation's renderer, scaled to `width`. */
export const StaticSlide = memo(function StaticSlide({ elements, theme, width }: { elements: SlideElement[]; theme: Theme; width: number }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (host.current) drawSlide(host.current, elements, theme);
  }, [elements, theme]);
  const k = width / CANVAS_W;
  return (
    <div className="thumb" style={{ width, height: CANVAS_H * k }}>
      <div ref={host} className="thumb-inner" style={{ transform: `scale(${k})` }} />
    </div>
  );
});

export const SHAPE_ICONS: Record<ShapeKind, ReactNode> = Object.fromEntries(
  (['rect', 'round', 'ellipse', 'triangle', 'diamond', 'star', 'arrow', 'line'] as ShapeKind[]).map((kind) => [
    kind,
    <svg key={kind} viewBox="0 0 40 40" aria-hidden="true">
      <path d={shapePath(kind, 32, kind === 'line' || kind === 'arrow' ? 20 : 32, kind === 'line' ? 0 : 1)} transform={kind === 'line' || kind === 'arrow' ? 'translate(4 10)' : 'translate(4 4)'}
        fill={kind === 'line' ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth={kind === 'line' ? 3 : 0} strokeLinecap="round" />
    </svg>,
  ]),
) as Record<ShapeKind, ReactNode>;

export function PlanChips({ plan }: { plan: ScenePlan }) {
  const pal = PAPER[plan.mood];
  return (
    <div className="plan">
      <span className="chip" title="Mood: drives the background colours">
        <i className="swatch" style={{ background: `linear-gradient(135deg, ${pal.bg}, ${pal.tones[3]})` }} />
        {plan.mood}
      </span>
      {plan.setting !== 'none' && (
        <span className="chip" title="Setting">
          {plan.setting}
        </span>
      )}
      {plan.motifs.map((m) => (
        <span key={m.motif} className={`chip ${m.role === 'hero' ? 'hero' : ''}`} title={`${m.role}, moves: ${m.motion}`}>
          {getMotif(m.motif)?.label.replace(/^(a|an|the) /, '') ?? m.motif}
        </span>
      ))}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input,textarea,button')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Preview({ html, start, onClose, onExport }: { html: string; start: number; onClose: () => void; onExport: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [scene, setScene] = useState(start);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; index?: number } | null;
      if (d?.type === 'pumpkin:scene' && typeof d.index === 'number') setScene(d.index);
      if (d?.type === 'pumpkin:escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('message', onMsg);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('message', onMsg);
    };
  }, [onClose]);
  return (
    <div className="preview">
      <div className="preview-bar">
        <span>
          Preview · scene {scene + 1} · click, arrow keys or a clicker to move · <kbd>Esc</kbd> to close
        </span>
        <span className="spacer" />
        <button className="btn" onClick={onExport}>
          Download HTML
        </button>
        <button className="btn primary" onClick={onClose}>
          Close
        </button>
      </div>
      <iframe
        ref={frame}
        title="Presentation preview"
        // The player reads its first scene from the frame name.
        name={`pp-start:${start}`}
        srcDoc={html}
        onLoad={() => frame.current?.contentWindow?.focus()}
      />
    </div>
  );
}
