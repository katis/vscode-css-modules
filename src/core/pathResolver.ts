import * as path from 'node:path';
import type { LoadedTsconfig } from './tsconfigLoader';

export function resolveImport(
  importerPath: string,
  tsconfig: LoadedTsconfig | null,
  specifier: string,
): string[] {
  if (specifier.startsWith('./') || specifier.startsWith('../') || specifier === '.' || specifier === '..') {
    return [path.resolve(path.dirname(importerPath), specifier)];
  }

  if (path.isAbsolute(specifier)) {
    return [path.normalize(specifier)];
  }

  if (!tsconfig) return [];

  const candidates: string[] = [];
  for (const p of tsconfig.paths) {
    if (p.hasWildcard) {
      if (specifier.length < p.prefix.length + p.suffix.length) continue;
      if (!specifier.startsWith(p.prefix) || !specifier.endsWith(p.suffix)) continue;
      const captured = specifier.slice(p.prefix.length, specifier.length - p.suffix.length);
      for (const target of p.targets) {
        candidates.push(target.includes('*') ? target.replace('*', captured) : target);
      }
    } else if (specifier === p.pattern) {
      for (const target of p.targets) candidates.push(target);
    }
  }
  return candidates;
}
