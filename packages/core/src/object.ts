// `@gridconfig/core/object`: core without the YAML parser, for code that writes layouts as
// objects. `grid` and `createGrid` take an object only. For `.grid` text and the template form,
// use `@gridconfig/core`.
import { makeGrid } from './grid-base.ts';
import type { BreakpointNames, ObjectGrid } from './grid-base.ts';
import type { CompileOptions } from './types.ts';

export {
	GAP_PROPERTY,
	PADDING_PROPERTY,
	PROJECT_OPTIONS,
	STEP_PROPERTY,
	attributes
} from './attributes.ts';
export { baseCss, baseCssFor } from './base.ts';
/** Compiles a parsed layout to CSS. Use `parseLayoutObject` to parse an object. */
export { buildLayout as compileLayout } from './build.ts';
export { DEBUG_PROPERTY } from './debug.ts';
export { DEFAULT_LAYER } from './layer.ts';
export { LayoutError } from './errors.ts';
export type { Range } from './errors.ts';
export type { ObjectGrid } from './grid-base.ts';
export { parseLayoutObject } from './model.ts';
export type {
	CompileOptions,
	CompiledLayout,
	DebugInfo,
	DebugStep,
	Flow,
	FlowEntry,
	FlowInput,
	Layout,
	LayoutInput,
	QueryKey,
	Step,
	StepInput,
	Warning
} from './types.ts';
export { compileValue } from './values.ts';

/**
 * Makes a `grid` function with options of its own, for example the breakpoints of a project.
 * It takes an object only.
 */
export function createGrid<const O extends CompileOptions>(
	defaults: O = {} as O
): ObjectGrid<BreakpointNames<O>> {
	return makeGrid(defaults, null) as ObjectGrid<BreakpointNames<O>>;
}

/**
 * Defines and compiles a layout from an object: `grid({ areas: 'A', 600: { areas: 'A B' } })`.
 * A build plugin compiles a static call at build time, as it does for the `grid` of
 * `@gridconfig/core`.
 */
export const grid: ObjectGrid = createGrid();
