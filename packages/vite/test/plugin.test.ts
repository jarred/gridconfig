import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gridconfig } from '../src/index.ts';

type Result = { code: string } | undefined;
type Load = (this: unknown, id: string) => Promise<Result>;
type Transform = (this: unknown, code: string, id: string) => Result;

function setup(options = {}) {
	const plugin = gridconfig(options) as unknown as { load: Load; transform: Transform };
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
	const other = "import { baseCss } from '@gridconfig/core';\nconst a = grid`areas: A`;";
	assert.equal(p.transform(other, '/x/a.ts'), undefined);
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
		`import { grid } from '@gridconfig/core';;import "virtual:gridconfig/options";import "virtual:gridconfig/base.gridconfig.css";import "virtual:gridconfig/layout.i.css";import "virtual:gridconfig/layout.j.css";`
	);
	assert.equal(out.split('\n').length, code.split('\n').length);
	assert.match(out, /"bundled":true/);
});

test('in a svelte file, the CSS imports stay inside the script', () => {
	const code = `<script>\n  import { grid } from '@gridconfig/core';\n</script>\n<Grid layout={grid({ name: 's', areas: 'A' })} />`;
	const out = must(setup().transform(code, '/x/A.svelte')).code;
	assert.match(
		out,
		/<script>\n {2}import \{ grid \} from '@gridconfig\/core';;import "virtual:gridconfig\/options";import "virtual:gridconfig\/base/
	);
});

test('calls with their own options are left for runtime', () => {
	const code = src("const a = grid({ areas: 'A' }, { tokenPrefix: 'x' });");
	const out = must(setup().transform(code, '/x/a.ts')).code;
	assert.ok(out.endsWith("const a = grid({ areas: 'A' }, { tokenPrefix: 'x' });"));
});

test('a file that can compile a layout when it runs imports the project options', async () => {
	const p = setup({ tokenPrefix: 'ds', layer: 'components', breakpoints: { md: '600..' } });
	for (const code of [
		src('const a = grid(config);'),
		"import { createGrid } from '@gridconfig/core';\nexport const grid = createGrid({});"
	]) {
		const [first] = must(p.transform(code, '/x/a.ts')).code.split('\n');
		assert.ok(first.endsWith(';import "virtual:gridconfig/options";'), first);
	}
	const module = (await p.load('\0virtual:gridconfig/options')) as unknown as string;
	assert.equal(
		module,
		'globalThis[Symbol.for("gridconfig.options")] = {"tokenPrefix":"ds","layer":"components","breakpoints":{"md":"600.."},"debug":false};'
	);
	// The module works with the `grid` of core: a layout that compiles now gets the options.
	const key = Symbol.for('gridconfig.options');
	const store = globalThis as { [key: symbol]: unknown };
	new Function(module)();
	try {
		const { grid } = await import('@gridconfig/core');
		const layout = grid({ name: 'r', areas: 'A', gap: '{space.2}', md: { gap: 4 } } as never);
		assert.equal(layout.layer, 'components');
		assert.match(layout.css, /var\(--ds-space-2\)/);
		assert.match(layout.css, /@container r \(min-width: 600px\)/);
	} finally {
		delete store[key];
	}
});

test('compiles the calls of a grid from a module in `modules`', async () => {
	const plugin = gridconfig({ modules: ['./src/lib/grid.ts', '$lib/other'] }) as unknown as {
		configResolved(config: { command: string; root: string }): void;
		transform: (this: unknown, code: string, id: string) => Promise<Result> | Result;
	};
	plugin.configResolved({ command: 'build', root: '/app' });
	const ctx = {
		warn: () => {},
		resolve: async (source: string) => {
			if (source === '$lib/grid' || source === '/app/src/lib/grid.ts')
				return { id: '/app/src/lib/grid.ts' };
			if (source === '$lib/other') return { id: '/app/src/lib/other.ts' };
			return { id: `/app/src/${source}` };
		}
	};
	const mine = "import { grid as g } from '$lib/grid';\nconst a = g({ name: 'm', areas: 'A' });";
	const out = must(await plugin.transform.call(ctx, mine, '/app/src/a.ts')).code;
	assert.match(out, /const a = \(\{"name":"m"/);
	// The file does not compile a layout when it runs, so it does not import the options.
	assert.equal(
		out.split('\n')[0],
		`import { grid as g } from '$lib/grid';;import "virtual:gridconfig/base.gridconfig.css";import "virtual:gridconfig/layout.m.css";`
	);
	// A `grid` from a different module is not ours.
	const theirs = "import { grid } from './charts';\nconst a = grid({ name: 'n', areas: 'A' });";
	assert.equal(await plugin.transform.call(ctx, theirs, '/app/src/b.ts'), undefined);
});

test('adds debug data when the dev server runs, and not in a build', () => {
	const plugin = gridconfig() as unknown as {
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

test('compiles the static calls of the grid of @gridconfig/core/object', () => {
	const code =
		"import { grid } from '@gridconfig/core/object';\nconst a = grid({ name: 'ob', areas: 'A' });";
	const out = must(setup().transform(code, '/x/a.ts')).code;
	assert.match(out, /const a = \(\{"name":"ob"/);
	assert.ok(out.split('\n')[0].includes('import "virtual:gridconfig/layout.ob.css";'));
});

test('a generic file name gives the name of the folder', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'gc-'));
	const p = setup();
	const names: string[] = [];
	for (const folder of ['Card', 'Hero']) {
		await mkdir(join(dir, folder));
		await writeFile(join(dir, folder, 'layout.grid'), 'areas: A\n');
		names.push(run(await p.load(join(dir, folder, 'layout.grid'))).name);
	}
	assert.deepEqual(names, ['Card', 'Hero']);
	assert.equal(run(p.transform('areas: A\n', '/x/nav/index.yaml?grid')).name, 'nav');
});

test('an error in a template has the column of the file', () => {
	type Located = Error & { loc?: { line: number; column: number } };
	const at = (code: string, line: number, column: number) =>
		assert.throws(
			() => setup().transform(src(code), '/x/a.ts'),
			(e: Located) => {
				assert.match(e.message, /operator/i);
				assert.deepEqual({ line: e.loc?.line, column: e.loc?.column }, { line, column });
				return true;
			}
		);
	// The value starts after four spaces and `gap: `. Columns start at 0.
	at('const hero = grid`\n    areas: A\n    gap: 1 +\n`;', 4, 9);
	// On the first line of a template, the column counts the code before the backtick.
	at('const a = grid`gap: 1 +`;', 2, 20);
});

test('the name of a file that is gone is free again', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'gc-'));
	const p = setup();
	await writeFile(join(dir, 'old.grid'), 'name: same\nareas: A\n');
	await p.load(join(dir, 'old.grid'));
	// A rename: the old file is gone, and the new file has the same layout.
	await rename(join(dir, 'old.grid'), join(dir, 'new.grid'));
	assert.equal(run(await p.load(join(dir, 'new.grid'))).name, 'same');
});

test('a file with a compiled call has a source map', () => {
	const code = src("const a = grid({ name: 'sm', areas: 'A' });\nconst after = 1;");
	const out = setup().transform(code, '/x/a.ts') as unknown as {
		code: string;
		map: { sources: string[]; mappings: string };
	};
	assert.deepEqual(out.map.sources, ['/x/a.ts']);
	// One group of mappings for each line of the file, and the line after the call is in the map.
	const lines = out.map.mappings.split(';');
	assert.equal(lines.length, code.split('\n').length);
	assert.ok(lines.at(-1)!.length > 0);
});
