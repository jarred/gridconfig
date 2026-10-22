import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LayoutError, compileLayout, grid, parseLayout } from '../src/index.ts';
import { matches, parseQuery, samplePoints } from '../src/query.ts';

function fails(source: string, pattern: RegExp, options = {}): LayoutError {
	try {
		compileLayout(source, options);
	} catch (e) {
		assert.ok(e instanceof LayoutError, String(e));
		assert.match(e.message, pattern);
		return e;
	}
	assert.fail(`expected an error matching ${pattern}`);
}

/** The container condition of each step block, in output order. */
const blocks = (css: string) =>
	[...css.matchAll(/^@container \S+ (.+) \{\n {2}\[data-grid-layout/gm)].map((m) => m[1]);

test('the key grammar compiles to container conditions', () => {
	const { css } = compileLayout(
		`
name: q
areas: A
..400:
  gap: 1
400..900:
  gap: 2
900x..500:
  padding: 1
x300..600:
  cols: 1
4/3..16/9:
  css: 'color: red'
`,
		{ layer: false }
	);
	assert.deepEqual(
		blocks(css).sort(),
		[
			'(400px <= width < 900px)',
			'(4/3 <= aspect-ratio < 16/9)',
			'(min-width: 900px) and (height < 500px)',
			'(300px <= height < 600px)',
			'(width < 400px)'
		].sort()
	);
});

test('ratios, orientation, AND and OR', () => {
	const { css } = compileLayout(
		`
name: q
areas: A
16/9:
  gap: 1
..3/4 600:
  padding: 1
landscape x..300:
  css: 'color: red'
'..400, x..200':
  rows: 1
`,
		{ layer: false }
	);
	const all = blocks(css);
	assert.ok(all.includes('(aspect-ratio >= 16/9)'), all.join('\n'));
	assert.ok(all.includes('(min-width: 600px) and (aspect-ratio < 3/4)'), all.join('\n'));
	assert.ok(all.includes('(height < 300px) and (orientation: landscape)'), all.join('\n'));
	assert.ok(all.includes('(width < 400px) or (height < 200px)'), all.join('\n'));
});

test('an OR of clauses with more than one part gets ()', () => {
	const { css } = compileLayout('name: q\nareas: A\n"600x400, landscape 900":\n  gap: 1\n', {
		layer: false
	});
	assert.deepEqual(blocks(css), [
		'((min-width: 600px) and (min-height: 400px)) or ((min-width: 900px) and (orientation: landscape))'
	]);
});

test('adjacent ranges meet exactly: they do not overlap', () => {
	const { css } = compileLayout(`
name: q
areas: A
..600:
  areas: A B
600..900:
  areas: A B C
900..:
  areas: A
`);
	assert.match(css, /@container q \(width < 600px\)/);
	// At 600 exactly, only 600..900 matches.
	const at600 = parseQuery('..600', new Map(), []);
	assert.equal(matches(at600, 600, 10), false);
	assert.equal(matches(parseQuery('600..900', new Map(), []), 600, 10), true);
});

test('the hide rule for a step with a max', () => {
	const { css } = compileLayout(`
name: q
areas: A B
..600:
  areas: A
`);
	assert.match(
		css,
		/@container q \(width < 600px\) \{\n {2}\[data-grid-layout="q"\] > \[data-grid-area="B"\] \{ display: none !important; \}/
	);
});

test('the hide rule for an OR step uses () so that it can be negated', () => {
	const { css } = compileLayout(`
name: q
areas: A
'..400, x..300':
  areas: A B
900x300..:
  areas: A
`);
	assert.match(
		css,
		/@container q \(not \(\(width < 400px\) or \(height < 300px\)\)\) and \(not \(\(min-width: 900px\) and \(min-height: 300px\)\)\) \{/
	);
});

test('a more specific step wins, in any source order', () => {
	const order = (source: string) => parseLayout(source).steps.map((s) => s.key ?? 'base');
	// 600x400 is inside 600 and inside x400, so it comes after both.
	assert.deepEqual(order('areas: A\n600x400:\n  gap: 1\nx400:\n  gap: 2\n600:\n  padding: 1\n'), [
		'base',
		'x400',
		'600',
		'600x400'
	]);
	assert.deepEqual(order('areas: A\n1200:\n  gap: 1\n600..1200:\n  gap: 2\n600:\n  gap: 3\n'), [
		'base',
		'600',
		'600..1200',
		'1200'
	]);
});

test('the object form does not depend on the order of number keys', () => {
	// JavaScript lists number keys first, so 600 comes before '1200x' in Object.entries.
	const out = grid(
		{ name: 'o', areas: 'A', '1200x': { gap: 2 }, 600: { gap: 1 } },
		{ debug: true }
	);
	assert.deepEqual(
		out.debug!.steps.map((s) => s.key),
		[null, '600', '1200x']
	);
});

test('two steps that set the same property must not overlap without a winner', () => {
	const e = fails(
		'name: q\nareas: A\nx400:\n  gap: 1\n600:\n  gap: 2\n',
		/"x400" and "600" both set `gap`, and both match at 600 × 400\. Add a step for the sizes where both match \("600x400"\), or change one of them so that they do not overlap \(for example "\.\.600x400" in place of "x400"\)/
	);
	assert.deepEqual(e.path, ['600', 'gap']);
	assert.equal(e.range?.start.line, 6);

	// A step for the overlap resolves it.
	compileLayout('name: q\nareas: A\nx400:\n  gap: 1\n600:\n  gap: 2\n600x400:\n  gap: 3\n');
	// Steps that set different properties can overlap.
	compileLayout('name: q\nareas: A\nx400:\n  gap: 1\n600:\n  padding: 2\n');
});

test('a conflict on the tracks names the setting that writes them', () => {
	const e = fails(
		'name: q\nareas: A\nx400:\n  areas: A B\n600:\n  cols: 1fr 2fr\n',
		/both set the columns \(`areas` sets them too\)/
	);
	assert.deepEqual(e.path, ['600', 'cols']);
});

test('flow entries conflict per area', () => {
	fails(
		'name: q\nareas: A B\nx400:\n  flow:\n    B: row\n600:\n  flow:\n    B: column\n',
		/both set the flow of B/
	);
	compileLayout('name: q\nareas: A B\nx400:\n  flow:\n    A: row\n600:\n  flow:\n    B: column\n');
});

test('two css values that overlap give a warning, not an error', () => {
	const { warnings } = compileLayout(
		"name: q\nareas: A\nx400:\n  css: 'color: red'\n600:\n  css: 'color: blue'\n"
	);
	assert.equal(warnings.length, 1);
	assert.match(warnings[0].message, /both set `css`/);
	assert.deepEqual(warnings[0].path, ['600', 'css']);
});

test('a step with no effect gives a warning', () => {
	const { warnings } = compileLayout(`
name: q
areas: A
600:
  gap: 1
600x..400:
  gap: 2
600x400:
  gap: 3
`);
	assert.deepEqual(
		warnings.map((w) => w.path),
		[['600']]
	);
	assert.match(warnings[0].message, /"600" has no effect/);
});

test('names from breakpoints', () => {
	const { css } = compileLayout(
		`
name: q
breakpoints:
  md: 600..
  short: x..500
  wide: 16/9
areas: A
md:
  gap: 1
md short:
  gap: 2
wide:
  padding: 1
`,
		{ layer: false }
	);
	assert.ok(blocks(css).includes('(min-width: 600px) and (height < 500px)'));
	assert.match(css, /--grid-breakpoint: md short;/);
	assert.match(css, /--grid-breakpoint: wide;/);
});

test('names from the breakpoints option', () => {
	const options = { breakpoints: { md: '600..', lg: 1000 } };
	const { css } = compileLayout('name: q\nareas: A\nmd:\n  gap: 1\nlg:\n  gap: 2\n', {
		...options,
		layer: false
	});
	assert.deepEqual(blocks(css), ['(min-width: 600px)', '(min-width: 1000px)']);
	fails(
		'name: q\nbreakpoints:\n  md: 700\nareas: A\n',
		/also in the `breakpoints` option/,
		options
	);
});

test('a name can be an OR, and AND distributes over it', () => {
	const { css } = compileLayout(
		`
name: q
breakpoints:
  compact: '..400, x..300'
areas: A
compact landscape:
  gap: 1
`,
		{ layer: false }
	);
	assert.deepEqual(blocks(css), [
		'((width < 400px) and (orientation: landscape)) or ((height < 300px) and (orientation: landscape))'
	]);
});

test('query errors', () => {
	fails('name: q\nareas: A\nfoo: 1', /Unknown key "foo"/);
	fails('name: q\nareas: A\n600 foo:\n  gap: 1', /Unknown term "foo" in "600 foo"/);
	fails('name: q\nareas: A\n100:\n  gap: 1\n100x:\n  gap: 2', /"100x" duplicates "100"/);
	fails('name: q\nareas: A\n600:\n  gap: 1\n600..:\n  gap: 2', /duplicates/);
	fails('name: q\nareas: A\n900..600:\n  gap: 1', /is empty/);
	fails('name: q\nareas: A\n16/9..4/3:\n  gap: 1', /is empty/);
	fails('name: q\nareas: A\n600 ..900:\n  gap: 1', /more than one width term/);
	fails('name: q\nareas: A\nportrait landscape:\n  gap: 1', /more than one orientation term/);
	fails('name: q\nareas: A\n..600x700.. landscape:\n  gap: 1', /matches no container size/);
	fails('name: q\nareas: A\n0:\n  gap: 1', /matches every container size/);
	fails('name: q\nareas: A\n"600,":\n  gap: 1', /empty alternative/);
	fails('name: q\nareas: A\n0/9:\n  gap: 1', /two positive numbers/);
	fails('name: q\nbreakpoints:\n  x400: 600\nareas: A', /cannot be a breakpoint name/);
	fails('name: q\nbreakpoints:\n  portrait: 600\nareas: A', /cannot be a breakpoint name/);
	fails('name: q\nbreakpoints:\n  gap: 600\nareas: A', /cannot be a breakpoint name/);
	fails('name: q\nbreakpoints:\n  a: 600\n  b: a x400\nareas: A', /Unknown term "a"/);
	fails('name: q\nbreakpoints: 600\nareas: A', /must be a mapping/);
});

test('an inline-size container cannot use a height, a ratio, or an orientation', () => {
	for (const key of ['x400', '600x400', '16/9', 'portrait'])
		fails(
			`name: q\ncontainer: inline-size\nareas: A\n${key}:\n  gap: 1`,
			/needs the height of the container/
		);
	compileLayout('name: q\ncontainer: inline-size\nareas: A\n..600:\n  gap: 1');
});

test('sample points touch every region, edge and corner', () => {
	const conditions = [
		parseQuery('600x400', new Map(), []),
		parseQuery('16/9', new Map(), []),
		parseQuery('portrait', new Map(), [])
	];
	const points = samplePoints(conditions);
	// A point on the 16/9 line, a point on the diagonal, and the corner at 600 × 400.
	assert.ok(points.some(([w, h]) => Math.abs(w * 9 - h * 16) < 1e-6));
	assert.ok(points.some(([w, h]) => w === h));
	assert.ok(points.some(([w, h]) => w === 600 && h === 400));
});

test('the hide rule of an OR step puts the OR in ()', () => {
	const { css } = compileLayout(`
name: q
areas: A B
'..400, x..300':
  areas: A
900x300..:
  areas: B
`);
	assert.match(
		css,
		/@container q \(\(width < 400px\) or \(height < 300px\)\) and \(not \(\(min-width: 900px\) and \(min-height: 300px\)\)\) \{\n {2}\[data-grid-layout="q"\] > \[data-grid-area="B"\]/
	);
});
