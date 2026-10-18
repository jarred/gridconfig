import type { Range } from './errors.ts';

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

export type CompiledLayout = {
	name: string;
	/** Per-layout CSS. Needs `baseCssFor(layer)` on the page as well. */
	css: string;
	/** The cascade layer of the CSS, or null when the layout was compiled with `layer: false`. */
	layer: string | null;
	/** Every area name used by the layout. */
	areas: string[];
	warnings: Warning[];
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
};

/** A layout written as a plain object. It has the same shape as the YAML form. */
export type LayoutInput = StepInput & {
	/** Optional. Defaults to a file name stem, or to a hash of the content. */
	name?: string;
	container?: 'size' | 'inline-size';
} & { [K in QueryKey]?: StepInput };
