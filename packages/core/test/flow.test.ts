import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileLayout } from '../src/compile.ts';
import { LayoutError } from '../src/errors.ts';
import { flowDeclarations, parseFlowEntry } from '../src/flow.ts';
import { grid } from '../src/grid.ts';
import type { CompileOptions, FlowEntry } from '../src/types.ts';

const entry = (value: unknown, options: CompileOptions = {}) => parseFlowEntry(value, options, []);

/** The declarations of one entry as a property → value map. */
function props(value: unknown, options: CompileOptions = {}): Record<string, string> {
	return Object.fromEntries(
		flowDeclarations(entry(value, options)).map((d) => {
			const [p, v] = d.replace(/;$/, '').split(/:\s*/);
			return [p, v];
		})
	);
}

/** The flow rules for one area, in source order: [block condition or 'base', declarations]. */
function rulesFor(css: string, area: string): [string, string][] {
	const out: [string, string][] = [];
	const re = new RegExp(
		`(@container [^{]+\\{[^]*?)?\\[data-grid-area="${area}"\\] \\{\\n([^}]*display[^}]*)\\}`,
		'g'
	);
	// Split on @container blocks so each rule knows where it lives.
	for (const chunk of css.split(/(?=@container )/)) {
		const where = chunk.startsWith('@container')
			? chunk.slice(0, chunk.indexOf('{')).trim()
			: 'base';
		for (const m of chunk.matchAll(re)) out.push([where, m[2].replace(/\s+/g, ' ').trim()]);
	}
	return out;
}

function fails(source: string, message: RegExp): LayoutError {
	try {
		compileLayout(source);
	} catch (e) {
		assert.ok(e instanceof LayoutError, `expected a LayoutError, got ${e}`);
		assert.match(e.message, message);
		return e;
	}
	assert.fail(`expected compileLayout to throw for:\n${source}`);
}

const layout = (flow: string) => `name: f\nareas: A B\nflow:\n  B: ${flow}\n`;

test('each word gives the correct CSS value', () => {
	assert.equal(props('row')['flex-direction'], 'row');
	assert.equal(props('column')['flex-direction'], 'column');

	const main: [string, string][] = [
		['start', 'flex-start'],
		['center', 'center'],
		['end', 'flex-end'],
		['between', 'space-between'],
		['around', 'space-around'],
		['evenly', 'space-evenly']
	];
	for (const [word, css] of main) {
		assert.equal(props(`row ${word}`)['justify-content'], css, word);
		assert.equal(props(word)['justify-content'], css, `${word} without a direction`);
	}

	const cross: [string, string][] = [
		['start', 'flex-start'],
		['center', 'center'],
		['end', 'flex-end'],
		['stretch', 'stretch'],
		['baseline', 'baseline']
	];
	for (const [word, css] of cross)
		assert.equal(props(`row start ${word}`)['align-items'], css, word);

	assert.equal(props('row wrap')['flex-wrap'], 'wrap');
	assert.equal(props('row gap 8')['gap'], '8px');
});

test('absent words get their defaults', () => {
	const defaults = {
		display: 'flex',
		'flex-direction': 'row',
		'justify-content': 'flex-start',
		'align-items': 'stretch',
		gap: 'normal',
		'flex-wrap': 'nowrap'
	};
	assert.deepEqual(props(''), defaults);
	assert.deepEqual(props({}), defaults);
	assert.deepEqual(props('column'), { ...defaults, 'flex-direction': 'column' });
	assert.deepEqual(props('center'), { ...defaults, 'justify-content': 'center' });
});

test('gap and wrap come after the alignment words, in any order', () => {
	assert.deepEqual(
		entry('column center start gap 4 wrap'),
		entry('column center start wrap gap 4')
	);
	assert.deepEqual(entry('gap 4'), {
		direction: 'row',
		main: 'start',
		cross: 'stretch',
		wrap: false,
		gap: '4px'
	});
});

test('the gap term obeys the value rules', () => {
	assert.equal(props('column gap {space.2}')['gap'], 'var(--space-2)');
	assert.equal(props('column gap {space.2}', { tokenPrefix: 'ds' })['gap'], 'var(--ds-space-2)');
	assert.equal(props('column gap --gap')['gap'], 'var(--gap)');
	assert.equal(props('column gap 0')['gap'], '0');
	assert.equal(props('column gap calc(var(--a) * 2)')['gap'], 'calc(var(--a) * 2)');
	assert.equal(props('column gap 1rem')['gap'], '1rem');
});

test('the object form accepts any value for gap', () => {
	assert.equal(props({ gap: '{space.2} + 4' })['gap'], 'calc(var(--space-2) + 4px)');
	assert.equal(props({ gap: '4 8' })['gap'], '4px 8px');
	assert.equal(props({ gap: 8 })['gap'], '8px');
});

test('the string form and the object form give the same CSS', () => {
	const pairs: [string, object][] = [
		['column center start', { direction: 'column', main: 'center', cross: 'start' }],
		[
			'row between center gap {space.2} wrap',
			{ main: 'between', cross: 'center', gap: '{space.2}', wrap: true }
		],
		['', {}]
	];
	for (const [text, object] of pairs) {
		assert.deepEqual(entry(text), entry(object), text);
		const fromYaml = compileLayout(layout(text || 'row')).css;
		const fromObject = grid({
			name: 'f',
			areas: 'A B',
			flow: { B: text ? object : { direction: 'row' } }
		}).css;
		assert.equal(fromYaml, fromObject, text);
	}
});

test('none writes revert-layer for all six properties', () => {
	assert.equal(entry('none'), 'none');
	assert.deepEqual(props('none'), {
		display: 'revert-layer',
		'flex-direction': 'revert-layer',
		'justify-content': 'revert-layer',
		'align-items': 'revert-layer',
		gap: 'revert-layer',
		'flex-wrap': 'revert-layer'
	});
});

test('a step writes all six properties for each area in its entry', () => {
	const { css } = compileLayout(`
name: f
areas: A B
flow:
  B: column center start
600x:
  flow:
    B: row
x400:
  flow:
    B: column end
800x:
  flow:
    B: none
`);
	assert.deepEqual(rulesFor(css, 'B'), [
		[
			'base',
			'display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: normal; flex-wrap: nowrap;'
		],
		[
			'@container f (min-height: 400px)',
			'display: flex; flex-direction: column; justify-content: flex-end; align-items: stretch; gap: normal; flex-wrap: nowrap;'
		],
		[
			'@container f (min-width: 600px)',
			'display: flex; flex-direction: row; justify-content: flex-start; align-items: stretch; gap: normal; flex-wrap: nowrap;'
		],
		[
			'@container f (min-width: 800px)',
			'display: revert-layer; flex-direction: revert-layer; justify-content: revert-layer; align-items: revert-layer; gap: revert-layer; flex-wrap: revert-layer;'
		]
	]);
	assert.deepEqual(rulesFor(css, 'A'), []);
});

test('flow rules use the area selector, in the layer, after the grid-area rules', () => {
	const { css } = compileLayout(layout('column'));
	const area = css.indexOf(`[data-grid-layout="f"] > [data-grid-area="B"] { grid-area: B; }`);
	const flow = css.indexOf(`[data-grid-layout="f"] > [data-grid-area="B"] {\n`);
	assert.ok(area >= 0 && flow > area, css);
	assert.ok(css.startsWith('@layer gridconfig {'), css);
	assert.ok(css.indexOf('display: flex') < css.lastIndexOf('}'));

	const unlayered = compileLayout(layout('column'), { layer: false }).css;
	assert.ok(!unlayered.includes('@layer'), unlayered);
	assert.match(unlayered, /display: flex;/);
});

test('flow does not change the hide rules', () => {
	const withFlow = compileLayout(
		`name: f\nareas: A\nflow:\n  B: column\n600x:\n  areas: A B\n`
	).css;
	const without = compileLayout(`name: f\nareas: A\n600x:\n  areas: A B\n`).css;
	const hide = (css: string) => css.slice(css.indexOf('display: none') - 200);
	assert.equal(hide(withFlow), hide(without));
});

test('debug data includes flow', () => {
	const { debug } = compileLayout(
		`name: f\nareas: A B\nflow:\n  B: column\n600x:\n  flow:\n    B: none\n`,
		{ debug: true }
	);
	assert.deepEqual(debug?.steps[0].flow, {
		B: { direction: 'column', main: 'start', cross: 'stretch', wrap: false }
	});
	assert.deepEqual(debug?.steps[1].flow, { B: 'none' as FlowEntry });
});

test('flow errors', () => {
	const cases: [string, RegExp][] = [
		['column centre', /Unknown word "centre"/],
		['column stretch center', /"stretch" is not a main word/],
		['row start center end', /one main word and one cross word/],
		['center column', /The direction "column" must be the first word/],
		['row wrap wrap', /"wrap" is written twice/],
		['row gap 4 gap 8', /"gap" is written twice/],
		['column gap', /"gap" needs a value/],
		['column gap wrap', /"gap" needs a value/],
		['column gap 4 8', /for a list use the flow object/],
		['column gap --a * 2', /for an expression use calc\(\) or the flow object/],
		['column gap 4 center', /for a list use the flow object/],
		['column wrap center', /"center" must come before "gap" and "wrap"/]
	];
	for (const [text, message] of cases) {
		const e = fails(layout(text), message);
		assert.deepEqual(e.path, ['flow', 'B'], text);
		assert.match(e.message, /centre|stretch|end|column|wrap|gap|center/);
	}
	// The error for an unknown word lists the valid words.
	assert.match(fails(layout('column centre'), /./).message, /"between"/);
});

test('flow structure errors', () => {
	fails(`name: f\nareas: A B\nflow: column\n`, /`flow` must be a map/);
	fails(`name: f\nareas: A B\nflow:\n  B: 4\n`, /A flow entry must be/);
	const key = fails(
		`name: f\nareas: A B\nflow:\n  B:\n    dir: column\n`,
		/Unknown flow key "dir"/
	);
	assert.deepEqual(key.path, ['flow', 'B', 'dir']);
	fails(`name: f\nareas: A B\nflow:\n  B:\n    wrap: 'yes'\n`, /"wrap" must be true or false/);
	fails(`name: f\nareas: A B\nflow:\n  B:\n    direction: down\n`, /"direction" must be/);
	fails(`name: f\nareas: A B\nflow:\n  B:\n    main: stretch\n`, /"main" must be/);
});

test('an unknown area is an error with a path and a range', () => {
	const e = fails(`name: f\nareas: A B\n600x:\n  flow:\n    Z: column\n`, /flow names "Z"/);
	assert.deepEqual(e.path, ['600x', 'flow', 'Z']);
	assert.equal(e.range?.start.line, 5);

	// An area from any map is valid, also when the step that sets flow does not show it.
	assert.doesNotThrow(() =>
		compileLayout(`name: f\nareas: A\nflow:\n  B: column\n600x:\n  areas: A B\n`)
	);
});

test('a string error in a query step has a path and a range', () => {
	const e = fails(`name: f\nareas: A B\n600x:\n  flow:\n    B: column centre\n`, /centre/);
	assert.deepEqual(e.path, ['600x', 'flow', 'B']);
	assert.equal(e.range?.start.line, 5);
});
