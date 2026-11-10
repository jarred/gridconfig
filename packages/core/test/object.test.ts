// `@gridconfig/core/object` is core without the YAML parser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as full from '../src/index.ts';
import * as lean from '../src/object.ts';
import { LayoutError } from '../src/errors.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');

/** Each module that a file imports, directly or through other files. Type imports do not count. */
function graph(entry: string, seen = new Set<string>()): Set<string> {
	if (seen.has(entry)) return seen;
	seen.add(entry);
	if (!entry.startsWith('./')) return seen;
	const code = readFileSync(join(SRC, entry), 'utf8');
	for (const m of code.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+'([^']+)'/gm))
		graph(m[1], seen);
	return seen;
}

test('the object entry and the runtime entry do not load the YAML parser', () => {
	for (const entry of ['./object.ts', './runtime.ts']) {
		const modules = graph(entry);
		assert.ok(!modules.has('yaml'), `${entry} loads yaml`);
		assert.ok(!modules.has('./parse.ts'), `${entry} loads parse.ts`);
	}
	// The check can find the parser: the main entry has it.
	assert.ok(graph('./index.ts').has('yaml'));
});

test('the object grid gives the same result as the grid of the main entry', () => {
	const input = { areas: 'A', gap: '{space.2}', 600: { areas: 'A B' } };
	assert.deepEqual(lean.grid(input), full.grid(input));
	const options = { tokenPrefix: 'ds', breakpoints: { md: '600..' } };
	const layout = { name: 'o', areas: 'A', gap: '{a}', md: { areas: 'A B' } };
	assert.deepEqual(lean.createGrid(options)(layout), full.createGrid(options)(layout));
	assert.deepEqual(
		lean.compileLayout(lean.parseLayoutObject(input)),
		full.compileLayout(full.parseLayoutObject(input))
	);
});

test('the object grid does not take a template', () => {
	const tag = lean.grid as unknown as (strings: TemplateStringsArray) => unknown;
	assert.throws(
		() => tag`areas: A`,
		(e) => e instanceof LayoutError && /takes an object only/.test(e.message)
	);
});
