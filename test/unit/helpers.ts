import * as path from 'node:path';

export const fixturesRoot = path.resolve(__dirname, '..', '..', '..', 'test', 'fixtures');

export function fixture(...segments: string[]): string {
  return path.join(fixturesRoot, ...segments);
}
