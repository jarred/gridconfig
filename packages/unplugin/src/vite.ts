import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { LayoutError, baseCssFor, compileLayout, parseLayoutObject } from '@gridconfig/core';
import type { CompileOptions, CompiledLayout, LayoutInput } from '@gridconfig/core';
import { findCalls, lineOf, localNames } from './extract.ts';

/** Files that can contain `grid` calls. The scanner reads raw text, so single-file components work. */
const SOURCE = /\.(?:[cm]?[jt]sx?|svelte|vue|astro|mdx?)$/;

/** Virtual CSS modules: `virtual:gridconfig/base.<layer>.css` and `virtual:gridconfig/layout.<name>.css`. */
const VIRTUAL = 'virtual:gridconfig/';
const RESOLVED = '\0' + VIRTUAL;
const baseId = (layer: string | null) => `${VIRTUAL}base.${layer ?? '-'}.css`;
const layoutId = (name: string) => `${VIRTUAL}layout.${name}.css`;

/** The first import of `grid` from core. CSS imports go after it, so they stay inside a <script>. */
const CORE_IMPORT = /import\s+\{[^}]*\}\s*from\s*['"]@gridconfig\/core['"];?/;

type Context = {
	warn(message: string): void;
	error(error: {
		message: string;
		id?: string;
		loc?: { file: string; line: number; column: number };
	}): never;
	addWatchFile?(file: string): void;
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
export function layoutPlugin(options: CompileOptions = {}): Plugin {
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
				? { file, line: start.line + lineOffset, column: start.col - 1 + column }
				: lineOffset
					? { file, line: 1 + lineOffset, column }
					: undefined
		});
	}

	function compileFile(ctx: Context, source: string, file: string): CompiledLayout {
		try {
			const compiled = compileLayout(source, {
				defaultName: basename(file, extname(file)),
				...compileOptions()
			});
			for (const w of compiled.warnings) ctx.warn(`${file}: ${w.message}`);

			for (const [other, name] of names)
				if (other !== file && name === compiled.name)
					throw new LayoutError(
						`The name "${compiled.name}" is also used by ${other}. Set a different \`name\` in one of the two files.`
					);
			names.set(file, compiled.name);
			return compiled;
		} catch (e) {
			return report(ctx, e, file);
		}
	}

	return {
		name: 'gridconfig:layout',
		enforce: 'pre',

		configResolved(config) {
			serving = config.command === 'serve';
		},

		configureServer(dev) {
			server = dev;
		},

		resolveId(id) {
			if (id.startsWith(VIRTUAL)) return '\0' + id;
		},

		async load(id) {
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
			if (!code.includes('@gridconfig/core')) return;
			const local = localNames(code);
			if (!local.size) return;

			const calls = findCalls(code, local);
			if (!calls.length) return;

			let out = '';
			let cursor = 0;
			const imports: string[] = [];
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
					// Lines inside a template start at the line of its opening backtick.
					return report(this, e, file, startLine - 1);
				}
				for (const w of compiled.warnings) this.warn(`${file}:${startLine}: ${w.message}`);

				// Keep the line count, so that the lines after the call do not move.
				const newlines = '\n'.repeat(original.split('\n').length - 1);
				const bundled = bundle(compiled);
				imports.push(...bundled.imports);
				out += code.slice(cursor, call.start) + `(${JSON.stringify(bundled.layout)})` + newlines;
				cursor = call.end;
			}
			out += code.slice(cursor);
			// On the same line as the core import, so that the lines after it do not move.
			out = out.replace(CORE_IMPORT, (m) => `${m};${importLines(imports)}`);
			return { code: out, map: null };
		}
	};
}
