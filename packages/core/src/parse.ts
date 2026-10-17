import { LineCounter, isMap, isScalar, parseDocument } from 'yaml';
import { LayoutError } from './errors.ts';
import type { Range } from './errors.ts';
import type { CompileOptions, Layout, Step } from './types.ts';
import { NUMBER, OPERATORS, compileValue, convertTerm, splitTerms } from './values.ts';

type Path = (string | number)[];

const TOP_LEVEL = new Set(['name', 'container', 'gap', 'padding', 'cols', 'rows', 'areas', 'css']);
const SETTINGS = new Set(['gap', 'padding', 'cols', 'rows', 'areas', 'css']);
const QUERY_KEY = /^(\d+(?:\.\d+)?)?x(\d+(?:\.\d+)?)?$/;
const IDENT = /^[A-Za-z_][\w-]*$/;
const RESERVED_AREAS = new Set([
	'auto',
	'span',
	'default',
	'inherit',
	'initial',
	'unset',
	'revert'
]);

/** `3` -> repeat(3, 1fr); `3x200px` -> repeat(3, minmax(200px, 1fr)); `1fr*3` -> repeat(3, 1fr). */
function tracks(value: unknown, options: CompileOptions, path: Path): string {
	if (typeof value === 'number') {
		if (!Number.isInteger(value) || value < 1)
			throw new LayoutError('A track count must be a positive integer', path);
		return `repeat(${value}, 1fr)`;
	}
	if (typeof value !== 'string') throw new LayoutError('Expected a number or a string', path);

	const terms = splitTerms(value, path);
	if (!terms.length) throw new LayoutError('Value is empty', path);
	if (terms.length === 1 && /^\d+$/.test(terms[0])) return tracks(Number(terms[0]), options, path);

	return terms
		.map((term) => {
			if (OPERATORS.has(term))
				throw new LayoutError(
					`Operators are not supported in track lists ("${term}"); use calc()`,
					path
				);
			const min = /^(\d+)x(.+)$/.exec(term);
			if (min)
				return `repeat(${min[1]}, minmax(${convertTerm(min[2], false, options, path)}, 1fr))`;
			const rep = /^(.+)\*(\d+)$/.exec(term);
			if (rep) return `repeat(${rep[2]}, ${convertTerm(rep[1], false, options, path)})`;
			return convertTerm(term, false, options, path);
		})
		.join(' ');
}

function parseAreas(source: unknown, path: Path): string[][] {
	if (typeof source !== 'string') throw new LayoutError('Expected a multi-line string', path);
	const lines = source
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);
	if (!lines.length) throw new LayoutError('Area map is empty', path);

	// Whitespace-separated allows multi-character names; otherwise each character is a cell.
	const spaced = lines.some((l) => /\s/.test(l));
	const grid = lines.map((l) =>
		(spaced ? l.split(/\s+/) : [...l]).map((c) => (/^\.+$/.test(c) ? '.' : c))
	);

	grid.forEach((row, i) => {
		if (row.length !== grid[0].length)
			throw new LayoutError(
				`Row ${i + 1} has ${row.length} cells, expected ${grid[0].length}`,
				path
			);
		for (const cell of row) {
			if (cell === '.') continue;
			if (!IDENT.test(cell)) throw new LayoutError(`Invalid area name "${cell}"`, path);
			if (RESERVED_AREAS.has(cell.toLowerCase()))
				throw new LayoutError(`"${cell}" is reserved and cannot be used as an area name`, path);
		}
	});

	const boxes = new Map<string, { r0: number; r1: number; c0: number; c1: number; n: number }>();
	grid.forEach((row, r) =>
		row.forEach((name, c) => {
			if (name === '.') return;
			const b = boxes.get(name) ?? { r0: r, r1: r, c0: c, c1: c, n: 0 };
			b.r0 = Math.min(b.r0, r);
			b.r1 = Math.max(b.r1, r);
			b.c0 = Math.min(b.c0, c);
			b.c1 = Math.max(b.c1, c);
			b.n++;
			boxes.set(name, b);
		})
	);
	for (const [name, b] of boxes)
		if ((b.r1 - b.r0 + 1) * (b.c1 - b.c0 + 1) !== b.n)
			throw new LayoutError(`Area "${name}" is not a filled rectangle`, path);

	return grid;
}

function parseStep(
	raw: Record<string, unknown>,
	key: string | undefined,
	options: CompileOptions
): Step {
	const at = (setting: string): Path => (key === undefined ? [setting] : [key, setting]);
	const step: Step = {};
	if (key !== undefined) {
		step.key = key;
		for (const k of Object.keys(raw)) {
			if (k === 'name' || k === 'container')
				throw new LayoutError(`\`${k}\` can only be set at the top level`, at(k));
			if (!SETTINGS.has(k)) throw new LayoutError(`Unknown setting "${k}" in "${key}"`, at(k));
		}
	}
	if (raw.cols != null) step.cols = tracks(raw.cols, options, at('cols'));
	if (raw.rows != null) step.rows = tracks(raw.rows, options, at('rows'));
	if (raw.gap != null) step.gap = compileValue(raw.gap, options, at('gap'));
	if (raw.padding != null) step.padding = compileValue(raw.padding, options, at('padding'));
	if (raw.areas != null) step.areas = parseAreas(raw.areas, at('areas'));
	if (raw.css != null) {
		step.css = String(raw.css).trim();
		if (/<\/style/i.test(step.css))
			throw new LayoutError('`css` must not contain "</style"', at('css'));
	}
	return step;
}

function makeLocator(doc: ReturnType<typeof parseDocument>, lines: LineCounter) {
	const pos = (offset: number) => {
		const { line, col } = lines.linePos(offset);
		return { line, col };
	};
	return (path: Path): Range | undefined => {
		let node: unknown = doc.contents;
		for (const segment of path) {
			if (!isMap(node)) break;
			const pair = node.items.find(
				(p) => String(isScalar(p.key) ? p.key.value : p.key) === String(segment)
			);
			if (!pair) break;
			node = pair.value;
		}
		const range = (node as { range?: [number, number, number] } | null)?.range;
		return range ? { start: pos(range[0]), end: pos(range[1]) } : undefined;
	};
}

export function parseLayout(source: string, options: CompileOptions = {}): Layout {
	const lines = new LineCounter();
	const doc = parseDocument(source, { lineCounter: lines });
	const locate = makeLocator(doc, lines);

	try {
		if (doc.errors.length) {
			const err = doc.errors[0];
			const [a, b] = err.linePos ?? [];
			const end = b ?? a;
			throw new LayoutError(
				err.message.split('\n')[0],
				[],
				a && end && { start: { line: a.line, col: a.col }, end: { line: end.line, col: end.col } }
			);
		}

		const raw = doc.toJS() as Record<string, unknown> | null;
		if (!raw || typeof raw !== 'object' || Array.isArray(raw))
			throw new LayoutError('Layout must be a YAML mapping');

		const name = raw.name;
		if (typeof name !== 'string' || !IDENT.test(name))
			throw new LayoutError('`name` is required and must be a valid identifier', ['name']);

		const container = raw.container ?? 'size';
		if (container !== 'size' && container !== 'inline-size')
			throw new LayoutError('`container` must be "size" or "inline-size"', ['container']);

		const base = parseStep(raw, undefined, options);
		if (!base.areas) throw new LayoutError('The base step must set `areas`', []);

		const queries: Step[] = [];
		const seen = new Set<string>();
		for (const [key, value] of Object.entries(raw)) {
			if (TOP_LEVEL.has(key)) continue;
			// A bare number such as `600` is shorthand for `600x`.
			const normalised = NUMBER.test(key) ? `${key}x` : key;
			const m = QUERY_KEY.exec(normalised);
			if (!m || (m[1] === undefined && m[2] === undefined))
				throw new LayoutError(
					`Unknown key "${key}": expected a setting or a query like 600x400, 600x, x400`,
					[key]
				);
			const id = `${m[1] ?? ''}x${m[2] ?? ''}`;
			if (seen.has(id)) throw new LayoutError(`Query "${key}" duplicates an earlier query`, [key]);
			seen.add(id);
			if (!value || typeof value !== 'object' || Array.isArray(value))
				throw new LayoutError(`"${key}" must be a mapping`, [key]);

			const step = parseStep(value as Record<string, unknown>, key, options);
			if (m[1] !== undefined) step.minWidth = Number(m[1]);
			if (m[2] !== undefined) step.minHeight = Number(m[2]);
			queries.push(step);
		}

		queries.sort(
			(a, b) => (a.minWidth ?? 0) - (b.minWidth ?? 0) || (a.minHeight ?? 0) - (b.minHeight ?? 0)
		);
		return { name, container, steps: [base, ...queries], locate };
	} catch (e) {
		if (e instanceof LayoutError && !e.range) e.range = locate(e.path);
		throw e;
	}
}
