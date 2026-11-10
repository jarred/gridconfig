import { makeGrid } from './grid-base.ts';
import type { BreakpointNames, Grid } from './grid-base.ts';
import { parseLayout } from './parse.ts';
import type { CompileOptions } from './types.ts';

export type { Grid, ObjectGrid } from './grid-base.ts';

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
): Grid<BreakpointNames<O>> {
	return makeGrid(defaults, parseLayout) as Grid<BreakpointNames<O>>;
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
