// Entry point of the exported presentation.

import type { RuntimeData, StyleId } from '../shared/types.ts';
import { wait } from './dom.ts';
import { Player, type Renderer } from './player.ts';
import { BookRenderer } from './styles/book.ts';
import { KineticRenderer } from './styles/kinetic.ts';
import { OrigamiRenderer } from './styles/origami.ts';
import { WhiteboardRenderer } from './styles/whiteboard.ts';

const RENDERERS: Record<StyleId, () => Renderer> = {
  kinetic: () => new KineticRenderer(),
  whiteboard: () => new WhiteboardRenderer(),
  origami: () => new OrigamiRenderer(),
  book: () => new BookRenderer(),
};

async function loadFonts(): Promise<void> {
  // Embedded fonts only load once used; load them all up front so text can be measured.
  const faces: Promise<unknown>[] = [];
  document.fonts.forEach((face) => faces.push(face.load().catch(() => null)));
  await Promise.race([Promise.all(faces), wait(3000)]);
}

async function boot(): Promise<void> {
  const root = document.getElementById('pp-root');
  const dataEl = document.getElementById('pp-data');
  if (!root || !dataEl) return;
  const data = JSON.parse(dataEl.textContent || '{}') as RuntimeData;
  await loadFonts();
  const make = RENDERERS[data.style] ?? RENDERERS.kinetic;
  new Player(root, data, make()).start();
}

boot();
