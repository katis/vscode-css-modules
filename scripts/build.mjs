// @ts-check
import { build, context } from 'esbuild';
import { argv } from 'node:process';

const watch = argv.includes('--watch');
const prod = argv.includes('--prod');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'out/extension.js',
  external: ['vscode'],
  sourcemap: !prod,
  minify: prod,
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('esbuild: watching for changes...');
} else {
  await build(options);
}
