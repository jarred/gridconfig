/** The attribute names of the DOM contract. Adapters and the compiler share these. */
export const attributes = {
	host: 'data-grid-host',
	layout: 'data-grid-layout',
	area: 'data-grid-area'
} as const;

/**
 * The custom property that holds the key of the active step on the grid element: "base", or a
 * query key such as "450x200". Content can target a step with `@container style(--grid-step: 450x200)`.
 */
export const STEP_PROPERTY = '--grid-step';

/**
 * The custom properties that hold the gap and the padding of the layout on the grid element.
 * Content can use them, for example `padding: var(--grid-gap)`.
 */
export const GAP_PROPERTY = '--grid-gap';
export const PADDING_PROPERTY = '--grid-padding';

/**
 * The key of the project options: `globalThis[Symbol.for(PROJECT_OPTIONS)]`. A build plugin sets
 * them, so that a layout that compiles when the code runs gets the options of the plugin.
 */
export const PROJECT_OPTIONS = 'gridconfig.options';
