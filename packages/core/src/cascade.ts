// The order of the steps and the checks of the cascade. A step is a region of container sizes.
// The checks test each region at sample points, so they work for every kind of query.
import { LayoutError } from './errors.ts';
import { matches, samplePoints } from './query.ts';
import type { Step } from './types.ts';

export const stepLabel = (s: Step) => (s.key === undefined ? 'the base step' : `"${s.key}"`);

/** Writes a size for a message: `600 × 400`. */
export const sizeText = ([w, h]: [number, number]) =>
	`${Math.round(w * 100) / 100} × ${Math.round(h * 100) / 100}`;

type Plane = {
	points: [number, number][];
	/** `hits[step][point]`: the step matches at the point. */
	hits: boolean[][];
	/** True when each size that matches step `a` also matches step `b`. */
	inside: (a: number, b: number) => boolean;
};

function plane(steps: Step[]): Plane {
	const points = samplePoints(steps.map((s) => s.when));
	const hits = steps.map((s) => points.map(([w, h]) => matches(s.when, w, h)));
	const memo = new Map<string, boolean>();
	const inside = (a: number, b: number) => {
		const id = `${a},${b}`;
		let v = memo.get(id);
		if (v === undefined) {
			v = hits[a].every((hit, i) => !hit || hits[b][i]);
			memo.set(id, v);
		}
		return v;
	};
	return { points, hits, inside };
}

const lowest = (s: Step, dim: 'w' | 'h') =>
	s.when ? Math.min(...s.when.map((c) => c[dim]?.min ?? 0)) : -1;

/**
 * Puts the steps in cascade order. A step comes after each step that contains it, so the more
 * specific step wins. The order of other steps follows the smallest width, then the smallest
 * height, then the source order. The base step contains all steps, so it is first.
 *
 * `steps` is the base step, then the query steps in source order.
 */
export function orderSteps(steps: Step[]): Step[] {
	const { hits, inside } = plane(steps);
	const n = steps.length;

	for (let a = 1; a < n; a++) {
		if (!hits[a].some(Boolean))
			throw new LayoutError(`${stepLabel(steps[a])} matches no container size`, [steps[a].key!]);
		for (let b = 0; b < a; b++)
			if (inside(a, b) && inside(b, a))
				throw new LayoutError(
					b === 0
						? `${stepLabel(steps[a])} matches every container size. Put its settings at the top level`
						: `${stepLabel(steps[a])} duplicates ${stepLabel(steps[b])}: both match the same container sizes`,
					[steps[a].key!]
				);
	}

	const before = steps.map((_, a) => steps.map((_, b) => b !== a && inside(a, b)));
	const rank = (i: number) => [lowest(steps[i], 'w'), lowest(steps[i], 'h'), i];
	const earlier = (i: number, j: number) => {
		const [x, y] = [rank(i), rank(j)];
		return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
	};

	const placed: number[] = [];
	const done = new Set<number>();
	while (placed.length < n) {
		const ready = steps
			.map((_, i) => i)
			.filter((i) => !done.has(i) && before[i].every((b, j) => !b || done.has(j)))
			.sort(earlier);
		placed.push(ready[0]);
		done.add(ready[0]);
	}
	return placed.map((i) => steps[i]);
}

export type Conflict = {
	prop: string;
	/** The earlier step in the order. */
	a: number;
	/** The later step: it wins at `at`, but it is not inside `a`. */
	b: number;
	/** The first size where both match. */
	at: [number, number];
};

export type CascadeReport = {
	points: [number, number][];
	/** For each point, the step that wins each property there. */
	winners: Map<string, number>[];
	/** Two steps that both set a property at the same size, and neither contains the other. */
	conflicts: Conflict[];
	/** Steps that win nothing at any size, also not the active step. */
	dead: number[];
};

/** The active step: every step writes it. */
export const ACTIVE = '--grid-breakpoint';

/**
 * Tests the cascade. `steps` are in cascade order. `props[i]` are the properties that step `i`
 * writes. At each size, the last matching step that writes a property wins it. That step must be
 * inside each other matching step that writes the property. If it is not, the result depends on
 * the order of two unrelated steps, and that is a conflict.
 */
export function analyseCascade(steps: Step[], props: Set<string>[]): CascadeReport {
	const { points, hits, inside } = plane(steps);
	const names = new Set(props.flatMap((p) => [...p]));
	const conflicts: Conflict[] = [];
	const found = new Set<string>();
	const effective = steps.map((_, i) => i === 0);

	const winners = points.map((at, pi) => {
		const matching = steps.map((_, i) => i).filter((i) => hits[i][pi]);
		const out = new Map<string, number>();
		out.set(ACTIVE, matching[matching.length - 1]);
		effective[matching[matching.length - 1]] = true;
		for (const prop of names) {
			const writers = matching.filter((i) => props[i].has(prop));
			if (!writers.length) continue;
			const win = writers[writers.length - 1];
			out.set(prop, win);
			effective[win] = true;
			for (const other of writers.slice(0, -1)) {
				if (inside(win, other)) continue;
				const id = `${prop}|${other}|${win}`;
				if (found.has(id)) continue;
				found.add(id);
				conflicts.push({ prop, a: other, b: win, at });
			}
		}
		return out;
	});

	const dead = effective.flatMap((e, i) => (e ? [] : [i]));
	return { points, winners, conflicts, dead };
}
