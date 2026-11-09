// Verifies that each copied core module equals the current ../byheart file
// byte-for-byte once its first header line is removed. Exit 1 on any DIFFERS.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webapp = resolve(root, '..', 'byheart');
const header = /^\/\/ Copied from \.\.\/byheart (\S+) at commit ([0-9a-f]{7,40}) \(([^)]*)\)\./;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

if (!existsSync(webapp)) {
  console.log('skipped: ../byheart not found');
  process.exit(0);
}

let differs = 0;
for (const file of walk(join(root, 'src', 'core')).sort()) {
  const text = readFileSync(file, 'utf8');
  const newline = text.indexOf('\n');
  const first = newline === -1 ? text : text.slice(0, newline);
  const m = header.exec(first);
  const rel = file.slice(root.length + 1);
  if (!m) {
    console.log(`DIFFERS  ${rel}  (missing copy header)`);
    differs++;
    continue;
  }
  const [, srcPath, commit] = m;
  const source = join(webapp, srcPath);
  if (!existsSync(source)) {
    console.log(`DIFFERS  ${rel}  (source ${srcPath} not found)  recorded commit ${commit}`);
    differs++;
    continue;
  }
  const body = Buffer.from(text.slice(newline + 1), 'utf8');
  const same = body.equals(readFileSync(source));
  console.log(`${same ? 'same   ' : 'DIFFERS'}  ${rel}  ← ${srcPath}  recorded commit ${commit}`);
  if (!same) differs++;
}
process.exit(differs ? 1 : 0);
