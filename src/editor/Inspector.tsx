// The properties panel of the slide editor.

import { useRef, type ReactNode } from 'react';
import { FONT_FAMILIES } from '../shared/fonts.ts';
import { resolveColor, type Theme } from '../shared/theme.ts';
import {
  FONT_KEYS, SHAPE_KINDS, TEXT_ROLES,
  type ColorToken, type FontKey, type ShapeKind, type SlideElement, type TextElement, type TextRole,
} from '../shared/types.ts';
import { SHAPE_ICONS } from './components.tsx';
import { Icon } from './icons.tsx';
import { align, type AlignKind, type ZMove } from './geometry.ts';
import type { History } from './state.ts';

const ROLE_LABELS: Record<TextRole, string> = { title: 'Title', subtitle: 'Subtitle', body: 'Body text', stat: 'Big number' };
const TOKEN_LABELS: Record<ColorToken, string> = { ink: 'Text colour', accent: 'Accent', muted: 'Soft', paper: 'Paper', none: 'None' };

export interface InspectorProps {
  elements: SlideElement[];
  selected: string[];
  theme: Theme;
  onPatch: (id: string, change: Partial<SlideElement>, history?: History, key?: string) => void;
  onSet: (elements: SlideElement[], history?: History, key?: string) => void;
  onSelect: (ids: string[]) => void;
  onEditText: (id: string) => void;
  onRemove: (ids: string[]) => void;
  onDuplicate: (ids: string[]) => void;
  onReorder: (move: ZMove) => void;
  onReplaceImage: (id: string, file: File) => void;
}

export function Inspector(props: InspectorProps) {
  const { elements, selected } = props;
  const sel = elements.filter((e) => selected.includes(e.id));
  const one = sel.length === 1 ? sel[0] : null;

  return (
    <aside className="inspector" aria-label="Properties">
      {!sel.length && <SlideHelp />}
      {sel.length > 1 && (
        <Section title={`${sel.length} items selected`}>
          <AlignButtons {...props} />
          <ArrangeButtons {...props} />
        </Section>
      )}
      {one && (
        <>
          {one.type === 'text' && <TextProps el={one} {...props} />}
          {one.type === 'shape' && <ShapeProps el={one} {...props} />}
          {one.type === 'image' && <ImageProps el={one} {...props} />}
          <Section title="Position">
            <div className="grid4">
              <NumField label="X" value={one.x} onChange={(v) => props.onPatch(one.id, { x: v })} />
              <NumField label="Y" value={one.y} onChange={(v) => props.onPatch(one.id, { y: v })} />
              <NumField label="W" value={one.w} min={8} onChange={(v) => props.onPatch(one.id, { w: v })} />
              <NumField label="H" value={one.h} min={8} onChange={(v) => props.onPatch(one.id, { h: v })} />
            </div>
            <NumField label="Rotate°" value={one.rotation} min={-180} max={180} onChange={(v) => props.onPatch(one.id, { rotation: v })} />
            <AlignButtons {...props} />
            <ArrangeButtons {...props} />
          </Section>
        </>
      )}
      <Layers {...props} />
    </aside>
  );
}

function SlideHelp() {
  return (
    <Section title="Editing the slide">
      <ul className="help">
        <li>Click to select, <b>Shift</b>-click to select several.</li>
        <li>Drag to move; it snaps to the centre and to other items (hold <b>Alt</b> to stop snapping).</li>
        <li>Drag the corner handles to resize and the round handle to rotate.</li>
        <li>Double-click text (or press <b>Enter</b>) to edit it.</li>
        <li>Paste or drop pictures straight onto the slide.</li>
        <li>The dashed area is where the story is drawn; keep it clear or the story fades behind your slide.</li>
      </ul>
    </Section>
  );
}

function TextProps({ el, theme, onPatch, onEditText }: { el: TextElement } & InspectorProps) {
  const set = (change: Partial<TextElement>, key?: string) => onPatch(el.id, change, 'coalesce', key);
  return (
    <Section title="Text">
      <textarea className="prop-text" value={el.text} rows={4} onChange={(e) => set({ text: e.target.value }, `text:${el.id}`)} aria-label="Text" />
      <button className="btn small" onClick={() => onEditText(el.id)}>Edit on the slide</button>
      <div className="row2">
        <label>
          Role
          <select value={el.role} onChange={(e) => set({ role: e.target.value as TextRole })}>
            {TEXT_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </label>
        <label>
          Typeface
          <select value={el.font} onChange={(e) => set({ font: e.target.value as FontKey | 'auto' })}>
            <option value="auto">Style’s own</option>
            {FONT_KEYS.map((f) => <option key={f} value={f}>{FONT_FAMILIES[f].label}</option>)}
          </select>
        </label>
      </div>
      <label className="slider">
        Size <b>{el.size}</b>
        <input type="range" min={10} max={320} value={el.size} onChange={(e) => set({ size: Number(e.target.value) }, `size:${el.id}`)} />
      </label>
      <div className="btn-row">
        <Toggle on={el.bold} onClick={() => set({ bold: !el.bold })} label="Bold"><b>B</b></Toggle>
        <Toggle on={el.italic} onClick={() => set({ italic: !el.italic })} label="Italic"><i>I</i></Toggle>
        <Toggle on={el.list} onClick={() => set({ list: !el.list })} label="Bullets"><Icon name="bullets" /></Toggle>
        <span className="gap" />
        {(['left', 'center', 'right'] as const).map((a) => (
          <Toggle key={a} on={el.align === a} onClick={() => set({ align: a })} label={`Align text ${a}`}><Icon name={`text-${a}`} /></Toggle>
        ))}
        <span className="gap" />
        {(['top', 'middle', 'bottom'] as const).map((v) => (
          <Toggle key={v} on={el.valign === v} onClick={() => set({ valign: v })} label={`Text at the ${v}`}><Icon name={`text-${v}`} /></Toggle>
        ))}
      </div>
      <ColorPicker label="Colour" value={el.color} tokens={['ink', 'accent', 'muted', 'paper']} theme={theme} onChange={(c) => set({ color: c })} />
    </Section>
  );
}

function ShapeProps({ el, theme, onPatch }: { el: Extract<SlideElement, { type: 'shape' }> } & InspectorProps) {
  const set = (change: Partial<SlideElement>, key?: string) => onPatch(el.id, change, 'coalesce', key);
  return (
    <Section title="Shape">
      <div className="shape-grid">
        {SHAPE_KINDS.map((k: ShapeKind) => (
          <button key={k} className={`shape-pick ${el.shape === k ? 'on' : ''}`} onClick={() => set({ shape: k })} title={k} aria-pressed={el.shape === k}>
            {SHAPE_ICONS[k]}
          </button>
        ))}
      </div>
      {el.shape !== 'line' && <ColorPicker label="Fill" value={el.fill} tokens={['accent', 'ink', 'muted', 'paper', 'none']} theme={theme} onChange={(c) => set({ fill: c })} />}
      <ColorPicker label={el.shape === 'line' ? 'Colour' : 'Outline'} value={el.stroke} tokens={el.shape === 'line' ? ['ink', 'accent', 'muted', 'paper'] : ['none', 'ink', 'accent', 'muted', 'paper']} theme={theme} onChange={(c) => set({ stroke: c })} />
      <label className="slider">
        {el.shape === 'line' ? 'Thickness' : 'Outline width'} <b>{el.strokeWidth}</b>
        <input type="range" min={0} max={40} value={el.strokeWidth} onChange={(e) => set({ strokeWidth: Number(e.target.value) }, `sw:${el.id}`)} />
      </label>
    </Section>
  );
}

function ImageProps({ el, onPatch, onReplaceImage }: { el: Extract<SlideElement, { type: 'image' }> } & InspectorProps) {
  const file = useRef<HTMLInputElement>(null);
  const set = (change: Partial<SlideElement>, key?: string) => onPatch(el.id, change, 'coalesce', key);
  return (
    <Section title="Picture">
      <button className="btn small" onClick={() => file.current?.click()}>Replace picture…</button>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onReplaceImage(el.id, f);
        e.target.value = '';
      }} />
      <div className="btn-row">
        <Toggle on={el.fit === 'cover'} onClick={() => set({ fit: 'cover' })} label="Fill the box (crop)">Fill</Toggle>
        <Toggle on={el.fit === 'contain'} onClick={() => set({ fit: 'contain' })} label="Show the whole picture">Fit</Toggle>
      </div>
      <label className="slider">
        Corner radius <b>{el.radius}</b>
        <input type="range" min={0} max={300} value={el.radius} onChange={(e) => set({ radius: Number(e.target.value) }, `radius:${el.id}`)} />
      </label>
      <label>
        Description <small>(helps the AI tell the story)</small>
        <input value={el.alt} placeholder="e.g. our team at the launch" onChange={(e) => set({ alt: e.target.value }, `alt:${el.id}`)} />
      </label>
    </Section>
  );
}

function AlignButtons({ elements, selected, onSet }: InspectorProps) {
  const many = selected.length > 1;
  const kinds: [AlignKind, string][] = [
    ['left', 'left edges'], ['hcenter', 'centres'], ['right', 'right edges'],
    ['top', 'tops'], ['vcenter', 'middles'], ['bottom', 'bottoms'],
  ];
  return (
    <div className="btn-row" aria-label={many ? 'Align together' : 'Align to slide'}>
      <span className="row-label">{many ? 'Align' : 'Align to slide'}</span>
      {kinds.map(([k, what]) => {
        const label = many ? `Line up ${what}` : `Move to the slide's ${k === 'hcenter' || k === 'vcenter' ? 'centre' : k}`;
        return (
          <button key={k} className="tbtn" onClick={() => onSet(align(elements, selected, k))} title={label} aria-label={label}>
            <Icon name={`align-${k}`} />
          </button>
        );
      })}
    </div>
  );
}

function ArrangeButtons({ selected, onReorder, onDuplicate, onRemove }: InspectorProps) {
  return (
    <div className="btn-row">
      <span className="row-label">Order</span>
      {([['front', 'Bring to front'], ['forward', 'Bring forward'], ['backward', 'Send backward'], ['back', 'Send to back']] as [ZMove, string][]).map(([m, label]) => (
        <button key={m} className="tbtn" onClick={() => onReorder(m)} title={label} aria-label={label}><Icon name={m} /></button>
      ))}
      <span className="spacer" />
      <button className="btn small" onClick={() => onDuplicate(selected)} title="Duplicate (Ctrl+D)">Duplicate</button>
      <button className="btn small danger" onClick={() => onRemove(selected)} title="Delete (Del)">Delete</button>
    </div>
  );
}

function Layers({ elements, selected, onSelect }: InspectorProps) {
  if (!elements.length) return <Section title="Items"><p className="muted">This slide is empty. Add text, a shape or a picture.</p></Section>;
  const label = (e: SlideElement) =>
    e.type === 'text' ? e.text.split('\n')[0].slice(0, 32) || 'Empty text' : e.type === 'shape' ? `${e.shape[0].toUpperCase()}${e.shape.slice(1)} shape` : e.alt || 'Picture';
  return (
    <Section title="Items (front to back)">
      <ul className="layers">
        {[...elements].reverse().map((e) => (
          <li key={e.id}>
            <button className={selected.includes(e.id) ? 'on' : ''} onClick={(ev) => onSelect(ev.shiftKey ? [...selected, e.id] : [e.id])}>
              <span className="kind">{e.type === 'text' ? 'T' : e.type === 'shape' ? '◆' : '▣'}</span>
              {label(e)}
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ColorPicker({ label, value, tokens, theme, onChange }: { label: string; value: string; tokens: ColorToken[]; theme: Theme; onChange: (c: string) => void }) {
  const custom = !tokens.includes(value as ColorToken) && value !== 'none';
  const shown = resolveColor(value, theme);
  return (
    <div className="color-row">
      <span className="row-label">{label}</span>
      {tokens.map((t) => (
        <button
          key={t}
          className={`swatch-btn ${value === t ? 'on' : ''} ${t === 'none' ? 'none' : ''}`}
          style={t === 'none' ? undefined : { background: resolveColor(t, theme) }}
          onClick={() => onChange(t)}
          title={`${TOKEN_LABELS[t]}${t !== 'none' ? ' (follows the style and mood)' : ''}`}
          aria-label={TOKEN_LABELS[t]}
          aria-pressed={value === t}
        />
      ))}
      <label className={`swatch-btn custom ${custom ? 'on' : ''}`} title="Pick any colour" style={custom ? { background: shown } : undefined}>
        <input type="color" value={/^#[0-9a-f]{6}/i.test(shown) ? shown.slice(0, 7) : '#888888'} onChange={(e) => onChange(e.target.value)} aria-label={`${label}: custom colour`} />
      </label>
    </div>
  );
}

function NumField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <label className="num">
      <span>{label}</span>
      <input
        type="number"
        value={Math.round(value)}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v)));
        }}
      />
    </label>
  );
}

function Toggle({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button className={`tbtn ${on ? 'on' : ''}`} onClick={onClick} title={label} aria-label={label} aria-pressed={on}>
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="prop-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
