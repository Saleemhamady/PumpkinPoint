# 🎃 PumpkinPoint

Presentations that tell a story.

You write slides as usual. Next to each slide you write the **story** that should be
told while it is on screen. PumpkinPoint turns that story into motion graphics and
exports the whole talk as **one HTML file** that runs in any browser and is
clicked through just like PowerPoint.

```
 Layer 1 · Slides                      Layer 2 · Story
 what the audience reads               what the animation tells
 ┌──────────────────────┐              ┌───────────────────────────────────────────┐
 │ Slides don’t stick   │   ───────▶   │ A storm rolls in. Out at sea, the boats   │
 │ • Audiences forget…  │              │ drift in the rain, lost and all alike.    │
 └──────────────────────┘              └───────────────────────────────────────────┘
          │                                                │
          └──────────────┬─────────────────────────────────┘
                         ▼  compile (AI or offline), cached per scene
              scene plan: mood · setting · motifs · narration · kinetic lines
                         ▼  render in the chosen style
          Origami · Pop-up book · Whiteboard · Kinetic typography
```

## Quick start

```bash
npm install
cp .env.example .env      # optional: add ANTHROPIC_API_KEY to turn on AI
npm run dev               # open http://localhost:5173
```

To update an existing copy, stop the running server (Ctrl+C), then:

```bash
git pull                  # get the latest code
npm ci                    # install exactly the locked dependencies
npm run dev               # start again, then reload the page (Ctrl+Shift+R)
```

`npm ci` never edits `package.json` or `package-lock.json`. If `git pull` says your
local changes to those two files would be overwritten (a plain `npm install` can
rewrite them), discard them first with `git checkout -- package.json package-lock.json`.

The version you are running is shown next to the PumpkinPoint name in the top bar.

Without an API key everything still works in **offline mode**: stories and scene plans
come from a built-in keyword planner instead of Claude, and "Generate slides" is disabled.

Want to see the four styles without opening the editor?

```bash
npm run sample            # writes samples/origami.html, book.html, whiteboard.html, kinetic.html
```

## Using the editor

1. **Slides (Layer 1).** Each row shows a slide's thumbnail and its text outline.
   **Click the thumbnail** to open the slide editor (see below). ✨ **Polish** tightens
   the wording with AI. ✨ **Generate slides** drafts a whole deck from a topic.
2. **Story (Layer 2).** Next to each slide, describe what happens in the story world
   while that slide is up. ✨ **Write the whole story** reads all the slides, picks one
   visual metaphor (a voyage, a growing seed, a climb…) and writes an arc across the
   deck. ✨ **Write** on a row rewrites just that slide's story.
3. **Style.** Pick one of the four animation styles. Switching is instant.
4. **Build → Preview / Present / Export HTML.** Clicks, arrow keys, Page Up/Down
   (presentation clickers), space and swipes move through scenes in slide order.
   Type a number then Enter to jump; `F` toggles full screen.
5. **Export PDF** prints the slides (Layer 1), one per page.

Projects autosave in the browser (IndexedDB, so pictures fit); **Save** / **Open…** read
and write `.pumpkin.json` files. Undo/redo with Ctrl+Z / Ctrl+Shift+Z.

### The slide editor

Slides are free-form canvases (1600×900, the same size as the presentation stage).

- **Add** text, shapes (rectangle, rounded, ellipse, triangle, diamond, star, arrow,
  line) and pictures (pick, paste or drag them in; large pictures are downscaled).
- **Select** by clicking (Shift-click for several, Ctrl+A for all), or from the items
  list. **Move** by dragging or with the arrow keys (Shift = 10px). Moving snaps to the
  slide's centre and edges and to other items; hold Alt to place freely.
- **Resize** with the handles (pictures keep their shape; Shift keeps it for anything).
  **Rotate** with the round handle (Shift = 15° steps).
- **Edit text in place** with a double-click or Enter. The properties panel sets the
  role (title, subtitle, body, big number), typeface, size, bold/italic, bullets,
  alignment and colour; shapes get fill and outline; pictures get fit, rounded corners
  and a description the AI can read.
- **Arrange**: bring forward/back, align items to each other or to the slide,
  duplicate (Ctrl+D), copy/paste between slides (Ctrl+C / Ctrl+V), delete.
- **Arrange text** snaps the slide's text back into a template (title, bullets,
  statement, big number) without touching pictures and shapes.
- The dashed **story area** shows where the story illustration will be drawn: the
  largest empty part of the slide. Keep some space free and the story never covers
  your content; fill the slide completely and it is drawn faintly behind instead.
  In the pop-up book style a dashed line marks the book's spine.

Colours can be fixed, or set to a **theme colour** (text colour, accent, soft, paper).
Theme colours follow the animation style and each scene's mood, so text stays readable
when the story turns the background from dawn-pink to storm-grey.

## The four styles

| Style | What happens |
| --- | --- |
| **Origami** | Figures unfold facet by facet out of paper in the slide's free space and the landscape folds up in layers. Your text folds down like paper flaps; shapes and pictures unfold from the middle. A figure that appears in consecutive scenes glides to its new place instead of refolding. |
| **Pop-up book** | Each slide is printed across a spread and its story pops up out of the free space on the pages. Clicking turns the page; jumping riffles through pages. |
| **Whiteboard** | A marker sketches the story in the free space, writes your text where you placed it and outlines your shapes and pictures, then the camera pans along one endless board to the next scene, so the talk becomes one connected drawing. |
| **Kinetic typography** | The story is told in big animated words over bold colour fields; colour wipes carry the mood from scene to scene, then your slide lands piece by piece. Numbers count up. |

In every style the **mood** of each scene drives the background, so the backdrop
itself changes as the story turns (dawn → storm → light → triumph).

## How it works

### Scene plans

Every slide compiles to a small, style-independent **scene plan**:

```json
{
  "mood": "tense",
  "setting": "sea",
  "motifs": [
    { "motif": "storm", "role": "hero", "motion": "sway" },
    { "motif": "sailboat", "role": "support", "motion": "float" }
  ],
  "narration": "A storm rolls in.",
  "kinetic": [{ "text": "The boats drift in the rain", "emphasis": "rain", "motion": "slam" }]
}
```

The AI only chooses from a fixed vocabulary: ~40 low-poly motifs, 6 settings, 7 moods
and a set of motions. Hand-written renderers then turn the plan into animation. Every
deck therefore looks consistent, a plan can never break the player, and any AI answer
is validated (`sanitizePlan`) before use. The same motif geometry becomes folded paper
facets, pop-up cut-outs or marker sketches depending on the style.

Motifs work as tags that persist across slides. When the same motif shows up in
neighbouring scenes, the renderer treats it as the same character (the origami boat
sails from one scene into the next).

### Incremental compile

Each scene is cached under a hash of exactly the inputs that affect it: the slide's
words (and picture descriptions) and its story (`src/shared/compiler.ts`).

- Change a slide's words or its story → only that scene recompiles.
- Move, resize, recolour or add shapes and pictures → nothing recompiles; positions are
  applied when the HTML is assembled.
- Change the style, reorder slides or rename the deck → nothing recompiles.
- The final HTML is assembled from cached plans in milliseconds.

The editor shows **Built / Needs build** per row and how many scenes the last build
reused.

### The exported file

One self-contained `.html` (≈150–250 KB plus any pictures): a small framework-free
player (~70 KB), the fonts the deck uses embedded as base64, the slides' elements
(pictures as data URLs) and the scene plans. It needs no internet connection and no
server. The editor's canvas, thumbnails and PDF use the same element renderer as the
player (`src/runtime/elements.ts`), so a slide looks the same everywhere.

### AI

`server/ai.ts` calls Claude through the official `@anthropic-ai/sdk` with structured
outputs (JSON schemas), from a Vite middleware, so the API key never reaches the
browser. It defaults to `claude-opus-5-5`; set `PUMPKIN_MODEL` to override. Requests
opt into server-side refusal fallbacks (`fallbacks: "default"`).

## Project layout

```
src/shared/     data model, slide elements and templates, themes, motif library,
                planners, compiler, HTML assembly
src/runtime/    the presentation player bundled into every export
  elements.ts   draws text, shapes and pictures (shared with the editor)
  styles/       origami.ts · book.ts · whiteboard.ts · kinetic.ts
src/editor/     the React editor; SlideEditor.tsx + Inspector.tsx are the canvas editor
server/         AI endpoints, runtime bundling, Vite plugin
scripts/        export-sample.ts (CLI export of the sample deck)
tests/          vitest unit tests
```

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Editor with hot reload and the AI endpoints |
| `npm run build` / `npm run preview` | Production build of the editor (preview also serves the AI endpoints) |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript |
| `npm run sample` | Export the sample deck in all four styles to `samples/` |

## Extending

- **New motif:** add an entry to `MOTIFS` in `src/shared/motifs.ts` (polygons in a
  100×100 box with tones 0–4, plus keywords). All styles and the AI pick it up.
- **New style:** implement `Renderer` (`mount`, `show`, `frameColor`) in
  `src/runtime/styles/`, register it in `src/runtime/main.ts`, and add it to
  `STYLE_IDS`, `STYLE_FONTS` and the editor's style cards.

## Not done yet

- AI-generated custom illustrations beyond the motif library.
- Editing a scene plan by hand (change a motif or mood without changing the story).
- Rich text inside one text box (mixed bold/colour within a line), tables and charts.
- Speaker notes and a presenter view.
