// Runs after `tsc`. The source imports the stylesheet with `./style.css?raw`, which only a
// bundler such as Vite understands. This script puts the text of the stylesheet in the built
// file, so that the published package is plain JavaScript and needs no bundler.
//
// Usage: node scripts/inline-css.js [dist]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(process.argv[2] ?? join(root, 'dist'));
const file = join(dist, 'inspector.js');
const IMPORT = /^import (\w+) from '\.\/style\.css\?raw';$/m;

const code = readFileSync(file, 'utf8');
const match = IMPORT.exec(code);
if (!match) throw new Error(`${file}: no import of ./style.css?raw found`);

const css = readFileSync(join(root, 'src/style.css'), 'utf8');
writeFileSync(
	file,
	code.replace(IMPORT, () => `const ${match[1]} = ${JSON.stringify(css)};`)
);
if (/\?raw['"]/.test(readFileSync(file, 'utf8'))) throw new Error(`${file}: a ?raw import is left`);
