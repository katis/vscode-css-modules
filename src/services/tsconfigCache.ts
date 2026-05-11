import { findTsconfigFor, clearTsconfigFinderCache } from '../core/tsconfigFinder';
import { loadTsconfig, clearTsconfigLoaderCache, type LoadedTsconfig } from '../core/tsconfigLoader';

export class TsconfigCache {
  getForFile(filePath: string): LoadedTsconfig | null {
    const configPath = findTsconfigFor(filePath);
    if (!configPath) return null;
    return loadTsconfig(configPath);
  }

  // A new or moved tsconfig anywhere in the tree can flip ancestor resolution for many
  // files. Cheaper to clear everything than track which directories were affected.
  invalidateAll(): void {
    clearTsconfigFinderCache();
    clearTsconfigLoaderCache();
  }
}
