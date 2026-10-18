import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { Plugin } from 'vite';
import { LayoutError, compileLayout, parseLayoutObject } from '@gridconfig/core';
import type { CompileOptions, CompiledLayout, LayoutInput } from '@gridconfig/core';
import { findCalls, lineOf, localNames } from './extract.ts';

/** Files that can contain `grid` calls. The scanner reads raw text, so single-file components work. */
const SOURCE = /\.(?:[cm]?[jt]sx?|svelte|vue|astro|mdx?)$/;

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
				...options
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

		async load(id) {
			const [file, query = ''] = id.split('?');
			if (!file.endsWith('.grid')) return;
			if (query.split('&').some((q) => q === 'raw' || q === 'url' || q === 'inline')) return;
			this.addWatchFile(file);
			const compiled = compileFile(this, await readFile(file, 'utf8'), file);
			return { code: `export default ${JSON.stringify(compiled)};`, map: null };
		},

		transform(code, id) {
			const [file, query = ''] = id.split('?');

			if (/\.ya?ml$/.test(file) && query === 'grid') {
				const compiled = compileFile(this, code, file);
				return { code: `export default ${JSON.stringify(compiled)};`, map: null };
			}

			if (!SOURCE.test(file) || file.includes('/node_modules/') || query.includes('type=')) return;
			if (!code.includes('@gridconfig/core')) return;
			const local = localNames(code);
			if (!local.size) return;

			const calls = findCalls(code, local);
			if (!calls.length) return;

			let out = '';
			let cursor = 0;
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
							? compileLayout(call.source, options)
							: compileLayout(parseLayoutObject(call.value as LayoutInput, options), options);
				} catch (e) {
					// Lines inside a template start at the line of its opening backtick.
					return report(this, e, file, startLine - 1);
				}
				for (const w of compiled.warnings) this.warn(`${file}:${startLine}: ${w.message}`);

				// Keep the line count, so that the lines after the call do not move.
				const newlines = '\n'.repeat(original.split('\n').length - 1);
				out += code.slice(cursor, call.start) + `(${JSON.stringify(compiled)})` + newlines;
				cursor = call.end;
			}
			out += code.slice(cursor);
			return { code: out, map: null };
		}
	};
}
