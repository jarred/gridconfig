import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve as resolvePath } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import {
	LayoutError,
	PROJECT_OPTIONS,
	baseCssFor,
	compileLayout,
	defaultNameFor,
	parseLayoutObject
} from '@gridconfig/core';
import type { CompileOptions, CompiledLayout, LayoutInput } from '@gridconfig/core';
import { findCalls, lineOf, namedImports } from './extract.ts';
import type { Import } from './extract.ts';

/** Files that can contain `grid` calls. The scanner reads raw text, so single-file components work. */
const SOURCE = /\.(?:[cm]?[jt]sx?|svelte|vue|astro|mdx?)$/;

/** Virtual CSS modules: `virtual:gridconfig/base.<layer>.css` and `virtual:gridconfig/layout.<name>.css`. */
const VIRTUAL = 'virtual:gridconfig/';
const RESOLVED = '\0' + VIRTUAL;
const baseId = (layer: string | null) => `${VIRTUAL}base.${layer ?? '-'}.css`;
const layoutId = (name: string) => `${VIRTUAL}layout.${name}.css`;

const CORE = '@gridconfig/core';
/** The entries of core that export `grid`. */
const CORE_ENTRIES = new Set([CORE, `${CORE}/object`]);
/** A module that sets the options of the plugin as the project options of the page. */
const OPTIONS_ID = `${VIRTUAL}options`;

export type PluginOptions = CompileOptions & {
	/**
	 * Modules of the project that export a `grid` made with `createGrid`, for example
	 * `['./src/lib/grid.ts']` or `['$lib/grid']`. A path is relative to the root of the project.
	 * The plugin compiles the static calls of a `grid` that a file imports from one of them, as it
	 * does for the `grid` of `@gridconfig/core`. It uses the options of the plugin, so `createGrid`
	 * must get the same options.
	 */
	modules?: string[];
};

type Context = {
	warn(message: string): void;
	error(error: {
		message: string;
		id?: string;
		loc?: { file: string; line: number; column: number };
	}): never;
	addWatchFile?(file: string): void;
	resolve?(source: string, importer?: string): Promise<{ id: string } | null>;
};

/**
 * Compiles layouts at build time:
 *
 * - `import hero from './hero.grid'` (a layout file)
 * - `import hero from './hero.yaml?grid'` (the same for .yaml and .yml)
 * - `grid\`…\`` and `grid({ … })` from `@gridconfig/core`, when the argument is static.
 *   The plugin replaces the call with the compiled result. A call that is not static compiles
 *   when the code runs.
 */
export function gridconfig(pluginOptions: PluginOptions = {}): Plugin {
	const { modules = [], ...options } = pluginOptions;
	let root = process.cwd();
	/** The resolved ids of `modules`. */
	let moduleIds: Promise<Set<string>> | undefined;
	const withoutQuery = (id: string) => id.split('?')[0];
	function resolveModules(ctx: Context): Promise<Set<string>> {
		moduleIds ??= Promise.all(
			modules.map(async (m) => {
				const source = m.startsWith('.') || isAbsolute(m) ? resolvePath(root, m) : m;
				return (await ctx.resolve?.(source))?.id ?? source;
			})
		).then((ids) => new Set(ids.map(withoutQuery)));
		return moduleIds;
	}

	/** Layout name for each file, to find two files that give the same name. */
	const names = new Map<string, string>();
	/** Debug data for development tools: on when the dev server runs, unless the options say else. */
	let serving = false;
	const compileOptions = (): CompileOptions => ({ debug: serving, ...options });
	/** The CSS of each virtual module, by its resolved id. */
	const styles = new Map<string, string>();
	let server: ViteDevServer | undefined;

	/** Sets the CSS of a virtual module. In dev, a change goes to the page as a CSS update. */
	function setStyle(id: string, css: string) {
		const resolved = '\0' + id;
		if (styles.get(resolved) === css) return;
		const known = styles.has(resolved);
		styles.set(resolved, css);
		const mod = known && server?.moduleGraph.getModuleById(resolved);
		if (mod) void server!.reloadModule(mod);
	}

	/**
	 * Moves the CSS of a compiled layout to virtual CSS modules, so that the bundler delivers it one
	 * time for each page, also in SSR. Returns the layout without its CSS, and the ids to import.
	 */
	function bundle(compiled: CompiledLayout): { layout: CompiledLayout; imports: string[] } {
		const base = baseId(compiled.layer);
		setStyle(base, baseCssFor(compiled.layer));
		const own = layoutId(compiled.name);
		setStyle(own, compiled.css);
		return { layout: { ...compiled, css: '', bundled: true }, imports: [base, own] };
	}

	const importLines = (ids: Iterable<string>) =>
		[...new Set(ids)].map((id) => `import ${JSON.stringify(id)};`).join('');

	function layoutModule(compiled: CompiledLayout): string {
		const { layout, imports } = bundle(compiled);
		return `${importLines(imports)}\nexport default ${JSON.stringify(layout)};`;
	}

	function report(ctx: Context, e: unknown, file: string, lineOffset = 0, column = 0): never {
		if (!(e instanceof LayoutError)) throw e;
		const start = e.range?.start;
		return ctx.error({
			message: e.message,
			id: file,
			loc: start
				? {
						file,
						line: start.line + lineOffset,
						column: start.col - 1 + (start.line === 1 ? column : 0)
					}
				: lineOffset
					? { file, line: 1 + lineOffset, column }
					: undefined
		});
	}

	function compileFile(ctx: Context, source: string, file: string): CompiledLayout {
		try {
			const compiled = compileLayout(source, {
				defaultName: defaultNameFor(file),
				...compileOptions()
			});
			for (const w of compiled.warnings) ctx.warn(`${file}: ${w.message}`);

			for (const [other, name] of names) {
				if (other === file || name !== compiled.name) continue;
				// A file that is gone, for example after a rename, does not use its name any more.
				if (!existsSync(other)) {
					names.delete(other);
					continue;
				}
				throw new LayoutError(
					`The name "${compiled.name}" is also used by ${other}. Set a \`name\` in one of the two files.`
				);
			}
			names.set(file, compiled.name);
			return compiled;
		} catch (e) {
			return report(ctx, e, file);
		}
	}

	/**
	 * Replaces the static `grid` calls of a file with compiled layouts. `sources` are the imports
	 * that give a `grid` function. `core` are the imports from `@gridconfig/core`: a file that can
	 * compile a layout when it runs also imports the project options.
	 */
	function rewrite(ctx: Context, code: string, file: string, sources: Import[], core: Import[]) {
		const local = new Set(
			sources.flatMap((i) => i.names.filter((n) => n.imported === 'grid').map((n) => n.local))
		);
		const runtime = core.filter((i) =>
			i.names.some((n) => n.imported === 'grid' || n.imported === 'createGrid')
		);
		const calls = local.size ? findCalls(code, local, { markdown: /\.mdx?$/.test(file) }) : [];
		if (!calls.length && !runtime.length) return;

		let out = '';
		let cursor = 0;
		const imports: string[] = runtime.length ? [OPTIONS_ID] : [];
		// The new imports go on the line of the first import that gives `grid`, so that they stay
		// inside a <script> and the lines after it do not move.
		const anchor = Math.min(
			...[...sources.filter((i) => i.names.some((n) => local.has(n.local))), ...runtime].map(
				(i) => i.end
			)
		);
		type Edit = { start: number; end: number; text: () => string };
		const edits: Edit[] = [{ start: anchor, end: anchor, text: () => `;${importLines(imports)}` }];

		for (const call of calls) {
			const startLine = lineOf(code, call.start);
			const original = code.slice(call.start, call.end);
			let compiled: CompiledLayout;

			try {
				if (call.kind === 'interpolation')
					throw new LayoutError(
						'A grid template cannot contain ${} expressions: layouts must be static'
					);
				compiled =
					call.kind === 'template'
						? compileLayout(call.source, compileOptions())
						: compileLayout(
								parseLayoutObject(call.value as LayoutInput, options),
								compileOptions()
							);
			} catch (e) {
				// Lines inside a template start at the line of its opening backtick. The first line of
				// the template starts after the backtick, so its columns start there too.
				const text = call.kind === 'template' ? call.end - 1 - call.source.length : call.start;
				return report(ctx, e, file, startLine - 1, text - (code.lastIndexOf('\n', text - 1) + 1));
			}
			for (const w of compiled.warnings) ctx.warn(`${file}:${startLine}: ${w.message}`);

			// Keep the line count, so that the lines after the call do not move.
			const newlines = '\n'.repeat(original.split('\n').length - 1);
			const bundled = bundle(compiled);
			imports.push(...bundled.imports);
			const text = `(${JSON.stringify(bundled.layout)})` + newlines;
			edits.push({ start: call.start, end: call.end, text: () => text });
		}

		for (const edit of edits.sort((a, b) => a.start - b.start)) {
			out += code.slice(cursor, edit.start) + edit.text();
			cursor = edit.end;
		}
		out += code.slice(cursor);
		return { code: out, map: null };
	}

	return {
		name: 'gridconfig',
		enforce: 'pre',

		configResolved(config) {
			serving = config.command === 'serve';
			root = config.root;
		},

		configureServer(dev) {
			server = dev;
		},

		resolveId(id) {
			if (id.startsWith(VIRTUAL)) return '\0' + id;
		},

		async load(id) {
			if (id === '\0' + OPTIONS_ID) {
				// A layout that compiles when the code runs reads these options. `tokenVar` is a function
				// and cannot go to the page: use `createGrid` for it.
				const { tokenPrefix, layer, breakpoints } = options;
				const shared = { tokenPrefix, layer, breakpoints, debug: compileOptions().debug };
				return `globalThis[Symbol.for(${JSON.stringify(PROJECT_OPTIONS)})] = ${JSON.stringify(shared)};`;
			}
			if (id.startsWith(RESOLVED)) {
				const css = styles.get(id);
				if (css !== undefined) return css;
				// A base module is the same in each build, so it can load before any layout.
				const base = /^base\.(.+)\.css$/.exec(id.slice(RESOLVED.length));
				if (base) return baseCssFor(base[1] === '-' ? null : base[1]);
				return '';
			}
			const [file, query = ''] = id.split('?');
			if (!file.endsWith('.grid')) return;
			if (query.split('&').some((q) => q === 'raw' || q === 'url' || q === 'inline')) return;
			this.addWatchFile(file);
			const compiled = compileFile(this, await readFile(file, 'utf8'), file);
			return { code: layoutModule(compiled), map: null };
		},

		transform(code, id) {
			const [file, query = ''] = id.split('?');

			if (/\.ya?ml$/.test(file) && query === 'grid') {
				const compiled = compileFile(this, code, file);
				return { code: layoutModule(compiled), map: null };
			}

			if (!SOURCE.test(file) || file.includes('/node_modules/') || query.includes('type=')) return;
			if (!code.includes(CORE) && !(modules.length && /\bgrid\b/.test(code))) return;

			const imports = namedImports(code);
			const core = imports.filter((i) => CORE_ENTRIES.has(i.source));
			const others = modules.length
				? imports.filter(
						(i) => !CORE_ENTRIES.has(i.source) && i.names.some((n) => n.imported === 'grid')
					)
				: [];
			if (!others.length) return rewrite(this, code, file, core, core);

			// An import from a module of the project: compile its calls if the module is in `modules`.
			return (async () => {
				const known = await resolveModules(this);
				const mine: Import[] = [];
				for (const i of others) {
					const resolved = await this.resolve(i.source, id);
					if (resolved && known.has(withoutQuery(resolved.id))) mine.push(i);
				}
				return rewrite(this, code, file, [...core, ...mine], core);
			})();
		}
	};
}

export default gridconfig;
