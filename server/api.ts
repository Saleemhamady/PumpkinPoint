// HTTP endpoints used by the editor. Mounted under /api by the Vite plugin, so the
// API key stays on the server and never reaches the browser.

import type { IncomingMessage, ServerResponse } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import type { PolishText } from '../src/shared/plan.ts';
import type { SlideElement } from '../src/shared/types.ts';
import { PumpkinAI, type AiConfig } from './ai.ts';

type Next = (err?: unknown) => void;

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > 2_000_000) reject(new Error('Request too large'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function errorMessage(err: unknown): { status: number; message: string } {
  if (err instanceof Anthropic.AuthenticationError) return { status: 401, message: 'The Anthropic API key was rejected.' };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: 'Rate limited by the Anthropic API. Try again shortly.' };
  if (err instanceof Anthropic.APIError) return { status: 502, message: `Anthropic API error${err.status ? ` ${err.status}` : ''}: ${err.message}` };
  return { status: 500, message: err instanceof Error ? err.message : String(err) };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? '')) : []);

export function createApiHandler(config: AiConfig) {
  const ai = new PumpkinAI(config);
  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const url = (req.url ?? '').split('?')[0];
    try {
      if (req.method === 'GET' && url === '/status') return send(res, 200, { ai: ai.available, model: ai.model });
      if (req.method !== 'POST') return next();
      if (!ai.available) return send(res, 503, { error: 'AI is off: set ANTHROPIC_API_KEY in .env and restart.' });
      const body = await readJson(req);
      switch (url) {
        case '/slides':
          return send(res, 200, await ai.generateSlides(String(body.topic ?? ''), Number(body.count ?? 6), String(body.audience ?? '')));
        case '/polish':
          return send(res, 200, { texts: await ai.polishSlide(Array.isArray(body.texts) ? (body.texts as PolishText[]) : [], strings(body.context)) });
        case '/stories': {
          const only = typeof body.only === 'number' ? body.only : null;
          return send(res, 200, { stories: await ai.writeStories(String(body.title ?? ''), strings(body.slides), strings(body.existing), only) });
        }
        case '/scene':
          return send(res, 200, await ai.compileScene(Array.isArray(body.elements) ? (body.elements as SlideElement[]) : [], String(body.story ?? ''), Number(body.index ?? 0), Number(body.total ?? 1)));
        default:
          return next();
      }
    } catch (err) {
      const { status, message } = errorMessage(err);
      send(res, status, { error: message });
    }
  };
}
