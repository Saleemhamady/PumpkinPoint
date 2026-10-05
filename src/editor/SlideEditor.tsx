// The slide editor: a canvas where text, pictures and shapes can be placed anywhere,
// moved, resized, rotated and edited in place, with a properties panel beside it.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { bounds, newImage, newShape, newText, relayout, storyRegion, uid } from '../shared/elements.ts';
import type { Theme } from '../shared/theme.ts';
import {
  CANVAS_H, CANVAS_W, LAYOUTS, SHAPE_KINDS,
  type Deck, type Layout, type ShapeKind, type Slide, type SlideElement, type TextElement,
} from '../shared/types.ts';
import { renderElement, textStyle } from '../runtime/elements.ts';
import { LAYOUT_LABELS, SHAPE_ICONS, StaticSlide } from './components.tsx';
import { reorder, resizeBox, snapMove, union, type Guides } from './geometry.ts';
import { processImage } from './images.ts';
import { Inspector } from './Inspector.tsx';
import type { Action, History } from './state.ts';

/** Elements copied with Ctrl+C, shared across slides. */
let clipboard: SlideElement[] = [];

type Drag =
  | { kind: 'move'; start: [number, number]; origin: SlideElement[]; moved: boolean }
  | { kind: 'resize'; start: [number, number]; origin: SlideElement; sx: number; sy: number; moved: boolean }
  | { kind: 'rotate'; origin: SlideElement; moved: boolean };

const HANDLES: [number, number][] = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

export interface SlideEditorProps {
  deck: Deck;
  index: number;
  themes: Theme[];
  ai: boolean;
  canUndo: boolean;
  canRedo: boolean;
  dispatch: (a: Action) => void;
  onIndex: (i: number) => void;
  onClose: () => void;
  onPolish: (slide: Slide) => void;
  busy: string | null;
  notify: (text: string, error?: boolean) => void;
}

export function SlideEditor(props: SlideEditorProps) {
  const { deck, index, themes, dispatch } = props;
  const slide = deck.slides[index];
  const theme = themes[index];
  const elements = slide.elements;
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] });
  const [showStory, setShowStory] = useState(true);
  const [shapeMenu, setShapeMenu] = useState(false);
  const [layoutMenu, setLayoutMenu] = useState(false);
  const [k, setK] = useState(0.6);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<Drag | null>(null);
  const nodes = useRef(new Map<string, { el: SlideElement; node: HTMLElement; theme: Theme }>());
  const latest = useRef(elements);
  latest.current = elements;

  const setElements = useCallback(
    (next: SlideElement[], history: History = 'push', key?: string) => dispatch({ type: 'set-elements', id: slide.id, elements: next, history, key }),
    [dispatch, slide.id],
  );
  const patch = useCallback(
    (id: string, change: Partial<SlideElement>, history: History = 'coalesce', key = `${id}:${Object.keys(change).join(',')}`) =>
      setElements(latest.current.map((e) => (e.id === id ? ({ ...e, ...change } as SlideElement) : e)), history, key),
    [setElements],
  );

  // New slide, new selection.
  useEffect(() => {
    setSelected([]);
    setEditing(null);
  }, [slide.id]);
  // Forget selected ids that no longer exist (undo, delete).
  useEffect(() => {
    setSelected((sel) => (sel.every((id) => elements.some((e) => e.id === id)) ? sel : sel.filter((id) => elements.some((e) => e.id === id))));
    if (editing && !elements.some((e) => e.id === editing)) setEditing(null);
  }, [elements, editing]);

  // Fit the 1600x900 canvas into the available space.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const fit = () => {
      const cs = getComputedStyle(wrap);
      const w = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setK(Math.max(0.15, Math.min(w / CANVAS_W, h / CANVAS_H)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Draw the elements with the presentation's own renderer, reusing unchanged nodes.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const cache = nodes.current;
    const seen = new Set<string>();
    elements.forEach((el, i) => {
      seen.add(el.id);
      let entry = cache.get(el.id);
      if (!entry || entry.el !== el || entry.theme !== theme) {
        const node = renderElement(el, theme, null);
        if (entry) entry.node.replaceWith(node);
        entry = { el, node, theme };
        cache.set(el.id, entry);
      }
      entry.node.style.visibility = el.id === editing ? 'hidden' : '';
      if (host.children[i] !== entry.node) host.insertBefore(entry.node, host.children[i] ?? null);
    });
    for (const [id, entry] of cache) {
      if (!seen.has(id)) {
        entry.node.remove();
        cache.delete(id);
      }
    }
    // Text boxes grow to fit their text.
    for (const el of elements) {
      if (el.type !== 'text') continue;
      const inner = cache.get(el.id)?.node.querySelector<HTMLElement>('.pp-words');
      if (inner && inner.offsetHeight > el.h + 2 && (el.id === editing || selected.includes(el.id))) {
        patch(el.id, { h: Math.ceil(inner.offsetHeight + 4) }, 'none');
      }
    }
  }, [elements, theme, editing, selected, patch]);

  // ---- pointer gestures -----------------------------------------------------------------

  const toCanvas = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / k, (e.clientY - r.top) / k];
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('textarea')) return;
    const pt = toCanvas(e);
    const handle = target.closest<HTMLElement>('[data-handle]');
    if (handle && selected.length === 1) {
      const origin = elements.find((x) => x.id === selected[0])!;
      if (handle.dataset.handle === 'rotate') drag.current = { kind: 'rotate', origin, moved: false };
      else {
        const [sx, sy] = handle.dataset.handle!.split(',').map(Number);
        drag.current = { kind: 'resize', start: pt, origin, sx, sy, moved: false };
      }
      canvasRef.current!.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    const hit = target.closest<HTMLElement>('.pp-el');
    const id = hit?.dataset.id;
    if (!id) {
      setSelected([]);
      setEditing(null);
      return;
    }
    let sel = selected;
    if (e.shiftKey) sel = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
    else if (!selected.includes(id)) sel = [id];
    setSelected(sel);
    if (editing && editing !== id) setEditing(null);
    if (!sel.includes(id)) return;
    drag.current = { kind: 'move', start: pt, origin: elements.filter((x) => sel.includes(x.id)), moved: false };
    canvasRef.current!.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const [px, py] = toCanvas(e);
    if (d.kind === 'move') {
      let dx = px - d.start[0];
      let dy = py - d.start[1];
      if (!d.moved) {
        if (Math.hypot(dx, dy) * k < 3) return;
        d.moved = true;
        dispatch({ type: 'checkpoint' });
      }
      let g: Guides = { x: [], y: [] };
      if (!e.altKey) {
        const ids = d.origin.map((o) => o.id);
        const box = union(d.origin.map((o) => bounds({ ...o, x: o.x + dx, y: o.y + dy })));
        const snap = snapMove(box, latest.current.filter((x) => !ids.includes(x.id)), 7 / k);
        dx += snap.dx;
        dy += snap.dy;
        g = snap.guides;
      }
      setGuides(g);
      const moved = new Map(d.origin.map((o) => [o.id, { x: Math.round(o.x + dx), y: Math.round(o.y + dy) }]));
      setElements(latest.current.map((x) => (moved.has(x.id) ? ({ ...x, ...moved.get(x.id) } as SlideElement) : x)), 'none');
    } else if (!d.moved) {
      // The undo step for a resize or rotation starts with the first movement.
      d.moved = true;
      dispatch({ type: 'checkpoint' });
    }
    if (d.kind === 'move') return;
    if (d.kind === 'resize') {
      const keep = e.shiftKey || (d.origin.type === 'image' && !e.altKey);
      const next = resizeBox(d.origin, d.sx, d.sy, px - d.start[0], py - d.start[1], keep);
      setElements(latest.current.map((x) => (x.id === next.id ? next : x)), 'none');
    } else {
      const o = d.origin;
      let deg = (Math.atan2(py - (o.y + o.h / 2), px - (o.x + o.w / 2)) * 180) / Math.PI + 90;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      else for (const a of [0, 90, 180, 270, 360, -90, -180]) if (Math.abs(deg - a) < 4) deg = a;
      deg = ((Math.round(deg) % 360) + 360) % 360;
      setElements(latest.current.map((x) => (x.id === o.id ? ({ ...x, rotation: deg > 180 ? deg - 360 : deg } as SlideElement) : x)), 'none');
    }
  };

  const onPointerUp = () => {
    drag.current = null;
    setGuides({ x: [], y: [] });
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    // Pointer capture retargets the double-click to the canvas, so hit-test the point.
    const hit = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList.contains('pp-el') && hostRef.current?.contains(n));
    const id = (hit as HTMLElement | undefined)?.dataset.id;
    const el = elements.find((x) => x.id === id);
    if (el?.type === 'text') {
      setSelected([el.id]);
      setEditing(el.id);
    }
  };

  // ---- adding things ----------------------------------------------------------------------

  /** Put a new element in the middle, cascading if something already sits there. */
  const insert = (el: SlideElement, at?: [number, number]) => {
    let { x, y } = at ? { x: at[0] - el.w / 2, y: at[1] - el.h / 2 } : { x: (CANVAS_W - el.w) / 2, y: (CANVAS_H - el.h) / 2 };
    while (!at && elements.some((o) => Math.abs(o.x - x) < 4 && Math.abs(o.y - y) < 4)) {
      x += 30;
      y += 30;
    }
    const placed = { ...el, x: Math.round(x), y: Math.round(y) } as SlideElement;
    setElements([...elements, placed]);
    setSelected([placed.id]);
    return placed;
  };

  const addText = () => {
    const el = insert(newText({ text: 'Your text', w: 640, h: 80, size: 48 }));
    setEditing(el.id);
  };

  const addShape = (kind: ShapeKind) => {
    setShapeMenu(false);
    insert(newShape(kind));
  };

  const addImages = async (files: File[], at?: [number, number]) => {
    for (const file of files) {
      try {
        const img = await processImage(file);
        const el = newImage(img.src, img.width, img.height, { alt: file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ') });
        insert(el, at);
      } catch (err) {
        props.notify(err instanceof Error ? err.message : String(err), true);
      }
    }
  };

  // ---- keyboard, clipboard, drop ---------------------------------------------------------------

  const remove = (ids: string[]) => {
    setElements(elements.filter((x) => !ids.includes(x.id)));
    setSelected([]);
    setEditing(null);
  };

  const duplicate = (ids: string[]) => {
    const copies = elements.filter((x) => ids.includes(x.id)).map((x) => ({ ...x, id: uid(), x: x.x + 24, y: x.y + 24 }));
    setElements([...elements, ...copies]);
    setSelected(copies.map((c) => c.id));
  };

  useEffect(() => {
    const typing = () => {
      const a = document.activeElement;
      return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement || (a as HTMLElement | null)?.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') {
        if (editing) setEditing(null);
        else if (selected.length) setSelected([]);
        else props.onClose();
        return;
      }
      if (typing()) return;
      if (e.key === 'PageDown' || (mod && e.key === 'ArrowDown')) {
        e.preventDefault();
        if (index < deck.slides.length - 1) props.onIndex(index + 1);
        return;
      }
      if (e.key === 'PageUp' || (mod && e.key === 'ArrowUp')) {
        e.preventDefault();
        if (index > 0) props.onIndex(index - 1);
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelected(elements.map((x) => x.id));
        return;
      }
      if (!selected.length) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove(selected);
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicate(selected);
      } else if (mod && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x')) {
        clipboard = elements.filter((x) => selected.includes(x.id));
        if (e.key.toLowerCase() === 'x') remove(selected);
      } else if (e.key === 'Enter' && selected.length === 1) {
        const el = elements.find((x) => x.id === selected[0]);
        if (el?.type === 'text') {
          e.preventDefault();
          setEditing(el.id);
        }
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        setElements(elements.map((x) => (selected.includes(x.id) ? ({ ...x, x: x.x + dx, y: x.y + dy } as SlideElement) : x)), 'coalesce', `nudge:${selected.join()}`);
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      if (typing()) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        addImages(files);
      } else if (clipboard.length) {
        e.preventDefault();
        const copies = clipboard.map((x) => ({ ...x, id: uid(), x: x.x + 24, y: x.y + 24 }));
        clipboard = copies;
        setElements([...elements, ...copies]);
        setSelected(copies.map((c) => c.id));
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  });

  const onDrop = (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    addImages(files, toCanvas(e));
  };

  // ---- render --------------------------------------------------------------------------------

  const region = useMemo(() => storyRegion(elements), [elements]);
  const single = selected.length === 1 ? elements.find((x) => x.id === selected[0]) ?? null : null;
  const editingEl = elements.find((x) => x.id === editing && x.type === 'text') as TextElement | undefined;
  const inv = 1 / k;

  return (
    <div className="editor" role="dialog" aria-modal="true" aria-label={`Edit slide ${index + 1}`}>
      <header className="ed-head">
        <button className="btn ghost" onClick={props.onClose}>← Back to deck</button>
        <span className="ed-title">
          Slide {index + 1} of {deck.slides.length}
        </span>
        <button className="icon" disabled={index === 0} onClick={() => props.onIndex(index - 1)} aria-label="Previous slide" title="Previous slide (Page Up)">‹</button>
        <button className="icon" disabled={index === deck.slides.length - 1} onClick={() => props.onIndex(index + 1)} aria-label="Next slide" title="Next slide (Page Down)">›</button>
        <span className="spacer" />
        <button className="btn ghost" disabled={!props.canUndo} onClick={() => dispatch({ type: 'undo' })} title="Undo (Ctrl+Z)">Undo</button>
        <button className="btn ghost" disabled={!props.canRedo} onClick={() => dispatch({ type: 'redo' })} title="Redo (Ctrl+Shift+Z)">Redo</button>
        <button className="btn primary" onClick={props.onClose}>Done</button>
      </header>

      <div className="ed-tools">
        <button className="btn" onClick={addText}>T&nbsp; Text</button>
        <div className="menu-wrap">
          <button className="btn" onClick={() => setShapeMenu((v) => !v)} aria-expanded={shapeMenu}>◆&nbsp; Shape ▾</button>
          {shapeMenu && (
            <div className="menu shapes" role="menu">
              {SHAPE_KINDS.map((kind) => (
                <button key={kind} className="shape-pick" role="menuitem" onClick={() => addShape(kind)} title={kind}>
                  {SHAPE_ICONS[kind]}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn" onClick={() => fileRef.current?.click()}>▣&nbsp; Picture</button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => {
          addImages(Array.from(e.target.files ?? []));
          e.target.value = '';
        }} />
        <span className="sep" />
        <div className="menu-wrap">
          <button className="btn" onClick={() => setLayoutMenu((v) => !v)} aria-expanded={layoutMenu} title="Re-arrange this slide's text with a template">Arrange text ▾</button>
          {layoutMenu && (
            <div className="menu" role="menu">
              {LAYOUTS.map((l: Layout) => (
                <button key={l} role="menuitem" onClick={() => {
                  setLayoutMenu(false);
                  setElements(relayout(elements, l));
                }}>
                  {LAYOUT_LABELS[l]}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn" disabled={!!props.busy} onClick={() => props.onPolish(slide)} title={props.ai ? 'Let AI tighten the wording' : 'Tidy up the wording (offline)'}>✨ Polish wording</button>
        <span className="spacer" />
        <label className="toggle">
          <input type="checkbox" checked={showStory} onChange={(e) => setShowStory(e.target.checked)} />
          Show story area
        </label>
      </div>

      <div className="ed-body">
        <nav className="ed-strip" aria-label="Slides">
          {deck.slides.map((s, i) => (
            <button key={s.id} className={`strip-item ${i === index ? 'active' : ''}`} onClick={() => props.onIndex(i)} aria-label={`Slide ${i + 1}`}>
              <span>{i + 1}</span>
              <StaticSlide elements={s.elements} theme={themes[i]} width={132} />
            </button>
          ))}
        </nav>

        <div className="ed-canvas-wrap" ref={wrapRef}>
          <div
            ref={canvasRef}
            className="ed-canvas"
            style={{ width: CANVAS_W * k, height: CANVAS_H * k }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onDoubleClick}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            <div className="ed-stage" style={{ transform: `scale(${k})`, background: theme.background }}>
              {theme.style === 'book' && <div className="ed-spine" title="The book's spine: the slide is split across two pages here" />}
              {showStory && (region ? (
                <div className="ed-story" style={{ left: region.x, top: region.y, width: region.w, height: region.h, borderWidth: 2 * inv }}>
                  <span style={{ fontSize: 13 * inv }}>The story is drawn here</span>
                </div>
              ) : (
                <div className="ed-story-full" style={{ fontSize: 13 * inv }}>No free space: the story will be drawn faintly behind the slide</div>
              ))}
              <div ref={hostRef} className="ed-elements" />
              {guides.x.map((x) => <div key={`gx${x}`} className="ed-guide" style={{ left: x, top: 0, width: inv, height: CANVAS_H }} />)}
              {guides.y.map((y) => <div key={`gy${y}`} className="ed-guide" style={{ top: y, left: 0, height: inv, width: CANVAS_W }} />)}
              {selected.map((id) => {
                const el = elements.find((x) => x.id === id);
                if (!el) return null;
                return (
                  <div key={id} className="ed-sel" style={{ left: el.x, top: el.y, width: el.w, height: el.h, rotate: `${el.rotation}deg`, outlineWidth: 2 * inv, outlineOffset: inv }}>
                    {single && !editing && (
                      <>
                        {HANDLES.map(([sx, sy]) => (
                          <span
                            key={`${sx},${sy}`}
                            data-handle={`${sx},${sy}`}
                            className="ed-handle"
                            style={{ left: `${(sx + 1) * 50}%`, top: `${(sy + 1) * 50}%`, width: 12 * inv, height: 12 * inv, borderWidth: 2 * inv, cursor: cursorFor(sx, sy, el.rotation) }}
                          />
                        ))}
                        <span data-handle="rotate" className="ed-handle rot" style={{ left: '50%', top: -32 * inv, width: 14 * inv, height: 14 * inv, borderWidth: 2 * inv }} title="Rotate (Shift: 15° steps)" />
                      </>
                    )}
                  </div>
                );
              })}
              {editingEl && <TextEditBox el={editingEl} theme={theme} onChange={(text) => patch(editingEl.id, { text }, 'coalesce', `text:${editingEl.id}`)} onDone={() => setEditing(null)} />}
            </div>
          </div>
        </div>

        <Inspector
          elements={elements}
          selected={selected}
          theme={theme}
          onPatch={patch}
          onSet={setElements}
          onSelect={setSelected}
          onEditText={(id) => setEditing(id)}
          onRemove={remove}
          onDuplicate={duplicate}
          onReorder={(move) => setElements(reorder(elements, selected, move))}
          onReplaceImage={async (id, file) => {
            try {
              const img = await processImage(file);
              const el = elements.find((x) => x.id === id);
              if (el?.type !== 'image') return;
              const h = Math.round((el.w * img.height) / img.width);
              patch(id, { src: img.src, h }, 'push');
            } catch (err) {
              props.notify(err instanceof Error ? err.message : String(err), true);
            }
          }}
        />
      </div>

      <footer className="ed-story-bar">
        <label htmlFor="ed-story">Story for this slide</label>
        <textarea
          id="ed-story"
          value={slide.story}
          rows={2}
          placeholder="What happens in the story while this slide is up?"
          onChange={(e) => dispatch({ type: 'update-slide', id: slide.id, patch: { story: e.target.value } })}
        />
      </footer>
    </div>
  );
}

function cursorFor(sx: number, sy: number, rotation: number): string {
  if (!sx && !sy) return 'move';
  const angle = ((Math.atan2(sy, sx) * 180) / Math.PI + rotation + 360) % 180;
  const cursors = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
  return cursors[Math.round(angle / 45) % 4];
}

/** In-place text editing: a textarea laid over the text box, in the same type. */
function TextEditBox({ el, theme, onChange, onDone }: { el: TextElement; theme: Theme; onChange: (text: string) => void; onDone: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    ta.select();
  }, []);
  const style = textStyle(el, theme);
  return (
    <textarea
      ref={ref}
      className="ed-textedit"
      value={el.text}
      spellCheck
      onChange={(e) => onChange(e.target.value)}
      onBlur={onDone}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onDone();
        }
      }}
      style={{
        left: el.x,
        top: el.y,
        width: el.w,
        height: Math.max(el.h, el.size * 1.4),
        rotate: `${el.rotation}deg`,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        color: style.color,
        textAlign: el.align,
        paddingLeft: el.list ? '1.1em' : 0,
      }}
    />
  );
}

