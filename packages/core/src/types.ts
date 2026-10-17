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
	/** Per-layout CSS. Needs `baseCss` on the page as well. */
	css: string;
	/** Every area name used by the layout. */
	areas: string[];
	warnings: Warning[];
};

export type CompileOptions = {
	/** Prefix for token variables: `{space.2}` with prefix `ds` becomes `var(--ds-space-2)`. */
	tokenPrefix?: string;
	/** Replaces the token mapping entirely. Receives `space.2`, returns a CSS value. */
	tokenVar?: (path: string) => string;
};
