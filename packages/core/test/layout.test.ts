import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileLayout } from '../src/compile.ts';
import { parseLayoutObject } from '../src/model.ts';
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
container: size
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
	assert.match(css, /\[data-grid-layout="hero"\] \{\n {2}--grid-gap: 0;\n {2}--grid-padding: 0;/);
	// 200x200 omits `cols`, so it is inferred and emitted again
	assert.match(
		css,
		/@container hero \(min-width: 200px\) and \(min-height: 200px\) \{\n {2}\[data-grid-layout="hero"\] \{\n {4}--grid-gap: var\(--space-2\);\n {4}grid-template-columns: repeat\(2, 1fr\);\n {4}grid-template-rows: 1fr 40px;\n {4}grid-template-areas: 'A A' '\. B';/
	);
	assert.match(
		css,
		/@container hero \(not \(\(min-width: 100px\) and \(min-height: 100px\)\)\) and \(not \(\(min-width: 200px\) and \(min-height: 200px\)\)\) \{\n {2}\[data-grid-layout="hero"\] > \[data-grid-area="B"\] \{ display: none !important; \}/
	);
});

test('mixed-axis steps follow the cascade, not the previous step', () => {
	const { css } = compileLayout(`
name: t
container: size
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
cols: minmax(200px, 1fr)*3
rows: 1fr*2
areas: |
  A A A
  B B B
100:
  cols: '{space.8} 1fr 100'
  rows: 40 1fr
  areas: |
    A B C
    . . .
200:
  cols: 300
  rows: 40
  areas: A
`);
	assert.match(css, /grid-template-columns: repeat\(3, minmax\(200px, 1fr\)\);/);
	assert.match(css, /grid-template-rows: repeat\(2, 1fr\);/);
	assert.match(css, /grid-template-columns: var\(--space-8\) 1fr 100px;/);
	assert.match(css, /grid-template-rows: 40px 1fr;/);
	// A bare number is px, also alone. The area map gives the track count.
	assert.match(css, /grid-template-columns: 300px;/);
	assert.match(css, /grid-template-rows: 40px;/);
});

test('the NxSIZE track shorthand is an error that gives the replacement', () => {
	fails('name: t\nareas: AAA\ncols: 3x200px', /write minmax\(200px, 1fr\)\*3/);
});

test('track counts are checked against the area map', () => {
	const own = fails(
		`
name: t
areas: |
  A B
cols: 1fr*3
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
container: size
areas: A
x400:
  areas: A B C
600x..400:
  cols: 1fr*3
`,
		/base step.*has 1/
	);
	assert.deepEqual(e.path, ['600x..400', 'cols']);
});

test('track counts that can never meet are not errors', () => {
	// `600` only ever applies together with `x400`'s map, because `600x400` shadows the base.
	compileLayout(`
name: t
container: size
areas: A
300x300:
  areas: A B C
600x300:
  cols: 1fr*3
`);
});

test('a map of capitals and dots with no spaces has one cell for each character', () => {
	const { css } = compileLayout('name: c\nareas: |\n  AAB\n  ..B\n');
	assert.match(css, /grid-template-areas: 'A A B' '\. \. B';/);
});

test('each other map has one name for each word, also in one column', () => {
	const { css, areas } = compileLayout('name: w\nareas: |\n  image\n  title\n  text\n');
	assert.deepEqual(areas, ['image', 'title', 'text']);
	assert.match(css, /grid-template-areas: 'image' 'title' 'text';/);
	assert.match(compileLayout('name: v\nareas: |\n  Header\n  Main\n').css, /'Header' 'Main'/);
});

test('a character map error says how the map was read', () => {
	fails(
		'name: h\nareas: |\n  HEADER\n  MAIN\n',
		/Row 2 has 4 cells, expected 6\. This map has no spaces and only capitals/
	);
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

const DEBUG_SRC = `
name: d
container: size
areas: |
  A
100x100:
  gap: 4
  areas: |
    A B
200x100:
  gap: 8
`;

test('debug is off by default', () => {
	const out = compileLayout(DEBUG_SRC);
	assert.equal(out.debug, undefined);
	assert.doesNotMatch(out.css, /--grid-debug/);
});

test('debug gives the steps in cascade order, with inferred values', () => {
	const { debug } = compileLayout(DEBUG_SRC, { debug: true });
	assert.ok(debug);
	assert.equal(debug.v, 2);
	assert.deepEqual(debug.areas, ['A', 'B']);
	assert.deepEqual(
		debug.steps.map((s) => s.key),
		[null, '100x100', '200x100']
	);
	assert.equal(debug.steps[0].cols, 'repeat(1, 1fr)');
	assert.equal(debug.steps[0].gap, '0');
	assert.equal(debug.steps[1].gap, '4px');
	assert.equal(debug.steps[1].cols, 'repeat(2, 1fr)');
	assert.deepEqual(debug.steps[1].areas, [['A', 'B']]);
	assert.deepEqual(debug.steps[2].when, [{ w: { min: 200 }, h: { min: 100 } }]);
	assert.equal(debug.steps[0].when, undefined);
	assert.equal(debug.steps[2].gap, '8px');
	assert.equal(debug.steps[2].cols, undefined);
});

test('the css carries the debug data as a CSS string that decodes to the same JSON', () => {
	const { css, debug } = compileLayout(DEBUG_SRC, { debug: true });
	const m = /--grid-debug: ("(?:[^"\\]|\\.)*");/.exec(css);
	assert.ok(m);
	// A CSS string and a JSON string use the same escapes for \ and ".
	assert.deepEqual(JSON.parse(JSON.parse(m[1])), debug);
});

test('debug does not change the other css', () => {
	const plain = compileLayout(DEBUG_SRC, { layer: false }).css;
	const withDebug = compileLayout(DEBUG_SRC, { layer: false, debug: true }).css;
	assert.equal(withDebug.replace(/ --grid-debug: "(?:[^"\\]|\\.)*";/, ''), plain);
});

test('every step sets --grid-step to its key, and the base sets "base"', () => {
	const { css } = compileLayout(
		`
name: s
container: size
areas: A
100x100:
  gap: 4
x400:
  padding: 2
600x100:
  gap: 8
`,
		{ layer: false }
	);
	assert.match(css, /\[data-grid-layout="s"\] \{[^}]*--grid-step: base;\n\}/);
	for (const [query, key] of [
		['(min-width: 100px) and (min-height: 100px)', '100x100'],
		['(min-height: 400px)', 'x400'],
		['(min-width: 600px) and (min-height: 100px)', '600x100']
	])
		assert.ok(
			css.includes(`@container s ${query} {\n  [data-grid-layout="s"] {`) &&
				new RegExp(
					`@container s ${query.replace(/[()]/g, '\\$&')} \\{[^}]*--grid-step: ${key};`
				).test(css),
			`${key} sets --grid-step`
		);
});

test('a step that sets nothing else still gets a block for --grid-step', () => {
	const { css } = compileLayout('name: e\nareas: A\n500:\n  css: ""\n', { layer: false });
	assert.match(
		css,
		/@container e \(min-width: 500px\) \{\n {2}\[data-grid-layout="e"\] \{\n {4}--grid-step: 500;/
	);
});

test('gap and padding are in --grid-gap and --grid-padding, and cannot refer to themselves', () => {
	const { css } = compileLayout('name: g\ngap: --gap * 2\npadding: --grid-gap\nareas: A');
	assert.match(css, /--grid-gap: calc\(var\(--gap\) \* 2\);/);
	assert.match(css, /--grid-padding: var\(--grid-gap\);/);
	fails('name: g\ngap: --grid-gap\nareas: A', /`gap` cannot use --grid-gap/);
	fails('name: g\nareas: A\n600:\n  gap: --grid-gap * 2', /`gap` cannot use --grid-gap/);
	fails(
		'name: g\npadding: 4 var( --grid-padding , 8px)\nareas: A',
		/`padding` cannot use --grid-padding/
	);
});

test('a value cannot leave its declaration', () => {
	const bad = [
		'gap: "</style><script>alert(1)</script>"',
		'gap: "0;position:fixed"',
		'padding: "0 /* x"',
		`cols: "url('x') 1fr"`,
		'rows: "1fr\\\\"',
		'flow:\n  A: row gap 0;x',
		'flow:\n  A:\n    gap: "0;x"'
	];
	for (const setting of bad) fails(`name: v\nareas: A\n${setting}`, /cannot be in a value/);
	assert.throws(
		() => compileLayout('name: v\ngap: "{a.b}"\nareas: A', { tokenVar: () => '</style>' }),
		/cannot be in a value/
	);
});

test('css must be a string that stays in its rule', () => {
	fails('name: c\nareas: A\ncss:\n  color: red', /`css` must be a string/);
	fails('name: c\nareas: A\ncss: "color: red } body { display: none"', /"}" with no "{"/);
	fails('name: c\nareas: A\ncss: "&:hover { color: red"', /"{" that is not closed/);
	fails('name: c\nareas: A\ncss: "content: \'x"', /string that is not closed/);
	fails('name: c\nareas: A\ncss: "color: red /* x"', /comment that is not closed/);
	const { css } = compileLayout(
		`name: c\nareas: A\ncss: "content: '}'; /* } */ &:hover { color: red }"`
	);
	assert.ok(css.includes(`content: '}'; /* } */ &:hover { color: red };`));
});

test('names that CSS reserves', () => {
	fails('name: none\nareas: A', /"none" is reserved in CSS/);
	fails('name: Default\nareas: A', /reserved in CSS/);
	assert.equal(compileLayout('areas: A', { defaultName: 'none' }).name, '_none');
	assert.equal(compileLayout('areas: A', { defaultName: 'not' }).name, '_not');
	assert.equal(compileLayout('areas: A', { defaultName: 'nothing' }).name, 'nothing');
	fails('name: r\nareas: revert-layer', /"revert-layer" is reserved/);
});

test('line names are not tracks', () => {
	const { css } = compileLayout(
		'name: l\ncols: "[full-start side-start] 200 [side-end main-start] 1fr [main-end full-end]"\nareas: A B'
	);
	assert.match(
		css,
		/grid-template-columns: \[full-start side-start\] 200px \[side-end main-start\] 1fr \[main-end full-end\];/
	);
	fails('name: l\ncols: "[a b 200 1fr"\nareas: A B', /Unbalanced/);
});

test('calculated rows are auto with inline-size, and 1fr with size', () => {
	const stack = 'areas: |\n  A\n  B\n  C\n400:\n  areas: |\n    A B\n    A C\n';
	const inline = compileLayout(`name: i\n${stack}`).css;
	assert.match(
		inline,
		/grid-template-columns: repeat\(1, 1fr\);\n\s*grid-template-rows: repeat\(3, auto\);/
	);
	assert.match(
		inline,
		/grid-template-columns: repeat\(2, 1fr\);\n\s*grid-template-rows: repeat\(2, auto\);/
	);
	const sized = compileLayout(`name: s\ncontainer: size\n${stack}`).css;
	assert.match(sized, /grid-template-rows: repeat\(3, 1fr\);/);
	assert.match(sized, /grid-template-rows: repeat\(2, 1fr\);/);
	// A step that sets `rows` keeps them.
	assert.match(
		compileLayout(`name: r\nrows: 1fr*3\n${stack}`).css,
		/grid-template-rows: repeat\(3, 1fr\);/
	);
});

test('a setting with no value is an error', () => {
	fails('name: n\nareas: A\n600:\n  gap:\n', /`gap` has no value/);
	fails('name: n\nareas: A\npadding:\n', /`padding` has no value/);
	fails('name:\nareas: A\n', /`name` has no value/);
	fails('name: n\ncontainer: ~\nareas: A\n', /`container` has no value/);
	fails('name: n\nareas: A\nflow:\n  A:\n    gap: ~\n', /Expected a number or a string/);
	// In an object, `undefined` is a setting that is absent.
	assert.equal(
		compileLayout(parseLayoutObject({ name: 'n', areas: 'A', gap: undefined })).name,
		'n'
	);
});

test('the count of the SIZE*N shorthand is 1 or more', () => {
	fails('name: z\ncols: 1fr*0\nareas: A', /"1fr\*0" has a count of 0/);
});

test('anchors and aliases are not supported', () => {
	const anchor = fails('name: a\nareas: &map A\n', /Anchors are not supported \("&map"\)/);
	assert.equal(anchor.range?.start.line, 2);
	fails('name: a\nareas: &map A\n600:\n  areas: *map\n', /not supported/);
	const alias = fails('name: a\ngap: 4\n600:\n  gap: *g\n', /Aliases are not supported \("\*g"\)/);
	assert.equal(alias.range?.start.line, 4);
});

test('an error in an indented layout has the column of the source as it is written', () => {
	// The parser removes the indentation that all lines share. The range still counts it.
	const spaces = fails('    name: c\n    areas: A\n    600:\n      gap: 1 +\n', /operator/i);
	assert.deepEqual(spaces.range?.start, { line: 4, col: 12 });
	// A leading tab counts as two spaces for YAML, and as one character for the column.
	const tabs = fails('\t\tname: c\n\t\tareas: A\n\t\tgap: 1 +\n', /operator/i);
	assert.deepEqual(tabs.range?.start, { line: 3, col: 8 });
	const plain = fails('name: c\nareas: A\ngap: 1 +\n', /operator/i);
	assert.deepEqual(plain.range?.start, { line: 3, col: 6 });
});
