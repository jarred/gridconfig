import { LayoutError } from './errors.ts';
import type { Range } from './errors.ts';
import type { CompileOptions, Layout, LayoutInput, Step } from './types.ts';
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

/** Layouts are plain data: JSON-like values only, so the same input always compiles the same way. */
function assertPlain(value: unknown, path: Path): void {
	if (value === undefined || value === null) return;
	switch (typeof value) {
		case 'string':
		case 'boolean':
			return;
		case 'number':
			if (!Number.isFinite(value)) throw new LayoutError('Numbers must be finite', path);
			return;
		case 'object': {
			if (Array.isArray(value)) {
				value.forEach((v, i) => assertPlain(v, [...path, i]));
				return;
			}
			const proto = Object.getPrototypeOf(value);
			if (proto !== Object.prototype && proto !== null)
				throw new LayoutError(
					`A layout must be plain data, not ${proto.constructor?.name ?? 'an object with a custom prototype'}`,
					path
				);
			for (const [k, v] of Object.entries(value)) assertPlain(v, [...path, k]);
			return;
		}
		default:
			throw new LayoutError(`A layout must be plain data; found a ${typeof value}`, path);
	}
}

function stable(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
	if (value && typeof value === 'object') {
		const o = value as Record<string, unknown>;
		const keys = Object.keys(o)
			.filter((k) => o[k] !== undefined)
			.sort();
		return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
	}
	// Block scalars end with a newline; the same text written as a plain string does not.
	return JSON.stringify(typeof value === 'string' ? value.trim() : value) ?? 'null';
}

/** FNV-1a, 32 bit. Small, synchronous and the same in every runtime. */
function hash(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(36).padStart(7, '0');
}

/** Turns a file name stem such as `hero.card` or `1-hero` into a valid layout name. */
function toIdentifier(text: string): string | undefined {
	const id = text.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '');
	if (!id) return undefined;
	return /^[A-Za-z_]/.test(id) ? id : `_${id}`;
}

/**
 * Builds a validated layout from a plain object. This is the shared entry point: the YAML parser
 * ends here, and so does a layout written in JavaScript.
 *
 * `name` is optional. Without it, the name comes from `options.defaultName` (a file name stem),
 * and then from a hash of the content. The same content always gets the same name.
 */
export function parseLayoutObject(
	input: LayoutInput,
	options: CompileOptions = {},
	locate?: (path: Path) => Range | undefined
): Layout {
	try {
		const raw = input as unknown;
		if (!raw || typeof raw !== 'object' || Array.isArray(raw))
			throw new LayoutError('A layout must be an object (a YAML mapping)');
		assertPlain(raw, []);
		const obj = raw as Record<string, unknown>;

		let name = obj.name;
		if (name === undefined || name === null) {
			name =
				(options.defaultName !== undefined ? toIdentifier(options.defaultName) : undefined) ??
				`gc-${hash(stable(obj))}`;
		} else if (typeof name !== 'string' || !IDENT.test(name))
			throw new LayoutError('`name` must be a valid identifier', ['name']);

		const container = obj.container ?? 'size';
		if (container !== 'size' && container !== 'inline-size')
			throw new LayoutError('`container` must be "size" or "inline-size"', ['container']);

		const base = parseStep(obj, undefined, options);
		if (!base.areas) throw new LayoutError('The base step must set `areas`', []);

		const queries: Step[] = [];
		const seen = new Set<string>();
		for (const [key, value] of Object.entries(obj)) {
			if (TOP_LEVEL.has(key) || value === undefined) continue;
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
		return { name: name as string, container, steps: [base, ...queries], locate };
	} catch (e) {
		if (e instanceof LayoutError && !e.range && locate) e.range = locate(e.path);
		throw e;
	}
}
