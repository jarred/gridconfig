// The implementation of `grid`. It has no YAML parser: the caller gives the parser of the
// template form, or null for a `grid` that takes objects only.
import { PROJECT_OPTIONS } from './attributes.ts';
import { buildLayout } from './build.ts';
import { LayoutError } from './errors.ts';
import { parseLayoutObject } from './model.ts';
import type { CompileOptions, CompiledLayout, Layout, LayoutInput } from './types.ts';

/** The object form of `grid`. */
export type ObjectGrid<P extends string = never> = <const B extends string = never>(
	input: LayoutInput<B, P>,
	options?: CompileOptions
) => CompiledLayout;

/** The `grid` function: a tag for a static template, and a function for an object. */
export type Grid<P extends string = never> = ObjectGrid<P> &
	((strings: TemplateStringsArray, ...values: unknown[]) => CompiledLayout);

/** The names of the breakpoints in the options of `createGrid`. */
export type BreakpointNames<O extends CompileOptions> = Extract<keyof O['breakpoints'], string>;

function isTemplate(value: unknown): value is TemplateStringsArray {
	return Array.isArray(value) && 'raw' in value;
}

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
 * Makes a `grid` function. The options go on top of the options that a build plugin gives. The
 * options of one call (`grid({...}, options)`) go on top of both.
 */
export function makeGrid(
	defaults: CompileOptions,
	parseTemplate: ((source: string, options: CompileOptions) => Layout) | null
) {
	return (first: TemplateStringsArray | object, ...rest: unknown[]): CompiledLayout => {
		if (!isTemplate(first)) {
			const own = rest[0] as CompileOptions | undefined;
			const options = { ...projectOptions(), ...defaults, ...own };
			return buildLayout(parseLayoutObject(first, options), options);
		}
		if (!parseTemplate)
			throw new LayoutError(
				'This `grid` takes an object only, because it has no YAML parser. For the template form, import `grid` from "@gridconfig/core"'
			);
		if (rest.length)
			throw new LayoutError(
				'A grid template cannot contain ${} expressions: layouts must be static'
			);
		const options = { ...projectOptions(), ...defaults };
		return buildLayout(parseTemplate(first.raw.join(''), options), options);
	};
}
