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

Without an API key everything still works in **offline mode**: stories and scene plans
come from a built-in keyword planner instead of Claude, and "Generate slides" is disabled.

Want to see the four styles without opening the editor?

```bash
npm run sample            # writes samples/origami.html, book.html, whiteboard.html, kinetic.html
```

## Using the editor

1. **Slides (Layer 1).** Each row is one slide: choose a layout (title, bullets,
   statement or big number) and fill in the text. ✨ **Polish** tidies a slide with AI.
   ✨ **Generate slides** drafts a whole deck from a topic.
2. **Story (Layer 2).** Next to each slide, describe what happens in the story world
   while that slide is up. ✨ **Write the whole story** reads all the slides, picks one
   visual metaphor (a voyage, a growing seed, a climb…) and writes an arc across the
   deck. ✨ **Write** on a row rewrites just that slide's story.
3. **Style.** Pick one of the four animation styles. Switching is instant.
4. **Build → Preview / Present / Export HTML.** Clicks, arrow keys, Page Up/Down
   (presentation clickers), space and swipes move through scenes in slide order.
   Type a number then Enter to jump; `F` toggles full screen.
5. **Export PDF** prints the plain slides (Layer 1), one per page.

Projects autosave in the browser; **Save** / **Open…** read and write `.pumpkin.json`
files. Undo/redo with Ctrl+Z / Ctrl+Shift+Z.

## The four styles

| Style | What happens |
| --- | --- |
| **Origami** | Figures unfold facet by facet out of paper, the landscape folds up in layers, and the slide arrives as a letter unfolding in thirds. A figure that appears in consecutive scenes glides to its new place instead of refolding. |
| **Pop-up book** | Each scene is a spread: the story pops up off the left page, the slide is printed on the right. Clicking turns the page; jumping riffles through pages. |
| **Whiteboard** | A marker sketches the scene, writes the story caption and the slide, then the camera pans along one endless board to the next scene, so the talk becomes one connected drawing. |
| **Kinetic typography** | The story is told in big animated words over bold colour fields; colour wipes carry the mood from scene to scene, then the slide lands. Numbers count up. |

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
layout and text, and its story (`src/shared/compiler.ts`).

- Edit a slide or its story → only that scene recompiles.
- Change the style, reorder slides or rename the deck → nothing recompiles.
- The final HTML is assembled from cached plans in milliseconds.

The editor shows **Built / Needs build** per row and how many scenes the last build
reused.

### The exported file

One self-contained `.html` (≈150–200 KB): a small framework-free player (~70 KB), the
style's fonts embedded as base64, and the scene data. It needs no internet connection
and no server.

### AI

`server/ai.ts` calls Claude through the official `@anthropic-ai/sdk` with structured
outputs (JSON schemas), from a Vite middleware, so the API key never reaches the
browser. It defaults to `claude-opus-5-5`; set `PUMPKIN_MODEL` to override. Requests
opt into server-side refusal fallbacks (`fallbacks: "default"`).

## Project layout

```
src/shared/     data model, motif library, palettes, planners, compiler, HTML assembly
src/runtime/    the presentation player bundled into every export
  styles/       origami.ts · book.ts · whiteboard.ts · kinetic.ts
src/editor/     the React editor
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

- Images on slides, and AI-generated custom illustrations beyond the motif library.
- Editing a scene plan by hand (change a motif or mood without changing the story).
- Speaker notes and a presenter view.
