import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { layoutPlugin } from '../src/vite.ts';

type Result = { code: string } | undefined;
type Load = (this: unknown, id: string) => Promise<Result>;
type Transform = (this: unknown, code: string, id: string) => Result;

function setup(options = {}) {
	const plugin = layoutPlugin(options) as unknown as { load: Load; transform: Transform };
	const warnings: string[] = [];
	const ctx = {
		warn: (m: string) => warnings.push(m),
		addWatchFile: () => {},
		error: (e: { message: string; loc?: { line: number } }) => {
			throw Object.assign(new Error(e.message), { loc: e.loc });
		}
	};
	return {
		warnings,
		load: (id: string) => plugin.load.call(ctx, id),
		transform: (code: string, id: string) => plugin.transform.call(ctx, code, id)
	};
}

function must(result: Result): { code: string } {
	assert.ok(result, 'expected the plugin to return code');
	return result;
}

const run = (module: Result) =>
	JSON.parse(
		must(module)
			.code.replace(/^export default /, '')
			.replace(/;$/, '')
	);

test('loads a .grid file and names it after the file', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'gc-'));
	const file = join(dir, 'hero.grid');
	await writeFile(file, 'areas: A\n100x100:\n  areas: |\n    A A\n    B B\n');
	const p = setup();
	const compiled = run(await p.load(file));
	assert.equal(compiled.name, 'hero');
	assert.deepEqual(compiled.areas, ['A', 'B']);
});

test('an explicit name wins over the file name', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'gc-'));
	const file = join(dir, 'x.grid');
	await writeFile(file, 'name: given\nareas: A\n');
	assert.equal(run(await setup().load(file)).name, 'given');
});

test('does not touch other files or raw imports', async () => {
	const p = setup();
	assert.equal(await p.load('/a/b.css'), undefined);
	assert.equal(await p.load('/a/b.grid?raw'), undefined);
});

test('two files with the same name are an error', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'gc-'));
	await writeFile(join(dir, 'a.grid'), 'name: same\nareas: A\n');
	await writeFile(join(dir, 'b.grid'), 'name: same\nareas: A\n');
	const p = setup();
	await p.load(join(dir, 'a.grid'));
	await assert.rejects(() => p.load(join(dir, 'b.grid')), /also used by/);
	// The same file again (a rebuild) is fine.
	await p.load(join(dir, 'a.grid'));
});

test('reports a layout error with a location', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'gc-'));
	const file = join(dir, 'bad.grid');
	await writeFile(file, 'areas: A\ngap: 1 +\n');
	await assert.rejects(
		() => setup().load(file),
		(e: Error & { loc?: { line: number } }) => /operator/i.test(e.message) && e.loc?.line === 2
	);
});

test('supports .yaml?grid', () => {
	const p = setup();
	const out = run(p.transform('name: legacy\nareas: A\n', '/x/layout.yaml?grid'));
	assert.equal(out.name, 'legacy');
	assert.ok(run(p.transform('areas: A\n', '/x/other.yml?grid')).name.startsWith('other'));
	assert.equal(p.transform('areas: A', '/x/plain.yaml'), undefined);
	assert.equal(p.transform('areas: A', '/x/old.yaml?layout'), undefined);
});

const src = (body: string) => `import { grid } from '@gridconfig/core';\n${body}`;

test('replaces a static template and keeps line numbers', () => {
	const p = setup();
	const code = src('const hero = grid`\n  name: t\n  areas: A\n`;\nconst after = 1;');
	const out = must(p.transform(code, '/x/a.ts')).code;
	assert.match(out, /const hero = \(\{"name":"t"/);
	assert.doesNotMatch(out, /grid`/);
	assert.equal(out.split('\n').length, code.split('\n').length);
	assert.equal(out.split('\n').at(-1), 'const after = 1;');
	assert.equal(out.split('\n').at(-2), ';');
});

test('replaces a static object and leaves dynamic calls alone', () => {
	const p = setup();
	const code = src("const a = grid({ name: 'o', areas: 'A' });\nconst b = grid(config);");
	const out = must(p.transform(code, '/x/a.js')).code;
	assert.match(out, /const a = \(\{"name":"o"/);
	assert.match(out, /const b = grid\(config\);/);
});

test('works in a svelte file', () => {
	const code = `<script>\n  import { grid } from '@gridconfig/core';\n</script>\n<Grid layout={grid({ name: 's', areas: 'A' })} />`;
	const out = must(setup().transform(code, '/x/A.svelte')).code;
	assert.match(out, /<Grid layout=\{\(\{"name":"s"/);
});

test('ignores files without a grid import', () => {
	const p = setup();
	assert.equal(p.transform('const a = grid`areas: A`;', '/x/a.ts'), undefined);
	assert.equal(p.transform(src('const a = 1;'), '/x/a.ts'), undefined);
	assert.equal(p.transform(src("grid({ areas: 'A' })"), '/x/node_modules/pkg/a.js'), undefined);
});

test('reports an error in a template with the line of the file', () => {
	const code = src('const a = 1;\nconst hero = grid`\n  areas: A\n  gap: 1 +\n`;');
	assert.throws(
		() => setup().transform(code, '/x/a.ts'),
		(e: Error & { loc?: { line: number } }) => /operator/i.test(e.message) && e.loc?.line === 5
	);
});

test('reports interpolation as an error', () => {
	assert.throws(
		() => setup().transform(src('const a = grid`areas: ${x}`;'), '/x/a.ts'),
		/layouts must be static/
	);
});

test('passes plugin options to inline layouts', () => {
	const p = setup({ tokenPrefix: 'ds' });
	const out = p.transform(
		src("const a = grid({ name: 't', areas: 'A', gap: '{space.2}' });"),
		'/x/a.ts'
	);
	assert.match(must(out).code, /var\(--ds-space-2\)/);
});

test('calls with their own options are left for runtime', () => {
	const code = src("const a = grid({ areas: 'A' }, { tokenPrefix: 'x' });");
	assert.equal(setup().transform(code, '/x/a.ts'), undefined);
});

test('adds debug data when the dev server runs, and not in a build', () => {
	const plugin = layoutPlugin() as unknown as {
		configResolved(config: { command: string }): void;
		transform: Transform;
	};
	const run = (command: string) => {
		plugin.configResolved({ command });
		const out = plugin.transform.call({}, 'name: d\nareas: A\n', '/x/d.yaml?grid');
		return JSON.parse(
			must(out)
				.code.replace(/^export default /, '')
				.replace(/;$/, '')
		);
	};
	assert.equal(run('build').debug, undefined);
	assert.equal(run('serve').debug.name, 'd');
});
