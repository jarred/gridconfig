/** The attribute names of the DOM contract. Adapters and the compiler share these. */
export const attributes = {
	host: 'data-grid-host',
	layout: 'data-grid-layout',
	area: 'data-grid-area'
} as const;

/**
 * The custom property that holds the key of the active step on the grid element: "base", or a
 * query key such as "450x200". Content can target a step with `@container style(--gc-step: 450x200)`.
 */
export const STEP_PROPERTY = '--gc-step';
