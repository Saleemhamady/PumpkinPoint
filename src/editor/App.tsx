// The PumpkinPoint editor: slides (Layer 1) on the left, the story told during each
// slide (Layer 2) on the right, a style picker, and an incremental build.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { slideFonts } from 'virtual:pumpkin-fonts';
import { buildDeck, sceneKey } from '../shared/compiler.ts';
import { offlinePlan } from '../shared/plan.ts';
import { blankSlide, sampleDeck } from '../shared/sample.ts';
import { LAYOUTS, STYLE_IDS, type Deck, type Layout, type Planner, type ScenePlan, type Slide } from '../shared/types.ts';
import * as api from './api.ts';
import { Dialog, LAYOUT_LABELS, PlanChips, Preview, STYLE_INFO, SlideThumb, Spinner } from './components.tsx';
import { download, openInNewTab, presentationHtml, safeFilename } from './exporter.ts';
import { SLIDE_CSS, printSlides } from './slideView.ts';
import { loadInitial, normalizeProject, persist, reducer } from './state.ts';

type RowState = { kind: 'building' } | { kind: 'failed'; error: string } | { kind: 'busy'; what: string };

interface BuildSummary {
  reused: number;
  rebuilt: number;
  failed: number;
  planner: Planner;
}

let injected = false;
function injectSlideStyles() {
  if (injected) return;
  injected = true;
  const st = document.createElement('style');
  st.textContent = slideFonts + SLIDE_CSS;
  document.head.appendChild(st);
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial);
  const { deck, cache } = state.project;
  const [status, setStatus] = useState<api.AiStatus>({ ai: false, model: '' });
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [building, setBuilding] = useState(false);
  const [summary, setSummary] = useState<BuildSummary | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [preview, setPreview] = useState<{ html: string; start: number } | null>(null);
  const [dialog, setDialog] = useState<'generate' | null>(null);
  const [globalBusy, setGlobalBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const planner: Planner = status.ai ? 'ai' : 'offline';

  useEffect(injectSlideStyles, []);
  useEffect(() => {
    api.fetchStatus().then(setStatus);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => persist(state.project), 300);
    return () => clearTimeout(t);
  }, [state.project]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.error ? 7000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = (text: string, error = false) => setToast({ text, error });
  const fail = (err: unknown) => notify(err instanceof Error ? err.message : String(err), true);
  const setRow = (id: string, row: RowState | null) =>
    setRows((r) => {
      const next = { ...r };
      if (row) next[id] = row;
      else delete next[id];
      return next;
    });

  const staleCount = useMemo(() => deck.slides.filter((s) => !cache[sceneKey(s, planner)]).length, [deck.slides, cache, planner]);

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
        fallback: ({ slide, index, total }) => Promise.resolve(offlinePlan(api.content(slide), slide.story, index, total)),
        onEvent: (e) => {
          const id = snapshot.slides[e.index].id;
          if (e.type === 'building') setRow(id, { kind: 'building' });
          else if (e.type === 'failed') setRow(id, { kind: 'failed', error: e.error });
          else setRow(id, null);
        },
      });
      dispatch({ type: 'merge-cache', cache: result.cache });
      setSummary({ reused: result.reused, rebuilt: result.rebuilt, failed: result.failed, planner });
      if (result.failed) notify(`${result.failed} scene(s) failed to compile with AI and used the offline planner. Build again to retry.`, true);
      return { deck: snapshot, plans: result.plans };
    } catch (err) {
      fail(err);
      return null;
    } finally {
      setBuilding(false);
    }
  }, [deck, cache, planner, status.ai]);

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
      const better = await api.polishSlide(status.ai, slide, deck.slides);
      dispatch({ type: 'update-slide', id: slide.id, patch: better });
    } catch (err) {
      fail(err);
    } finally {
      setRow(slide.id, null);
    }
  };

  const generate = async (topic: string, count: number, audience: string, withStory: boolean) => {
    setDialog(null);
    setGlobalBusy('Writing your slides…');
    try {
      const result = await api.generateSlides(topic, count, audience);
      let slides = result.slides.map((s) => blankSlide(s));
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

  // ---- files ----------------------------------------------------------------------------------

  const openFile = async (file: File) => {
    try {
      const project = normalizeProject(JSON.parse(await file.text()));
      if (!project) throw new Error('This file is not a PumpkinPoint project.');
      dispatch({ type: 'load', project });
      notify(`Opened ${file.name}`);
    } catch (err) {
      fail(err);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || preview) return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        download(safeFilename(deck.title, 'pumpkin.json'), JSON.stringify(state.project, null, 2), 'application/json');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deck.title, preview, state.project]);

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
          <button className="btn ghost" onClick={() => confirm('Start a new, empty presentation?') && dispatch({ type: 'set-deck', deck: { version: 1, title: '', style: deck.style, slides: [blankSlide({ layout: 'title' })] } })}>
            New
          </button>
          <button className="btn ghost" onClick={() => dispatch({ type: 'set-deck', deck: sampleDeck() })}>
            Sample
          </button>
          <button className="btn ghost" onClick={() => fileInput.current?.click()}>
            Open…
          </button>
          <button className="btn ghost" onClick={() => download(safeFilename(deck.title, 'pumpkin.json'), JSON.stringify(state.project, null, 2), 'application/json')} title="Save project (Ctrl+S)">
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
        <button className="btn" onClick={() => printSlides(deck, slideFonts)} title="Print or save the slides as PDF">
          Export PDF
        </button>
      </section>

      <div className="columns-head">
        <span>Slides — what the audience reads</span>
        <span>Story — what the animation tells</span>
      </div>

      <main className="rows">
        {deck.slides.map((slide, i) => (
          <SlideRow
            key={slide.id}
            slide={slide}
            index={i}
            total={deck.slides.length}
            plan={cache[sceneKey(slide, planner)]?.plan ?? null}
            row={rows[slide.id] ?? null}
            onChange={(patch) => dispatch({ type: 'update-slide', id: slide.id, patch })}
            onPolish={() => polish(slide)}
            onWriteStory={() => writeOneStory(slide, i)}
            onPreview={() => withHtml((html) => setPreview({ html, start: i }))}
            onMove={(dir) => dispatch({ type: 'move-slide', id: slide.id, dir })}
            onDuplicate={() => dispatch({ type: 'duplicate-slide', id: slide.id })}
            onRemove={() => dispatch({ type: 'remove-slide', id: slide.id })}
            ai={status.ai}
          />
        ))}
        <button className="add-slide" onClick={() => dispatch({ type: 'add-slide', after: deck.slides.length - 1 })}>
          + Add slide
        </button>
      </main>

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
  plan: ScenePlan | null;
  row: RowState | null;
  ai: boolean;
  onChange: (patch: Partial<Slide>) => void;
  onPolish: () => void;
  onWriteStory: () => void;
  onPreview: () => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { slide, index, total, plan, row, onChange } = props;
  const busy = row?.kind === 'busy' || row?.kind === 'building';
  const state = row?.kind === 'building' ? 'building' : row?.kind === 'failed' ? 'failed' : plan ? 'built' : 'stale';
  const stateLabel = { building: 'Building…', failed: 'Build failed', built: 'Built', stale: 'Needs build' }[state];
  const subtitleLabel = slide.layout === 'stat' ? 'What the number means' : slide.layout === 'statement' ? 'Attribution (optional)' : 'Subtitle (optional)';

  return (
    <article className="row">
      <div className="row-num">
        <span>{index + 1}</span>
        <button className="icon" onClick={() => props.onMove(-1)} disabled={index === 0} aria-label="Move up" title="Move up">
          ↑
        </button>
        <button className="icon" onClick={() => props.onMove(1)} disabled={index === total - 1} aria-label="Move down" title="Move down">
          ↓
        </button>
        <button className="icon" onClick={props.onDuplicate} aria-label="Duplicate" title="Duplicate">
          ⧉
        </button>
        <button className="icon" onClick={() => total > 1 && confirm('Delete this slide?') && props.onRemove()} disabled={total <= 1} aria-label="Delete" title="Delete">
          ✕
        </button>
      </div>

      <div className="slide-panel">
        <SlideThumb slide={slide} index={index} width={300} />
        <div className="fields">
          <div className="field-row">
            <select value={slide.layout} onChange={(e) => onChange({ layout: e.target.value as Layout })} aria-label="Layout">
              {LAYOUTS.map((l) => (
                <option key={l} value={l}>
                  {LAYOUT_LABELS[l]}
                </option>
              ))}
            </select>
            <button className="btn small" disabled={busy} onClick={props.onPolish} title={props.ai ? 'Let AI tighten this slide' : 'Tidy up (offline)'}>
              ✨ Polish
            </button>
          </div>
          <input value={slide.title} placeholder={slide.layout === 'stat' ? 'The number, e.g. 42%' : 'Title'} aria-label="Title" onChange={(e) => onChange({ title: e.target.value })} />
          <input value={slide.subtitle} placeholder={subtitleLabel} aria-label={subtitleLabel} onChange={(e) => onChange({ subtitle: e.target.value })} />
          <textarea
            value={slide.bullets.join('\n')}
            placeholder="Bullets, one per line"
            aria-label="Bullets"
            rows={3}
            onChange={(e) => onChange({ bullets: e.target.value.split('\n') })}
          />
        </div>
      </div>

      <div className="story-panel">
        <textarea
          className="story"
          value={slide.story}
          placeholder="What happens in the story while this slide is up? e.g. “A storm rolls in and the little boat loses its way.”"
          aria-label="Story for this slide"
          onChange={(e) => onChange({ story: e.target.value })}
        />
        <div className="story-foot">
          <button className="btn small" disabled={busy} onClick={props.onWriteStory} title="Write this slide's story from the slides">
            ✨ Write
          </button>
          <span className={`state ${state}`}>{row?.kind === 'busy' ? row.what : stateLabel}</span>
          <span className="spacer" />
          <button className="btn small" onClick={props.onPreview} disabled={busy} title="Preview from this scene">
            ▶ Play from here
          </button>
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

