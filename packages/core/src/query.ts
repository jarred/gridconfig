// Query keys: the conditions of a step. This module has no YAML parser, so the browser can use it.
import { LayoutError } from './errors.ts';

type Path = (string | number)[];

/** A range in px. `min` is inclusive and `max` is exclusive, so `..600` and `600..` meet exactly. */
export type Bound = { min?: number; max?: number };

/** An aspect ratio, width to height: `[16, 9]`. */
export type RatioValue = [number, number];

/** A range of aspect ratios. `min` is inclusive and `max` is exclusive. */
export type RatioBound = { min?: RatioValue; max?: RatioValue };

/** Terms that must all match (AND). An empty clause matches every size. */
export type Clause = {
	w?: Bound;
	h?: Bound;
	ratio?: RatioBound;
	orientation?: 'portrait' | 'landscape';
};

/** Clauses of which one must match (OR). The base step matches every size: `[{}]`. */
export type Condition = Clause[];

const NUM = String.raw`\d+(?:\.\d+)?`;
const RANGE = String.raw`(?:${NUM}(?:\.\.(?:${NUM})?)?|\.\.${NUM})`;
const SIZE = new RegExp(String.raw`^(${RANGE})?(?:x(${RANGE})?)?$`);
const RATIO_VALUE = String.raw`${NUM}/${NUM}`;
const RATIO = new RegExp(
	String.raw`^(?:(${RATIO_VALUE})(\.\.(${RATIO_VALUE})?)?|\.\.(${RATIO_VALUE}))$`
);
const ORIENTATIONS = new Set(['portrait', 'landscape']);

/** The words that a query term can be, so a breakpoint name can't be one of them. */
export function isQueryTerm(text: string): boolean {
	if (ORIENTATIONS.has(text)) return true;
	const size = SIZE.exec(text);
	return Boolean((size && (size[1] || size[2])) || RATIO.test(text));
}

const ratioNumber = ([p, q]: RatioValue) => p / q;

function parseRange(text: string, what: string, key: string, path: Path): Bound {
	const [a, b] = text.split('..');
	const bound: Bound = {};
	if (a) bound.min = Number(a);
	if (text.includes('..') && b) bound.max = Number(b);
	if (bound.min !== undefined && bound.max !== undefined && bound.min >= bound.max)
		throw new LayoutError(
			`The ${what} range "${text}" in "${key}" is empty: the minimum must be less than the maximum`,
			path
		);
	if (bound.max === 0)
		throw new LayoutError(`The ${what} range "${text}" in "${key}" is empty`, path);
	return bound;
}

function parseRatioValue(text: string, key: string, path: Path): RatioValue {
	const [p, q] = text.split('/').map(Number);
	if (!(p > 0 && q > 0))
		throw new LayoutError(`The ratio "${text}" in "${key}" must have two positive numbers`, path);
	return [p, q];
}

function parseTerm(
	term: string,
	key: string,
	names: Map<string, Condition>,
	path: Path
): Condition {
	if (ORIENTATIONS.has(term)) return [{ orientation: term as Clause['orientation'] }];

	const size = SIZE.exec(term);
	if (size && (size[1] || size[2])) {
		const clause: Clause = {};
		if (size[1]) clause.w = parseRange(size[1], 'width', key, path);
		if (size[2]) clause.h = parseRange(size[2], 'height', key, path);
		return [clause];
	}

	const ratio = RATIO.exec(term);
	if (ratio) {
		const bound: RatioBound = {};
		if (ratio[1]) bound.min = parseRatioValue(ratio[1], key, path);
		if (ratio[3]) bound.max = parseRatioValue(ratio[3], key, path);
		if (ratio[4]) bound.max = parseRatioValue(ratio[4], key, path);
		if (bound.min && bound.max && ratioNumber(bound.min) >= ratioNumber(bound.max))
			throw new LayoutError(
				`The ratio range "${term}" in "${key}" is empty: the minimum must be less than the maximum`,
				path
			);
		return [{ ratio: bound }];
	}

	const named = names.get(term);
	if (named) return named;

	const expected =
		'a size (600, 600x400, x400, ..900, 600..900), a ratio (16/9, ..4/3), portrait, landscape, or a name from `breakpoints`';
	throw new LayoutError(
		term === key
			? `Unknown key "${key}": expected a setting or a query. A query is ${expected}`
			: `Unknown term "${term}" in "${key}": expected ${expected}`,
		path
	);
}

const DIMENSIONS = { w: 'width', h: 'height', ratio: 'ratio', orientation: 'orientation' } as const;

/** AND of two clauses. Each dimension can come from one term only. */
function merge(a: Clause, b: Clause, key: string, path: Path): Clause {
	const out: Clause = { ...a };
	for (const dim of Object.keys(b) as (keyof Clause)[]) {
		if (out[dim] !== undefined)
			throw new LayoutError(
				`"${key}" has more than one ${DIMENSIONS[dim]} term. Write one ${DIMENSIONS[dim]} term, for example a range such as 600..900`,
				path
			);
		(out as Record<string, unknown>)[dim] = b[dim];
	}
	return out;
}

/**
 * Parses a query key. Commas separate alternatives (OR). Spaces separate terms (AND). A term is a
 * size, a ratio, an orientation, or a name from `names`.
 */
export function parseQuery(key: string, names: Map<string, Condition>, path: Path): Condition {
	const alternatives = key.split(',').map((part) => part.trim());
	if (alternatives.some((part) => !part))
		throw new LayoutError(`"${key}" has an empty alternative. Commas separate alternatives`, path);
	return alternatives.flatMap((alternative) =>
		alternative
			.split(/\s+/)
			.map((term) => parseTerm(term, key, names, path))
			.reduce((acc, next) => acc.flatMap((a) => next.map((b) => merge(a, b, key, path))))
	);
}

// --- Matching ---------------------------------------------------------------

const within = (v: number, b: Bound) =>
	(b.min === undefined || v >= b.min) && (b.max === undefined || v < b.max);

/** Compares w/h with a ratio: 1 above, -1 below, 0 equal (with a tolerance for rounding). */
function compareRatio(w: number, h: number, [p, q]: RatioValue): number {
	const a = w * q;
	const b = p * h;
	const tolerance = 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1);
	return a - b > tolerance ? 1 : a - b < -tolerance ? -1 : 0;
}

export function clauseMatches(c: Clause, w: number, h: number): boolean {
	if (c.w && !within(w, c.w)) return false;
	if (c.h && !within(h, c.h)) return false;
	if (c.ratio?.min && compareRatio(w, h, c.ratio.min) < 0) return false;
	if (c.ratio?.max && compareRatio(w, h, c.ratio.max) >= 0) return false;
	// CSS: portrait when the height is greater than or equal to the width.
	if (c.orientation === 'landscape' && compareRatio(w, h, [1, 1]) <= 0) return false;
	if (c.orientation === 'portrait' && compareRatio(w, h, [1, 1]) > 0) return false;
	return true;
}

/** True when the condition matches a container of this size. No condition matches every size. */
export function matches(condition: Condition | undefined, w: number, h: number): boolean {
	return !condition || condition.some((c) => clauseMatches(c, w, h));
}

/** True when a term needs the height of the container: a height, a ratio, or an orientation. */
export function usesHeight(condition: Condition): boolean {
	return condition.some((c) => c.h || c.ratio || c.orientation);
}

// --- CSS ---------------------------------------------------------------------

const px = (n: number) => `${n}px`;
const ratioText = ([p, q]: RatioValue) => `${p}/${q}`;

function rangeCss<T>(
	feature: string,
	min: T | undefined,
	max: T | undefined,
	text: (v: T) => string,
	prefix = true
) {
	if (max === undefined)
		return prefix ? `(min-${feature}: ${text(min!)})` : `(${feature} >= ${text(min!)})`;
	if (min === undefined) return `(${feature} < ${text(max)})`;
	return `(${text(min)} <= ${feature} < ${text(max)})`;
}

function clauseParts(c: Clause): string[] {
	const parts: string[] = [];
	if (c.w) parts.push(rangeCss('width', c.w.min, c.w.max, px));
	if (c.h) parts.push(rangeCss('height', c.h.min, c.h.max, px));
	if (c.ratio) parts.push(rangeCss('aspect-ratio', c.ratio.min, c.ratio.max, ratioText, false));
	if (c.orientation) parts.push(`(orientation: ${c.orientation})`);
	return parts;
}

/** The container condition, for `@container <name> <condition>`. */
export function conditionCss(condition: Condition): string {
	const clauses = condition.map(clauseParts);
	if (clauses.length === 1) return clauses[0].join(' and ');
	// `and` and `or` can't be mixed at one level, so each clause with more than one part gets ().
	return clauses.map((p) => (p.length === 1 ? p[0] : `(${p.join(' and ')})`)).join(' or ');
}

/** The condition as one `<query-in-parens>`, for use with `not` and `and`. */
export function conditionInParens(condition: Condition): string {
	const css = conditionCss(condition);
	return condition.length === 1 && clauseParts(condition[0]).length === 1 ? css : `(${css})`;
}

/** Writes a condition as a query key, for messages. */
export function conditionKey(condition: Condition): string {
	const range = (b: Bound) => (b.max === undefined ? `${b.min}` : `${b.min ?? ''}..${b.max}`);
	return condition
		.map((c) => {
			const terms: string[] = [];
			if (c.w || c.h) {
				const w = c.w ? range(c.w) : '';
				const h = c.h ? range(c.h) : '';
				// A width with a max needs no `x`: `600..900`. A width alone is the short form.
				terms.push(c.h ? `${w}x${h}` : w);
			}
			if (c.ratio) {
				const { min, max } = c.ratio;
				terms.push(max ? `${min ? ratioText(min) : ''}..${ratioText(max)}` : ratioText(min!));
			}
			if (c.orientation) terms.push(c.orientation);
			return terms.join(' ');
		})
		.join(', ');
}

/** AND of two conditions, or null when they can never match together in an obvious way. */
export function intersect(a: Condition, b: Condition): Condition | null {
	if (a.length !== 1 || b.length !== 1) return null;
	const [x, y] = [a[0], b[0]];
	const out: Clause = {};
	for (const dim of ['w', 'h'] as const) {
		const p = x[dim];
		const q = y[dim];
		if (!p && !q) continue;
		const min = Math.max(p?.min ?? 0, q?.min ?? 0);
		const max = Math.min(p?.max ?? Infinity, q?.max ?? Infinity);
		if (min >= max) return null;
		out[dim] = { ...(min > 0 && { min }), ...(max < Infinity && { max }) };
	}
	if (x.ratio || y.ratio) {
		const mins = [x.ratio?.min, y.ratio?.min].filter((r): r is RatioValue => !!r);
		const maxes = [x.ratio?.max, y.ratio?.max].filter((r): r is RatioValue => !!r);
		const min = mins.sort((r, s) => ratioNumber(s) - ratioNumber(r))[0];
		const max = maxes.sort((r, s) => ratioNumber(r) - ratioNumber(s))[0];
		if (min && max && ratioNumber(min) >= ratioNumber(max)) return null;
		out.ratio = { ...(min && { min }), ...(max && { max }) };
	}
	if (x.orientation && y.orientation && x.orientation !== y.orientation) return null;
	if (x.orientation || y.orientation) out.orientation = x.orientation ?? y.orientation;
	return [out];
}

/**
 * `a` with a max that stops it where `b` starts, so the two do not overlap. For example `100x100`
 * and `200` give `100..200x100`. Null when no single max does that.
 */
export function limitBefore(a: Condition, b: Condition): Condition | null {
	if (a.length !== 1 || b.length !== 1) return null;
	for (const dim of ['w', 'h'] as const) {
		const start = b[0][dim]?.min;
		const own = a[0][dim];
		if (start === undefined || own?.max !== undefined || (own?.min ?? 0) >= start) continue;
		if (b[0][dim]?.max !== undefined) continue;
		return [{ ...a[0], [dim]: { ...own, max: start } }];
	}
	return null;
}

// --- Sample points -------------------------------------------------------------

/** Sorted, positive, and without near-duplicates. */
function distinct(values: Iterable<number>): number[] {
	const sorted = [...values].filter((v) => v > 0 && Number.isFinite(v)).sort((a, b) => a - b);
	const out: number[] = [];
	for (const v of sorted) if (!out.length || v - out[out.length - 1] > 1e-9 * v) out.push(v);
	return out;
}

/** Each value, a value between each pair, and a value below and above all of them. */
function spread(values: number[]): number[] {
	if (!values.length) return [100];
	const out = [values[0] / 2];
	values.forEach((v, i) =>
		out.push(v, i + 1 < values.length ? (v + values[i + 1]) / 2 : v * 1.5 + 1)
	);
	return out;
}

/**
 * Container sizes where each combination of the conditions can be tested. The edges of all
 * conditions are lines: a width, a height, or a ratio through the origin. The points include one
 * point in each region, on each edge, and at each corner. Every condition gives the same result
 * everywhere in a region, so these points are sufficient to compare conditions exactly.
 *
 * `extra` adds more widths and heights, for example the current size of a container.
 */
export function samplePoints(
	conditions: (Condition | undefined)[],
	extra: { w?: number[]; h?: number[] } = {}
): [number, number][] {
	const widths = new Set(extra.w ?? []);
	const heights = new Set(extra.h ?? []);
	const ratios = new Map<string, RatioValue>();
	for (const condition of conditions)
		for (const c of condition ?? []) {
			for (const v of [c.w?.min, c.w?.max]) if (v !== undefined) widths.add(v);
			for (const v of [c.h?.min, c.h?.max]) if (v !== undefined) heights.add(v);
			for (const r of [c.ratio?.min, c.ratio?.max]) if (r) ratios.set(ratioText(r), r);
			if (c.orientation) ratios.set('1/1', [1, 1]);
		}
	// A ratio line crosses each height line at one width.
	for (const [p, q] of ratios.values()) for (const h of heights) widths.add((p * h) / q);

	const points: [number, number][] = [];
	for (const w of spread(distinct(widths))) {
		const ys = new Set(heights);
		for (const [p, q] of ratios.values()) ys.add((w * q) / p);
		for (const h of spread(distinct(ys))) points.push([w, h]);
	}
	return points;
}
