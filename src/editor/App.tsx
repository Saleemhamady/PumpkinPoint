// The PumpkinPoint editor: slides (Layer 1) on the left, the story told during each
// slide (Layer 2) on the right, a style picker, and an incremental build. Clicking a
// slide opens the canvas editor.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { buildDeck, sceneKey } from '../shared/compiler.ts';
import { textsInOrder } from '../shared/elements.ts';
import { offlinePlan } from '../shared/plan.ts';
import { newSlide, sampleDeck } from '../shared/sample.ts';
import { themeFor, type Theme } from '../shared/theme.ts';
import { LAYOUTS, STYLE_IDS, type Deck, type Layout, type Planner, type Project, type ScenePlan, type Slide, type SlideElement } from '../shared/types.ts';
import { ELEMENT_CSS } from '../runtime/elements.ts';
import * as api from './api.ts';
import { Dialog, LAYOUT_LABELS, PlanChips, Preview, STYLE_INFO, Spinner, StaticSlide } from './components.tsx';
import { allFontsCss, download, openInNewTab, presentationHtml, safeFilename } from './exporter.ts';
import { SlideEditor } from './SlideEditor.tsx';
import { printSlides } from './slideView.ts';
import { initialState, normalizeProject, reducer } from './state.ts';
import { loadProject, saveProject } from './storage.ts';

type RowState = { kind: 'building' } | { kind: 'failed'; error: string } | { kind: 'busy'; what: string };

interface BuildSummary {
  reused: number;
  rebuilt: number;
  failed: number;
}

let injected = false;
function injectEditorStyles() {
  if (injected) return;
  injected = true;
  const st = document.createElement('style');
  st.textContent = allFontsCss + ELEMENT_CSS;
  document.head.appendChild(st);
}

/** Loads the saved project, then shows the workspace. */
export function App() {
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  useEffect(() => {
    loadProject().then(setProject, () => setProject(null));
  }, []);
  if (project === undefined) return <div className="loading">Loading…</div>;
  return <Workspace initial={project} />;
}

function Workspace({ initial }: { initial: Project | null }) {
  const [state, dispatch] = useReducer(reducer, initial, initialState);
  const { deck, cache } = state.project;
  const [status, setStatus] = useState<api.AiStatus>({ ai: false, model: '' });
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [building, setBuilding] = useState(false);
  const [summary, setSummary] = useState<BuildSummary | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [preview, setPreview] = useState<{ html: string; start: number } | null>(null);
  const [dialog, setDialog] = useState<'generate' | null>(null);
  const [globalBusy, setGlobalBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const warnedStorage = useRef(false);
  const planner: Planner = status.ai ? 'ai' : 'offline';

  useEffect(injectEditorStyles, []);
  useEffect(() => {
    api.fetchStatus().then(setStatus);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      saveProject(state.project).then((ok) => {
        if (!ok && !warnedStorage.current) {
          warnedStorage.current = true;
          setToast({ text: 'This project is too big for browser storage. Use Save to keep a copy.', error: true });
        }
      });
    }, 400);
    return () => clearTimeout(t);
  }, [state.project]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.error ? 7000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (editing !== null && editing >= deck.slides.length) setEditing(deck.slides.length ? deck.slides.length - 1 : null);
  }, [editing, deck.slides.length]);

  const notify = useCallback((text: string, error = false) => setToast({ text, error }), []);
  const fail = (err: unknown) => notify(err instanceof Error ? err.message : String(err), true);
  const setRow = (id: string, row: RowState | null) =>
    setRows((r) => {
      const next = { ...r };
      if (row) next[id] = row;
      else delete next[id];
      return next;
    });

  const plans = useMemo(() => deck.slides.map((s) => cache[sceneKey(s, planner)]?.plan ?? null), [deck.slides, cache, planner]);
  // Slides are shown in the chosen style, in their scene's mood once built.
  const themes: Theme[] = useMemo(() => plans.map((p) => themeFor(deck.style, p?.mood ?? 'neutral')), [plans, deck.style]);
  const staleCount = plans.filter((p) => !p).length;

  // ---- build ------------------------------------------------------------------------------

  const build = useCallback(async (): Promise<{ deck: Deck; plans: ScenePlan[] } | null> => {
    if (!deck.slides.length) {
      notify('Add a slide first.', true);
      return null;
    }
    setBuilding(true);
    const snapshot = deck;
    try {
      const result = await buildDeck({
        deck: snapshot,
        cache,
        planner,
        compile: ({ slide, index, total }) => api.compileScene(status.ai, slide, index, total),
        fallback: ({ slide, index, total }) => Promise.resolve(offlinePlan(slide.elements, slide.story, index, total)),
        onEvent: (e) => {
          const id = snapshot.slides[e.index].id;
          if (e.type === 'building') setRow(id, { kind: 'building' });
          else if (e.type === 'failed') setRow(id, { kind: 'failed', error: e.error });
          else setRow(id, null);
        },
      });
      dispatch({ type: 'merge-cache', cache: result.cache });
      setSummary({ reused: result.reused, rebuilt: result.rebuilt, failed: result.failed });
      if (result.failed) notify(`${result.failed} scene(s) failed to compile with AI and used the offline planner. Build again to retry.`, true);
      return { deck: snapshot, plans: result.plans };
    } catch (err) {
      fail(err);
      return null;
    } finally {
      setBuilding(false);
    }
  }, [deck, cache, planner, status.ai, notify]);

  const withHtml = async (fn: (html: string) => void) => {
    const built = await build();
    if (built) fn(presentationHtml(built.deck, built.plans));
  };

  // ---- AI actions --------------------------------------------------------------------------

  const writeAllStories = async () => {
    if (deck.slides.some((s) => s.story.trim()) && !confirm('Replace the story of every slide?')) return;
    setGlobalBusy('Finding the story behind your slides…');
    try {
      const stories = await api.writeStories(status.ai, deck.title, deck.slides, null);
      dispatch({ type: 'set-deck', deck: { ...deck, slides: deck.slides.map((s, i) => ({ ...s, story: stories[i] ?? s.story })) } });
      notify(status.ai ? 'Story written. Edit any line, then build.' : 'Offline story written (add an API key for AI-written stories).');
    } catch (err) {
      fail(err);
    } finally {
      setGlobalBusy(null);
    }
  };

  const writeOneStory = async (slide: Slide, index: number) => {
    setRow(slide.id, { kind: 'busy', what: 'Writing story…' });
    try {
      const stories = await api.writeStories(status.ai, deck.title, deck.slides, index);
      dispatch({ type: 'update-slide', id: slide.id, patch: { story: stories[index] ?? slide.story } });
    } catch (err) {
      fail(err);
    } finally {
      setRow(slide.id, null);
    }
  };

  const polish = async (slide: Slide) => {
    setRow(slide.id, { kind: 'busy', what: 'Polishing…' });
    try {
      const texts = await api.polishSlide(status.ai, slide, deck.slides);
      if (!texts.length) {
        notify('This slide has no text to polish.');
        return;
      }
      const byId = new Map(texts.map((t) => [t.id, t.text]));
      // Apply to the slide as it is now (it may have changed while the AI worked).
      dispatch({
        type: 'set-elements',
        id: slide.id,
        elements: (stateRef.current.project.deck.slides.find((s) => s.id === slide.id)?.elements ?? slide.elements).map((e): SlideElement =>
          e.type === 'text' && byId.has(e.id) ? { ...e, text: byId.get(e.id)! } : e,
        ),
        history: 'push',
      });
      notify('Wording polished. Undo (Ctrl+Z) brings back the original.');
    } catch (err) {
      fail(err);
    } finally {
      setRow(slide.id, null);
    }
  };
  const stateRef = useRef(state);
  stateRef.current = state;

  const generate = async (topic: string, count: number, audience: string, withStory: boolean) => {
    setDialog(null);
    setGlobalBusy('Writing your slides…');
    try {
      const result = await api.generateSlides(topic, count, audience);
      let slides = result.slides.map((c) => newSlide(c.layout, c));
      if (withStory) {
        setGlobalBusy('Finding the story behind them…');
        const stories = await api.writeStories(true, result.title, slides, null);
        slides = slides.map((s, i) => ({ ...s, story: stories[i] ?? '' }));
      }
      dispatch({ type: 'set-deck', deck: { ...deck, title: result.title, slides } });
      notify('Deck ready. Undo (Ctrl+Z) brings back the previous one.');
    } catch (err) {
      fail(err);
    } finally {
      setGlobalBusy(null);
    }
  };

  // ---- files and keys -------------------------------------------------------------------------

  const saveFile = () => download(safeFilename(deck.title, 'pumpkin.json'), JSON.stringify(state.project), 'application/json');

  const openFile = async (file: File) => {
    try {
      const project = normalizeProject(JSON.parse(await file.text()));
      if (!project) throw new Error('This file is not a PumpkinPoint project.');
      dispatch({ type: 'load', project });
      setEditing(null);
      notify(`Opened ${file.name}`);
    } catch (err) {
      fail(err);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || preview) return;
      const a = document.activeElement;
      const inField = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        saveFile();
      } else if (!inField && key === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (!inField && key === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const addSlide = (layout: Layout | 'blank') => {
    setAddMenu(false);
    dispatch({ type: 'add-slide', after: deck.slides.length - 1, layout });
  };

  // ---- render ---------------------------------------------------------------------------------

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">🎃</span>
          <span>PumpkinPoint</span>
        </div>
        <input
          className="deck-title"
          value={deck.title}
          placeholder="Presentation title"
          aria-label="Presentation title"
          onChange={(e) => dispatch({ type: 'set-title', title: e.target.value })}
        />
        <span className={`ai-status ${status.ai ? 'on' : ''}`} title={status.ai ? `Model: ${status.model}` : 'Add ANTHROPIC_API_KEY to .env and restart to turn on AI'}>
          {status.ai ? 'AI on' : 'Offline mode'}
        </span>
        <div className="top-actions">
          <button className="btn ghost" disabled={!state.past.length} onClick={() => dispatch({ type: 'undo' })} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button className="btn ghost" disabled={!state.future.length} onClick={() => dispatch({ type: 'redo' })} title="Redo (Ctrl+Shift+Z)">
            Redo
          </button>
          <span className="sep" />
          <button className="btn ghost" onClick={() => confirm('Start a new, empty presentation?') && dispatch({ type: 'set-deck', deck: { version: 2, title: '', style: deck.style, slides: [newSlide('title')] } })}>
            New
          </button>
          <button className="btn ghost" onClick={() => dispatch({ type: 'set-deck', deck: sampleDeck() })}>
            Sample
          </button>
          <button className="btn ghost" onClick={() => fileInput.current?.click()}>
            Open…
          </button>
          <button className="btn ghost" onClick={saveFile} title="Save project (Ctrl+S)">
            Save
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) openFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <section className="styles" aria-label="Animation style">
        {STYLE_IDS.map((id) => (
          <button key={id} className={`style-card ${deck.style === id ? 'active' : ''}`} onClick={() => dispatch({ type: 'set-style', style: id })} aria-pressed={deck.style === id}>
            <span className="style-icon">{STYLE_INFO[id].icon}</span>
            <span className="style-text">
              <strong>{STYLE_INFO[id].name}</strong>
              <small>{STYLE_INFO[id].blurb}</small>
            </span>
          </button>
        ))}
      </section>

      <section className="actions">
        <button className="btn" disabled={!status.ai || !!globalBusy} onClick={() => setDialog('generate')} title={status.ai ? 'Draft a whole deck from a topic' : 'Needs an API key'}>
          ✨ Generate slides
        </button>
        <button className="btn" disabled={!!globalBusy || !deck.slides.length} onClick={writeAllStories}>
          ✨ Write the whole story
        </button>
        {globalBusy && (
          <span className="busy">
            <Spinner /> {globalBusy}
          </span>
        )}
        <span className="spacer" />
        <span className="build-info">
          {building ? (
            <>
              <Spinner /> Building…
            </>
          ) : staleCount ? (
            `${staleCount} scene${staleCount > 1 ? 's' : ''} to build`
          ) : summary ? (
            `Up to date · last build reused ${summary.reused}, rebuilt ${summary.rebuilt}`
          ) : (
            'Up to date'
          )}
        </span>
        <button className="btn" disabled={building} onClick={() => build()}>
          Build
        </button>
        <button className="btn" disabled={building} onClick={() => withHtml((html) => setPreview({ html, start: 0 }))}>
          ▶ Preview
        </button>
        <button className="btn" disabled={building} onClick={() => withHtml(openInNewTab)} title="Open the presentation full-window in a new tab">
          Present
        </button>
        <button className="btn primary" disabled={building} onClick={() => withHtml((html) => download(safeFilename(deck.title, 'html'), html, 'text/html'))}>
          Export HTML
        </button>
        <button className="btn" onClick={() => printSlides(deck, themes, allFontsCss)} title="Print or save the slides as PDF">
          Export PDF
        </button>
      </section>

      <div className="columns-head">
        <span>Slides — click one to edit it</span>
        <span>Story — what the animation tells</span>
      </div>

      <main className="rows">
        {deck.slides.map((slide, i) => (
          <SlideRow
            key={slide.id}
            slide={slide}
            index={i}
            total={deck.slides.length}
            theme={themes[i]}
            plan={plans[i]}
            row={rows[slide.id] ?? null}
            ai={status.ai}
            onEdit={() => setEditing(i)}
            onStory={(story) => dispatch({ type: 'update-slide', id: slide.id, patch: { story } })}
            onPolish={() => polish(slide)}
            onWriteStory={() => writeOneStory(slide, i)}
            onPreview={() => withHtml((html) => setPreview({ html, start: i }))}
            onMove={(dir) => dispatch({ type: 'move-slide', id: slide.id, dir })}
            onDuplicate={() => dispatch({ type: 'duplicate-slide', id: slide.id })}
            onRemove={() => dispatch({ type: 'remove-slide', id: slide.id })}
          />
        ))}
        <div className="add-wrap">
          <button className="add-slide" onClick={() => setAddMenu((v) => !v)} aria-expanded={addMenu}>
            + Add slide
          </button>
          {addMenu && (
            <div className="menu add-menu" role="menu">
              {LAYOUTS.map((l) => (
                <button key={l} role="menuitem" onClick={() => addSlide(l)}>
                  {LAYOUT_LABELS[l]}
                </button>
              ))}
              <button role="menuitem" onClick={() => addSlide('blank')}>
                Blank
              </button>
            </div>
          )}
        </div>
      </main>

      {editing !== null && deck.slides[editing] && (
        <SlideEditor
          deck={deck}
          index={editing}
          themes={themes}
          ai={status.ai}
          canUndo={state.past.length > 0}
          canRedo={state.future.length > 0}
          dispatch={dispatch}
          onIndex={setEditing}
          onClose={() => setEditing(null)}
          onPolish={polish}
          busy={rows[deck.slides[editing].id]?.kind === 'busy' ? 'busy' : null}
          notify={notify}
        />
      )}
      {dialog === 'generate' && <GenerateDialog onClose={() => setDialog(null)} onSubmit={generate} />}
      {preview && (
        <Preview
          key={`${preview.start}:${preview.html.length}`}
          html={preview.html}
          start={preview.start}
          onClose={() => setPreview(null)}
          onExport={() => download(safeFilename(deck.title, 'html'), preview.html, 'text/html')}
        />
      )}
      {toast && (
        <div className={`toast ${toast.error ? 'error' : ''}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}

function SlideRow(props: {
  slide: Slide;
  index: number;
  total: number;
  theme: Theme;
  plan: ScenePlan | null;
  row: RowState | null;
  ai: boolean;
  onEdit: () => void;
  onStory: (story: string) => void;
  onPolish: () => void;
  onWriteStory: () => void;
  onPreview: () => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { slide, index, total, plan, row } = props;
  const busy = row?.kind === 'busy' || row?.kind === 'building';
  const state = row?.kind === 'building' ? 'building' : row?.kind === 'failed' ? 'failed' : plan ? 'built' : 'stale';
  const stateLabel = { building: 'Building…', failed: 'Build failed', built: 'Built', stale: 'Needs build' }[state];
  const outline = textsInOrder(slide.elements);
  const pictures = slide.elements.filter((e) => e.type === 'image').length;
  const shapes = slide.elements.filter((e) => e.type === 'shape').length;

  return (
    <article className="row">
      <div className="row-num">
        <span>{index + 1}</span>
        <button className="icon" onClick={() => props.onMove(-1)} disabled={index === 0} aria-label="Move up" title="Move up">↑</button>
        <button className="icon" onClick={() => props.onMove(1)} disabled={index === total - 1} aria-label="Move down" title="Move down">↓</button>
        <button className="icon" onClick={props.onDuplicate} aria-label="Duplicate" title="Duplicate">⧉</button>
        <button className="icon" onClick={() => total > 1 && confirm('Delete this slide?') && props.onRemove()} disabled={total <= 1} aria-label="Delete" title="Delete">✕</button>
      </div>

      <div className="slide-panel">
        <button className="thumb-btn" onClick={props.onEdit} aria-label={`Edit slide ${index + 1}`} title="Click to edit this slide">
          <StaticSlide elements={slide.elements} theme={props.theme} width={320} />
          <span className="thumb-hint">Edit slide</span>
        </button>
        <div className="outline">
          {outline.length ? (
            <ul>
              {outline.slice(0, 6).map((t) => (
                <li key={t.id} className={`ol-${t.role}`}>
                  {t.list ? t.text.split('\n').filter((l) => l.trim()).map((l, i) => <span key={i} className="ol-bullet">{l}</span>) : t.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No text on this slide.</p>
          )}
          {(pictures > 0 || shapes > 0) && (
            <p className="ol-extra">
              {[pictures && `${pictures} picture${pictures > 1 ? 's' : ''}`, shapes && `${shapes} shape${shapes > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
            </p>
          )}
          <div className="outline-actions">
            <button className="btn small" onClick={props.onEdit}>Edit slide</button>
            <button className="btn small" disabled={busy} onClick={props.onPolish} title={props.ai ? 'Let AI tighten the wording' : 'Tidy up the wording (offline)'}>✨ Polish</button>
          </div>
        </div>
      </div>

      <div className="story-panel">
        <textarea
          className="story"
          value={slide.story}
          placeholder="What happens in the story while this slide is up? e.g. “A storm rolls in and the little boat loses its way.”"
          aria-label="Story for this slide"
          onChange={(e) => props.onStory(e.target.value)}
        />
        <div className="story-foot">
          <button className="btn small" disabled={busy} onClick={props.onWriteStory} title="Write this slide's story from the slides">✨ Write</button>
          <span className={`state ${state}`}>{row?.kind === 'busy' ? row.what : stateLabel}</span>
          <span className="spacer" />
          <button className="btn small" onClick={props.onPreview} disabled={busy} title="Preview from this scene">▶ Play from here</button>
        </div>
        {plan ? <PlanChips plan={plan} /> : <div className="plan muted">Build to see what the animation will show.</div>}
        {row?.kind === 'failed' && <div className="row-error">{row.error}</div>}
      </div>
    </article>
  );
}

function GenerateDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (topic: string, count: number, audience: string, withStory: boolean) => void }) {
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [count, setCount] = useState(6);
  const [withStory, setWithStory] = useState(true);
  return (
    <Dialog title="Generate slides with AI" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (topic.trim()) onSubmit(topic.trim(), count, audience.trim(), withStory);
        }}
      >
        <label>
          What is the talk about?
          <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} placeholder="e.g. Why our team should move to a four-day week" required />
        </label>
        <label>
          Audience (optional)
          <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. company leadership" />
        </label>
        <label className="inline">
          Slides
          <input type="number" min={2} max={15} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </label>
        <label className="inline">
          <input type="checkbox" checked={withStory} onChange={(e) => setWithStory(e.target.checked)} />
          Also write the story behind them
        </label>
        <p className="hint">This replaces the current slides. You can undo it.</p>
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!topic.trim()}>
            Generate
          </button>
        </div>
      </form>
    </Dialog>
  );
}
