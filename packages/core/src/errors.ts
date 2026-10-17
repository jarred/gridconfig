/** 1-based line and column positions within the layout source. */
export type Range = {
	start: { line: number; col: number };
	end: { line: number; col: number };
};

/** A problem in a layout file, with the key path (and, when known, the source range) it belongs to. */
export class LayoutError extends Error {
	path: (string | number)[];
	range?: Range;

	constructor(message: string, path: (string | number)[] = [], range?: Range) {
		super(message);
		this.name = 'LayoutError';
		this.path = path;
		this.range = range;
	}
}
