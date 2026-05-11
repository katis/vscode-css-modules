import * as fs from 'node:fs';
import { indexCssModule, type CssIndex } from '../core/cssIndex';

export type DocumentReader = (cssPath: string) => string | undefined;

type Entry = {
  mtimeMs: number;
  source: string;
  index: CssIndex;
};

const LIVE_BUFFER_MTIME = -1;

export class CssIndexCache {
  private readonly cache = new Map<string, Entry>();
  private readonly readOpenDocument: DocumentReader;

  constructor(readOpenDocument: DocumentReader = () => undefined) {
    this.readOpenDocument = readOpenDocument;
  }

  get(cssPath: string): CssIndex | null {
    const live = this.readOpenDocument(cssPath);
    if (live !== undefined) {
      const cached = this.cache.get(cssPath);
      if (cached && cached.mtimeMs === LIVE_BUFFER_MTIME && cached.source === live) {
        return cached.index;
      }
      const index = indexCssModule(cssPath, live);
      this.cache.set(cssPath, { mtimeMs: LIVE_BUFFER_MTIME, source: live, index });
      return index;
    }

    let mtimeMs: number;
    try {
      mtimeMs = fs.statSync(cssPath).mtimeMs;
    } catch {
      this.cache.delete(cssPath);
      return null;
    }
    const cached = this.cache.get(cssPath);
    if (cached && cached.mtimeMs === mtimeMs) return cached.index;

    let source: string;
    try {
      source = fs.readFileSync(cssPath, 'utf8');
    } catch {
      this.cache.delete(cssPath);
      return null;
    }
    const index = indexCssModule(cssPath, source);
    this.cache.set(cssPath, { mtimeMs, source, index });
    return index;
  }

  invalidate(cssPath: string): void {
    this.cache.delete(cssPath);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
