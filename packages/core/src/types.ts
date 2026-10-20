import type { Range } from './errors.ts';

/** How the direct children of an area are arranged. All values are resolved; `gap` is CSS. */
export type Flow = {
	direction: 'row' | 'column';
	main: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
	cross: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
	/** A CSS value, after the value grammar. Absent means `gap: normal`. */
	gap?: string;
	wrap: boolean;
};

/** One entry of a `flow` map. `none` removes flow from the area at this step. */
export type FlowEntry = Flow | 'none';

/** A flow written as an object. Absent keys get their defaults. */
export type FlowInput = {
	direction?: Flow['direction'];
	main?: Flow['main'];
	cross?: Flow['cross'];
	/** A value: see the value grammar in the spec. An expression or a list is permitted. */
	gap?: number | string;
	wrap?: boolean;
};

export type Step = {
	/** The query key this step was written under; undefined for the base step. */
	key?: string;
	/** Container min-width in px; undefined for the base step or a height-only query. */
	minWidth?: number;
	minHeight?: number;
	/** CSS values: the value grammar has already been applied. */
	cols?: string;
	rows?: string;
	gap?: string;
	padding?: string;
	/** Rows of cell names; '.' is an empty cell. */
	areas?: string[][];
	/** Raw declarations applied to the grid element. */
	css?: string;
	/** Flow for each named area. A step that sets an entry writes all of its properties. */
	flow?: Record<string, FlowEntry>;
};

export type Layout = {
	name: string;
	container: 'size' | 'inline-size';
	/** Base step first (no min-* values), then query steps sorted by min-width, then min-height. */
	steps: Step[];
	/** Maps a key path to a source range, for error reporting. */
	locate?: (path: (string | number)[]) => Range | undefined;
};

export type Warning = { message: string; path: (string | number)[] };

/** One step in the debug data. Values are CSS, after the value grammar and the track inference. */
export type DebugStep = {
	/** The query key, or null for the base step. */
	key: string | null;
	minWidth?: number;
	minHeight?: number;
	cols?: string;
	rows?: string;
	gap?: string;
	padding?: string;
	areas?: string[][];
	flow?: Record<string, FlowEntry>;
};

/**
 * What a tool needs to explain a layout in the browser: the steps in cascade order (the base step
 * first, the last matching step wins for each property). Only present when compiled with `debug`.
 */
export type DebugInfo = {
	/** The version of this format. */
	v: 1;
	name: string;
	container: 'size' | 'inline-size';
	/** Every area name used by the layout. */
	areas: string[];
	steps: DebugStep[];
	warnings: string[];
};

export type CompiledLayout = {
	name: string;
	/** Per-layout CSS. Needs `baseCssFor(layer)` on the page as well. */
	css: string;
	/** The cascade layer of the CSS, or null when the layout was compiled with `layer: false`. */
	layer: string | null;
	/** Every area name used by the layout. */
	areas: string[];
	warnings: Warning[];
	/** Present only when compiled with `debug: true`. */
	debug?: DebugInfo;
};

export type CompileOptions = {
	/** Prefix for token variables: `{space.2}` with prefix `ds` becomes `var(--ds-space-2)`. */
	tokenPrefix?: string;
	/** Replaces the token mapping entirely. Receives `space.2`, returns a CSS value. */
	tokenVar?: (path: string) => string;
	/**
	 * Used as the layout name when the layout has no `name`. Pass a file name stem; it is made
	 * into a valid identifier. Without it, the name is a hash of the content.
	 */
	defaultName?: string;
	/**
	 * The cascade layer for the compiled CSS. A layer name, `true` (the default, "gridconfig") or
	 * `false` for no layer. The rules that hide areas are never in a layer.
	 */
	layer?: boolean | string;
	/**
	 * Adds data for development tools. The data is in `debug`, and the CSS also carries it in the
	 * custom property `--gc-debug` on the host. Use it in development only: it makes the CSS larger.
	 */
	debug?: boolean;
};

/** A query key: minimum container width and/or height in px, such as `600x400`, `600x`, `x400` or `600`. */
export type QueryKey = `${number}x${number}` | `${number}x` | `x${number}` | `${number}`;

/** The settings that the base and every query step accept. */
export type StepInput = {
	/** A number of equal tracks, or a track list. */
	cols?: number | string;
	rows?: number | string;
	/** A value: see the value grammar in the spec. */
	gap?: number | string;
	padding?: number | string;
	/** A multi-line string. One line is one row. */
	areas?: string;
	/** Raw declarations for the grid element. */
	css?: string;
	/** Flow for each area: a flow string such as `column center start`, a flow object, or `none`. */
	flow?: Record<string, string | FlowInput>;
};

/** A layout written as a plain object. It has the same shape as the YAML form. */
export type LayoutInput = StepInput & {
	/** Optional. Defaults to a file name stem, or to a hash of the content. */
	name?: string;
	container?: 'size' | 'inline-size';
} & { [K in QueryKey]?: StepInput };
