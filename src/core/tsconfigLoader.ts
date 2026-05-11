import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

export type PathPattern = {
  pattern: string;
  prefix: string;
  suffix: string;
  hasWildcard: boolean;
  targets: string[];
};

export type LoadedTsconfig = {
  configPath: string;
  baseDir: string;
  paths: PathPattern[];
};

type CacheEntry = { mtimeMs: number; value: LoadedTsconfig | null };

const cache = new Map<string, CacheEntry>();

export function clearTsconfigLoaderCache(): void {
  cache.clear();
}

export function loadTsconfig(configPath: string): LoadedTsconfig | null {
  const mtimeMs = statMtime(configPath);
  if (mtimeMs === null) {
    cache.delete(configPath);
    return null;
  }
  const cached = cache.get(configPath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.value;

  const value = parseAndNormalize(configPath);
  cache.set(configPath, { mtimeMs, value });
  return value;
}

function parseAndNormalize(configPath: string): LoadedTsconfig | null {
  const readResult = ts.readConfigFile(configPath, (p) => safeReadFile(p));
  if (readResult.error || !readResult.config) return null;

  const configDir = path.dirname(configPath);
  const parsed = ts.parseJsonConfigFileContent(
    readResult.config,
    {
      readDirectory: () => [],
      fileExists: (p) => safeFileExists(p),
      readFile: (p) => safeReadFile(p),
      useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    },
    configDir,
    undefined,
    configPath,
  );

  const baseUrlOpt = parsed.options.baseUrl;
  const baseDir = baseUrlOpt
    ? path.isAbsolute(baseUrlOpt) ? baseUrlOpt : path.resolve(configDir, baseUrlOpt)
    : configDir;

  const paths: PathPattern[] = [];
  const rawPaths = parsed.options.paths;
  if (rawPaths) {
    for (const [pattern, targets] of Object.entries(rawPaths)) {
      if (!Array.isArray(targets) || targets.length === 0) continue;
      const wildcardIdx = pattern.indexOf('*');
      const hasWildcard = wildcardIdx !== -1;
      const prefix = hasWildcard ? pattern.slice(0, wildcardIdx) : pattern;
      const suffix = hasWildcard ? pattern.slice(wildcardIdx + 1) : '';
      const absTargets: string[] = [];
      for (const t of targets) {
        if (typeof t !== 'string') continue;
        absTargets.push(path.isAbsolute(t) ? path.normalize(t) : path.resolve(baseDir, t));
      }
      if (absTargets.length > 0) {
        paths.push({ pattern, prefix, suffix, hasWildcard, targets: absTargets });
      }
    }
  }

  return { configPath, baseDir, paths };
}

function statMtime(p: string): number | null {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return null;
  }
}

function safeReadFile(p: string): string | undefined {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return undefined;
  }
}

function safeFileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}
