// The JSON Schema for editors must agree with the compiler. Every layout that the compiler accepts
// must pass the schema, so an editor never marks a valid layout. Some layouts that the compiler
// rejects must also fail the schema, so the schema is useful.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Ajv } from 'ajv';
import { parse } from 'yaml';
import { compileLayout } from '../src/compile.ts';

const root = new URL('../../../', import.meta.url);
const schema = JSON.parse(readFileSync(new URL('../schema.json', import.meta.url), 'utf8'));
const validate = new Ajv({ allErrors: true }).compile(schema);

const errors = () =>
	(validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');

const compiles = (source: string) => {
	try {
		compileLayout(source);
		return true;
	} catch {
		return false;
	}
};

/** The layouts in the fixtures, and each YAML block in the docs and the spec. */
function layouts(): { where: string; source: string }[] {
	const out: { where: string; source: string }[] = [];
	const fixtures = new URL('spec/fixtures/', root);
	for (const file of readdirSync(fixtures).filter((f) => f.endsWith('.grid')))
		out.push({
			where: `spec/fixtures/${file}`,
			source: readFileSync(new URL(file, fixtures), 'utf8')
		});
	for (const folder of ['docs', 'spec']) {
		const dir = new URL(`${folder}/`, root);
		for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
			const text = readFileSync(new URL(file, dir), 'utf8');
			let n = 0;
			for (const [, source] of text.matchAll(/```ya?ml\n([\s\S]*?)```/g))
				out.push({ where: `${folder}/${file} block ${++n}`, source });
		}
	}
	return out;
}

test('each layout that the compiler accepts passes the schema', () => {
	let checked = 0;
	for (const { where, source } of layouts()) {
		if (!compiles(source)) continue;
		checked++;
		assert.ok(validate(parse(source)), `${where}: ${errors()}`);
	}
	// The fixtures alone are 13 layouts: the test must not pass by checking nothing.
	assert.ok(checked >= 20, `only ${checked} layouts were checked`);
});

test('the schema rejects common mistakes that the compiler also rejects', () => {
	const bad: [string, string][] = [
		['no areas in the base', 'gap: 8\n'],
		['an unknown container', 'container: grid\nareas: A\n'],
		['a reserved name', 'name: none\nareas: A\n'],
		['an unknown setting in a step', 'areas: A\n600:\n  colz: 1fr\n'],
		['a misspelled setting at the top', 'areas: A\ngaps: 8\n'],
		['name in a step', 'areas: A\n600:\n  name: wide\n'],
		['a flow word that is not a direction', 'areas: A\nflow:\n  A:\n    direction: diagonal\n'],
		['wrap that is not true or false', 'areas: A\nflow:\n  A:\n    wrap: yes please\n'],
		['an unknown flow key', 'areas: A\nflow:\n  A:\n    align: center\n'],
		['a breakpoint that uses another name', 'breakpoints:\n  md: 600..\n  lg: md\nareas: A\n'],
		['a breakpoint named after a setting', 'breakpoints:\n  gap: 600..\nareas: A\n'],
		['an empty part in a key', 'areas: A\n"600,":\n  gap: 8\n']
	];
	for (const [what, source] of bad) {
		assert.equal(
			compiles(source),
			false,
			`${what}: the compiler accepts it, so the schema must too`
		);
		assert.equal(validate(parse(source)), false, `${what}: the schema accepts it`);
	}
});

test('the schema accepts each kind of query key', () => {
	const keys = [
		'600',
		'600x',
		'600..',
		'..600',
		'600..900',
		'x400',
		'x..400',
		'600x400',
		'600..900x400..',
		'16/9',
		'..4/3',
		'4/3..16/9',
		'landscape',
		'portrait',
		'600.. landscape',
		'..400, x..300',
		'md',
		'md short'
	];
	for (const key of keys)
		assert.ok(validate({ areas: 'A', [key]: { gap: 4 } }), `${key}: ${errors()}`);
});

test('schema.json is the output of scripts/schema.ts (run pnpm schema)', async () => {
	const { text } = await import('../scripts/schema.ts');
	assert.equal(readFileSync(new URL('../schema.json', import.meta.url), 'utf8'), text);
});
