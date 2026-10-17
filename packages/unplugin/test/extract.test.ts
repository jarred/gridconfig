import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findCalls, lineOf, localNames } from '../src/extract.ts';

const names = new Set(['grid']);

test('finds the local names of grid', () => {
	assert.deepEqual([...localNames(`import { grid } from '@gridconfig/core';`)], ['grid']);
	assert.deepEqual(
		[...localNames(`import { compileLayout, grid as g } from "@gridconfig/core"`)],
		['g']
	);
	assert.deepEqual([...localNames(`import type { grid } from '@gridconfig/core'`)], []);
	assert.deepEqual([...localNames(`import { grid } from 'other'`)], []);
	assert.deepEqual([...localNames(`import { type grid } from '@gridconfig/core'`)], []);
});

test('finds a template', () => {
	const code = 'const a = grid`\n  areas: A\n`;';
	const [call] = findCalls(code, names);
	assert.equal(call.kind, 'template');
	assert.equal(call.kind === 'template' && call.source, '\n  areas: A\n');
	assert.equal(code.slice(call.start, call.end), 'grid`\n  areas: A\n`');
});

test('reports interpolation', () => {
	const [call] = findCalls('grid`areas: ${x}`', names);
	assert.equal(call.kind, 'interpolation');
});

test('reads a static object', () => {
	const code = `grid({
		name: 'hero', // a comment
		areas: "A",
		600: { gap: 4, areas: \`A A
B B\` },
		'x400': { padding: -2.5, css: 'a\\nb' },
		list: [1, true, null, undefined],
	})`;
	const [call] = findCalls(code, names);
	assert.equal(call.kind, 'object');
	assert.deepEqual(call.kind === 'object' && call.value, {
		name: 'hero',
		areas: 'A',
		600: { gap: 4, areas: 'A A\nB B' },
		x400: { padding: -2.5, css: 'a\nb' },
		list: [1, true, null, undefined]
	});
});

test('skips calls that are not static', () => {
	const cases = [
		'grid(config)',
		'grid({ ...base, areas: "A" })',
		'grid({ areas: a + b })',
		'grid({ [key]: 1 })',
		'grid({ gap: size })',
		'grid({ areas: `${a}` })',
		'grid({ areas: "A" }, { tokenPrefix: "ds" })',
		'grid({ get a() { return 1 } })',
		'grid({ a: 0x10 })'
	];
	for (const code of cases) assert.deepEqual(findCalls(code, names), [], code);
});

test('ignores names that are part of other words or properties', () => {
	const cases = ['mygrid`a`', 'x.grid`a`', 'grids`a`', '$grid`a`', 'grid2({ areas: "A" })'];
	for (const code of cases) assert.deepEqual(findCalls(code, names), [], code);
});

test('finds calls in a single-file component', () => {
	const code = `<script lang="ts">
	import { grid } from '@gridconfig/core';
	const hero = grid\`
		areas: A
	\`;
</script>

<Grid layout={grid({ areas: 'A' })} />`;
	const calls = findCalls(code, names);
	assert.deepEqual(
		calls.map((c) => c.kind),
		['template', 'object']
	);
	assert.equal(lineOf(code, calls[0].start), 3);
});

test('supports an alias', () => {
	const calls = findCalls('g`areas: A` + g({ areas: "B" })', new Set(['g']));
	assert.equal(calls.length, 2);
});
