// Bundles the extension host (Node, cjs) and the webview (browser, iife).
// Flags: --watch (rebuild on change, with sourcemaps), --dev (sourcemaps only),
// --tests (bundle src/test/**/*.test.ts → out-test/ for @vscode/test-cli instead).
import * as esbuild from 'esbuild';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');
const tests = process.argv.includes('--tests');

/** @type {import('esbuild').BuildOptions} */
const common = { bundle: true, sourcemap: dev, minify: !dev, logLevel: 'info' };

/** @type {import('esbuild').BuildOptions[]} */
const builds = [
  {
    ...common,
    entryPoints: ['src/extension/main.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
  },
  {
    ...common,
    entryPoints: ['src/webview/main.ts'],
    outfile: 'dist/webview.js',
    platform: 'browser',
    format: 'iife',
    target: 'chrome120',
  },
];

if (tests) {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.test.ts') ? [join(dir, e.name)] : []));
  await esbuild.build({
    ...common,
    sourcemap: true,
    entryPoints: walk('src/test'),
    outdir: 'out-test',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode', 'mocha'],
  });
} else if (watch) {
  const contexts = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(contexts.map((c) => c.watch()));
  console.log('watching…');
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
