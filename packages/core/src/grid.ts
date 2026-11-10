import { PROJECT_OPTIONS } from './attributes.ts';
import { compileLayout } from './compile.ts';
import { LayoutError } from './errors.ts';
import { parseLayoutObject } from './model.ts';
import { parseLayout } from './parse.ts';
import type { CompileOptions, CompiledLayout, LayoutInput } from './types.ts';

function isTemplate(value: unknown): value is TemplateStringsArray {
	return Array.isArray(value) && 'raw' in value;
}

/** The `grid` function: a tag for a static template, and a function for an object. */
export type Grid<P extends string = never> = {
	(strings: TemplateStringsArray, ...values: unknown[]): CompiledLayout;
	<const B extends string = never>(
		input: LayoutInput<B, P>,
		options?: CompileOptions
	): CompiledLayout;
};

/**
 * The options that a build plugin gives to the page. They are the defaults of each layout that
 * compiles when the code runs. Thus that layout uses the same breakpoints, token prefix and
 * layer as the layouts that the plugin compiles.
 */
function projectOptions(): CompileOptions {
	const store = globalThis as { [key: symbol]: CompileOptions | undefined };
	return store[Symbol.for(PROJECT_OPTIONS)] ?? {};
}

/**
 * Makes a `grid` function with options of its own, for example the breakpoints of a project.
 *
 * ```ts
 * export const grid = createGrid({ breakpoints: { md: '600..' }, tokenPrefix: 'ds' });
 * grid`
 *   areas: A
 *   md:
 *     areas: A B
 * `;
 * ```
 *
 * The options go on top of the options that a build plugin gives. The options of one call
 * (`grid({...}, options)`) go on top of both.
 */
export function createGrid<const O extends CompileOptions>(
	defaults: O = {} as O
): Grid<Extract<keyof O['breakpoints'], string>> {
	return (first: TemplateStringsArray | object, ...rest: unknown[]): CompiledLayout => {
		const template = isTemplate(first);
		if (template && rest.length)
			throw new LayoutError(
				'A grid template cannot contain ${} expressions: layouts must be static'
			);
		const own = template ? undefined : (rest[0] as CompileOptions | undefined);
		const options = { ...projectOptions(), ...defaults, ...own };
		return compileLayout(
			template ? parseLayout(first.raw.join(''), options) : parseLayoutObject(first, options),
			options
		);
	};
}

/**
 * Defines and compiles a layout in code. There are two forms.
 *
 * ```ts
 * grid`
 *   areas: A
 *   600:
 *     areas: |
 *       A A
 *       B B
 * `;
 * grid({ areas: 'A', 600: { areas: 'A A\nB B' } });
 * ```
 *
 * Both forms must be static: a template cannot contain `${}`, and an object must be plain data.
 * Then a build plugin can compile the layout at build time and replace the call.
 * Without the plugin, the layout compiles when this function runs. For options that apply to
 * each layout of a project, use `createGrid`.
 */
export const grid: Grid = createGrid();
