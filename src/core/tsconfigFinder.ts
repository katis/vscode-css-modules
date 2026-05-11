import * as fs from 'node:fs';
import * as path from 'node:path';

const dirCache = new Map<string, string | null>();

export function clearTsconfigFinderCache(): void {
  dirCache.clear();
}

export function invalidateTsconfigFinderDir(dir: string): void {
  dirCache.delete(dir);
}

export function findTsconfigFor(filePath: string): string | null {
  let dir = path.dirname(filePath);
  const visited: string[] = [];

  while (true) {
    const cached = dirCache.get(dir);
    if (cached !== undefined) {
      for (const v of visited) dirCache.set(v, cached);
      return cached;
    }

    if (path.basename(dir) === 'node_modules') {
      dirCache.set(dir, null);
      for (const v of visited) dirCache.set(v, null);
      return null;
    }

    const candidate = path.join(dir, 'tsconfig.json');
    if (fileExists(candidate)) {
      dirCache.set(dir, candidate);
      for (const v of visited) dirCache.set(v, candidate);
      return candidate;
    }

    visited.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) {
      dirCache.set(dir, null);
      for (const v of visited) dirCache.set(v, null);
      return null;
    }
    dir = parent;
  }
}

function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}
