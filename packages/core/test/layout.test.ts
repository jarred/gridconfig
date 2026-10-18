import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileLayout } from '../src/compile.ts';
import { LayoutError } from '../src/errors.ts';
import { compileValue } from '../src/values.ts';

function fails(source: string, message: RegExp): LayoutError {
	try {
		compileLayout(source);
	} catch (e) {
		assert.ok(e instanceof LayoutError, `expected a LayoutError, got ${e}`);
		assert.match(e.message, message);
		return e;
	}
	assert.fail('expected compileLayout to throw');
}

test('value grammar', () => {
	const cases: [unknown, string][] = [
		[8, '8px'],
		[0, '0'],
		['4 8', '4px 8px'],
		['--gap', 'var(--gap)'],
		['{space.2}', 'var(--space-2)'],
		['{space.2} 16', 'var(--space-2) 16px'],
		['--gap * 2', 'calc(var(--gap) * 2)'],
		['2 * --gap', 'calc(2 * var(--gap))'],
		['{space.2} + 4', 'calc(var(--space-2) + 4px)'],
		['--a - --b', 'calc(var(--a) - var(--b))'],
		['var(--x, 8px)', 'var(--x, 8px)'],
		['clamp(4, {space.2}, 16)', 'clamp(4, var(--space-2), 16)'],
		['-2.5', '-2.5px']
	];
	for (const [input, expected] of cases)
		assert.equal(compileValue(input, {}, []), expected, String(input));
});

test('token options', () => {
	assert.equal(compileValue('{space.2}', { tokenPrefix: 'ds' }, []), 'var(--ds-space-2)');
	assert.equal(compileValue('{space.2}', { tokenVar: (p) => `token(${p})` }, []), 'token(space.2)');
});

test('value grammar errors', () => {
	for (const bad of ['{}', '{space.2', 'calc(1', '+ 4', '4 +', '4 + + 4', '4 8 + 2'])
		assert.throws(() => compileValue(bad, {}, []), LayoutError, bad);
});

test('example layout compiles as the spec shows', () => {
	const { css, areas, warnings } = compileLayout(
		`
name: hero
areas: A
100x100:
  gap: 4
  areas: |
    A A
    B B
200x200:
  gap: '{space.2}'
  rows: 1fr 40px
  areas: |
    A A
    . B
`,
		{ layer: false }
	);
	assert.deepEqual(areas, ['A', 'B']);
	assert.deepEqual(warnings, []);
	assert.match(css, /\[data-grid-host="hero"\] \{ container: hero \/ size; \}/);
	assert.match(css, /\[data-grid-layout="hero"\] \{\n {2}--gap: 0;\n {2}--padding: 0;/);
	// 200x200 omits `cols`, so it is inferred and emitted again
	assert.match(
		css,
		/@container hero \(min-width: 200px\) and \(min-height: 200px\) \{\n {2}\[data-grid-layout="hero"\] \{\n {4}--gap: var\(--space-2\);\n {4}grid-template-columns: repeat\(2, 1fr\);\n {4}grid-template-rows: 1fr 40px;\n {4}grid-template-areas: 'A A' '\. B';/
	);
	assert.match(
		css,
		/@container hero \(not \(\(min-width: 100px\) and \(min-height: 100px\)\)\) and \(not \(\(min-width: 200px\) and \(min-height: 200px\)\)\) \{\n {2}\[data-grid-layout="hero"\] > \[data-grid-area="B"\] \{ display: none !important; \}/
	);
});

test('mixed-axis steps follow the cascade, not the previous step', () => {
	const { css } = compileLayout(`
name: t
areas: A
x400:
  areas: A B
600:
  gap: 8
`);
	// `600` sets no areas, so it neither emits a map nor takes part in hiding B.
	// At 700x300 only `600` matches: the base map applies and B must stay hidden.
	assert.match(
		css,
		/@container t \(not \(min-height: 400px\)\) \{\n {2}\[data-grid-layout="t"\] > \[data-grid-area="B"\] \{ display: none !important; \}/
	);
	const sixHundred = css.split('@container t (min-width: 600px) {')[1].split('\n}')[0];
	assert.doesNotMatch(sixHundred, /grid-template/);
});

test('hiding follows the last areas step, not every later step', () => {
	const { css } = compileLayout(`
name: t
areas: A
300:
  areas: A B
600:
  areas: A
`);
	assert.match(
		css,
		/@container t \(min-width: 600px\) \{\n {2}\[data-grid-layout="t"\] > \[data-grid-area="B"\]/
	);
	assert.match(
		css,
		/@container t \(not \(min-width: 300px\)\) and \(not \(min-width: 600px\)\) \{/
	);
});

test('tracks', () => {
	const { css } = compileLayout(`
name: t
cols: 3x200px
rows: 1fr*2
areas: |
  A A A
  B B B
100:
  cols: '{space.8} 1fr 100'
  rows: 2
  areas: |
    A B C
    . . .
`);
	assert.match(css, /grid-template-columns: repeat\(3, minmax\(200px, 1fr\)\);/);
	assert.match(css, /grid-template-rows: repeat\(2, 1fr\);/);
	assert.match(css, /grid-template-columns: var\(--space-8\) 1fr 100px;/);
});

test('track counts are checked against the area map', () => {
	const own = fails(
		`
name: t
areas: |
  A B
cols: 3
`,
		/3 tracks but the area map has 2/
	);
	assert.deepEqual(own.path, ['cols']);
});

test('track counts are checked against every map that can be active with them', () => {
	// At 700x300 the base map (1 column) is active together with `600`'s 3 columns.
	const e = fails(
		`
name: t
areas: A
x400:
  areas: A B C
600:
  cols: 3
`,
		/base step.*has 1/
	);
	assert.deepEqual(e.path, ['600', 'cols']);
});

test('track counts that can never meet are not errors', () => {
	// `600` only ever applies together with `x400`'s map, because `600x400` shadows the base.
	compileLayout(`
name: t
areas: A
300x300:
  areas: A B C
600x300:
  cols: 3
`);
});

test('errors carry a path and a source range', () => {
	const e = fails(
		`name: t
areas: |
  A B
  C
`,
		/Row 2 has 1 cells/
	);
	assert.deepEqual(e.path, ['areas']);
	assert.equal(e.range?.start.line, 2);
});

test('errors', () => {
	fails('name: 1bad\nareas: A', /valid identifier/);
	fails('name: t', /base step must set `areas`/);
	fails('name: t\nareas: A\nfoo: 1', /Unknown key "foo"/);
	fails('name: t\nareas: A\n100:\n  gap: 1\n100x:\n  gap: 2', /duplicates/);
	fails('name: t\nareas: A\n100:\n  nope: 1', /Unknown setting "nope"/);
	fails('name: t\nareas: A\n100:\n  name: x', /top level/);
	fails('name: t\nareas: |\n  A auto', /reserved/);
	fails('name: t\nareas: |\n  A B A', /not a filled rectangle/);
	fails('name: t\nareas: A\ncss: "</style><script>"', /<\/style/);
	fails('name: t\nareas: A\ncols: 1fr + 2px', /Operators are not supported/);
	fails('name: t\nareas: A\ngap: "{}"', /Invalid token/);
	fails('name: t\n  bad: [', /./);
});

test('warns about block-axis container units under inline-size', () => {
	const { warnings } = compileLayout(`
name: t
container: inline-size
areas: |
  A
  B
rows: 20cqh 1fr
`);
	assert.equal(warnings.length, 1);
	assert.deepEqual(warnings[0].path, ['rows']);
});

const LAYER_SRC = `
name: l
areas: |
  A B
400:
  areas: A
`;

test('css is in the gridconfig layer by default, and hide rules are not', () => {
	const { css, layer } = compileLayout(LAYER_SRC);
	assert.equal(layer, 'gridconfig');
	assert.match(css, /^@layer gridconfig \{\n/);
	const hideAt = css.indexOf('display: none !important');
	assert.ok(hideAt > css.indexOf('\n}\n'), 'hide rule comes after the layer block');
	assert.doesNotMatch(css.slice(0, css.indexOf('\n}\n')), /display: none/);
});

test('layer: false gives unlayered css and layer: null', () => {
	const { css, layer } = compileLayout(LAYER_SRC, { layer: false });
	assert.equal(layer, null);
	assert.doesNotMatch(css, /@layer/);
});

test('layer accepts a custom name and rejects an invalid one', () => {
	assert.equal(compileLayout(LAYER_SRC, { layer: 'components' }).layer, 'components');
	assert.match(compileLayout(LAYER_SRC, { layer: 'components' }).css, /^@layer components \{/);
	assert.throws(() => compileLayout(LAYER_SRC, { layer: '1 bad' }));
});

test('baseCssFor uses the same layer', async () => {
	const { baseCssFor, baseCss } = await import('../src/index.ts');
	assert.match(baseCssFor('components'), /^@layer components \{/);
	assert.equal(baseCss, baseCssFor());
	assert.doesNotMatch(baseCssFor(null as never), /@layer/);
});
