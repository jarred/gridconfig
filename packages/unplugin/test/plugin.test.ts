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

/** The layout that a layout module exports. The module starts with its CSS imports. */
const parseModule = (code: string) =>
	JSON.parse(code.replace(/^(?:import "[^"]*";)*\nexport default /, '').replace(/;$/, ''));

const run = (module: Result) => parseModule(must(module).code);

test('loads a .grid file and names it after the file', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'gc-'));
	const file = join(dir, 'hero.grid');
	await writeFile(file, 'areas: A\n100:\n  areas: |\n    A A\n    B B\n');
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

test('passes plugin options to inline layouts', async () => {
	const p = setup({ tokenPrefix: 'ds' });
	p.transform(src("const a = grid({ name: 't', areas: 'A', gap: '{space.2}' });"), '/x/a.ts');
	assert.match((await p.load('\0virtual:gridconfig/layout.t.css')) as never, /var\(--ds-space-2\)/);
});

test('a layout file imports its CSS and the base, and does not carry the CSS', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'gc-'));
	const file = join(dir, 'card.grid');
	await writeFile(file, 'areas: A\n600:\n  gap: 4\n');
	const p = setup();
	const code = must(await p.load(file)).code;
	assert.match(
		code,
		/^import "virtual:gridconfig\/base\.gridconfig\.css";import "virtual:gridconfig\/layout\.card\.css";\n/
	);
	const layout = parseModule(code);
	assert.equal(layout.css, '');
	assert.equal(layout.bundled, true);

	const css = (await p.load('\0virtual:gridconfig/layout.card.css')) as unknown as string;
	assert.match(css, /container: card \/ inline-size/);
	const base = (await p.load('\0virtual:gridconfig/base.gridconfig.css')) as unknown as string;
	assert.match(base, /^@layer gridconfig \{/);
});

test('the base module follows the layer option', async () => {
	const p = setup({ layer: false });
	const code = run(p.transform('name: n\nareas: A\n', '/x/n.yaml?grid'));
	assert.equal(code.layer, null);
	const base = (await p.load('\0virtual:gridconfig/base.-.css')) as unknown as string;
	assert.doesNotMatch(base, /@layer/);
	assert.match(base, /:where\(\[data-grid-layout\]\)/);
});

test('inline layouts import their CSS on the line of the core import', () => {
	const code = src(
		"const a = grid({ name: 'i', areas: 'A' });\nconst b = grid({ name: 'j', areas: 'A' });"
	);
	const out = must(setup().transform(code, '/x/a.ts')).code;
	const [first] = out.split('\n');
	assert.equal(
		first,
		`import { grid } from '@gridconfig/core';;import "virtual:gridconfig/base.gridconfig.css";import "virtual:gridconfig/layout.i.css";import "virtual:gridconfig/layout.j.css";`
	);
	assert.equal(out.split('\n').length, code.split('\n').length);
	assert.match(out, /"bundled":true/);
});

test('in a svelte file, the CSS imports stay inside the script', () => {
	const code = `<script>\n  import { grid } from '@gridconfig/core';\n</script>\n<Grid layout={grid({ name: 's', areas: 'A' })} />`;
	const out = must(setup().transform(code, '/x/A.svelte')).code;
	assert.match(
		out,
		/<script>\n {2}import \{ grid \} from '@gridconfig\/core';;import "virtual:gridconfig\/base/
	);
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
		return parseModule(must(out).code);
	};
	assert.equal(run('build').debug, undefined);
	assert.equal(run('serve').debug.name, 'd');
});
