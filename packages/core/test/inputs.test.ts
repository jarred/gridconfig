import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileLayout } from '../src/compile.ts';
import { LayoutError } from '../src/errors.ts';
import { grid } from '../src/grid.ts';
import { parseLayoutObject } from '../src/model.ts';
import { parseLayout } from '../src/parse.ts';
import type { LayoutInput } from '../src/types.ts';

const yaml = `
name: hero
areas: A
100x100:
  gap: 4
  areas: |
    A A
    B B
`;

const object: LayoutInput = {
	name: 'hero',
	areas: 'A',
	'100x100': { gap: 4, areas: 'A A\nB B' }
};

test('an object compiles to the same CSS as the YAML form', () => {
	assert.equal(grid(object).css, compileLayout(yaml).css);
});

test('query keys can be numeric literals', () => {
	const result = grid({ name: 'n', areas: 'A', 600: { areas: 'A A\nB B' } });
	assert.match(result.css, /\(min-width: 600px\)/);
});

test('the object type rejects unknown keys and array areas', () => {
	// @ts-expect-error `foo` is not a setting or a query key
	const a: LayoutInput = { areas: 'A', foo: { areas: 'A' } };
	// @ts-expect-error areas is a multi-line string
	const b: LayoutInput = { areas: ['A'] };
	assert.ok(a && b);
});

test('name is optional: file stem, then content hash', () => {
	const noName = 'areas: A\n100x100:\n  areas: |\n    A A\n    B B\n';
	assert.equal(parseLayout(noName, { defaultName: 'hero' }).name, 'hero');
	assert.equal(parseLayout(noName, { defaultName: 'hero.card' }).name, 'hero-card');
	assert.equal(parseLayout(noName, { defaultName: '1-hero' }).name, '_1-hero');
	assert.equal(parseLayout('name: given\nareas: A', { defaultName: 'stem' }).name, 'given');

	const hashed = parseLayout(noName).name;
	assert.match(hashed, /^gc-[0-9a-z]{7}$/);
	assert.equal(parseLayout(noName).name, hashed, 'deterministic');
	assert.notEqual(parseLayout(noName + '200x200:\n  gap: 1\n').name, hashed);
	// The same content gets the same name in both syntaxes.
	assert.equal(parseLayoutObject({ areas: 'A', '100x100': { areas: 'A A\nB B' } }).name, hashed);
});

test('a name that is present must still be valid', () => {
	assert.throws(() => parseLayout('name: 1bad\nareas: A'), /valid identifier/);
	assert.throws(() => parseLayout('name: 5\nareas: A'), /valid identifier/);
});

test('indented YAML works and keeps line numbers', () => {
	const indented =
		'\n    name: hero\n    areas: A\n    100x100:\n      gap: 4\n      areas: |\n        A A\n        B B\n';
	assert.equal(compileLayout(indented).css, compileLayout(yaml).css);

	try {
		compileLayout('\n    name: hero\n    areas: A\n    100x100:\n      gap: 1 +\n');
		assert.fail('expected an error');
	} catch (e) {
		assert.ok(e instanceof LayoutError);
		assert.equal(e.range?.start.line, 5);
	}
});

test('a layout must be plain data', () => {
	const bad = (input: unknown, message: RegExp) =>
		assert.throws(() => parseLayoutObject(input as LayoutInput), message);
	bad({ areas: 'A', gap: () => 1 }, /plain data; found a function/);
	bad({ areas: 'A', gap: Symbol('x') }, /plain data; found a symbol/);
	bad({ areas: 'A', gap: 10n }, /plain data; found a bigint/);
	bad({ areas: 'A', gap: new Date() }, /not Date/);
	bad({ areas: 'A', gap: NaN }, /finite/);
	bad(null, /must be an object/);
	bad([], /must be an object/);
});

test('undefined values are treated as absent', () => {
	const result = grid({ areas: 'A', gap: undefined, '100x100': undefined, name: 'u' });
	assert.equal(result.name, 'u');
	assert.doesNotMatch(result.css, /@container/);
});

test('the grid tag compiles a template', () => {
	const result = grid`
		name: tagged
		areas: A
		100x100:
			areas: |
				A A
				B B
	`.css;
	assert.match(result, /container tagged/);
});

test('the grid tag rejects interpolation', () => {
	const n = 4;
	assert.throws(() => grid`name: x\nareas: A\ngap: ${n}`, /layouts must be static/);
});

test('the object form passes options through', () => {
	const result = grid({ name: 't', areas: 'A', gap: '{space.2}' }, { tokenPrefix: 'ds' });
	assert.match(result.css, /var\(--ds-space-2\)/);
});

test('a layout file is one YAML document without tags', () => {
	assert.throws(
		() => parseLayout('name: a\nareas: A\n---\nname: b\nareas: B'),
		/multiple documents/
	);
	assert.throws(() => parseLayout('name: a\nareas: A\ngap: !!str 4'), /Tags are not supported/);
	assert.throws(() => parseLayout('name: a\nareas: A\ngap: !custom 4'), /Tags are not supported/);
});

test('JSON is a valid layout file', () => {
	const json = JSON.stringify({ name: 'j', areas: 'A', 100: { areas: 'A A\nB B' } });
	assert.equal(compileLayout(json).name, 'j');
});
