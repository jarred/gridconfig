// The logic of the inspector that needs no DOM. The DOM code in inspector.ts calls it.
import type { DebugInfo, DebugStep } from '@gridconfig/core';

export type Resolved = {
	/** The index of the active step: the last step that matches the size. 0 is the base step. */
	step: number;
	cols?: string;
	rows?: string;
	gap?: string;
	padding?: string;
	areas?: string[][];
};

const matches = (s: DebugStep, w: number, h: number) =>
	(s.minWidth ?? 0) <= w && (s.minHeight ?? 0) <= h;

/** The values that apply at a container size. This is what the browser cascade does: the last matching step that sets a property wins. */
export function resolve(info: DebugInfo, w: number, h: number): Resolved {
	const out: Resolved = { step: 0 };
	info.steps.forEach((s, i) => {
		if (i > 0 && !matches(s, w, h)) return;
		out.step = i;
		for (const k of ['cols', 'rows', 'gap', 'padding', 'areas'] as const)
			if (s[k] !== undefined) (out as Record<string, unknown>)[k] = s[k];
	});
	return out;
}

/** The label of a step: its query key, or "base". */
export const stepLabel = (s: DebugStep) => s.key ?? 'base';

/**
 * The size to give a container so that a step is the active one, as far as that is possible. An
 * axis the step does not set stays as it is. For the base step, each axis goes below the smallest
 * minimum of any step.
 */
export function sizeForStep(
	info: DebugInfo,
	index: number,
	current: { w: number; h: number }
): { w: number; h: number } {
	const step = info.steps[index];
	if (index > 0) return { w: step.minWidth ?? current.w, h: step.minHeight ?? current.h };
	const below = (axis: 'minWidth' | 'minHeight', now: number) => {
		const mins = info.steps.map((s) => s[axis]).filter((n): n is number => n !== undefined);
		return mins.length ? Math.max(1, Math.min(...mins) - 1) : now;
	};
	return { w: below('minWidth', current.w), h: below('minHeight', current.h) };
}

/** The sizes where a step starts, for snapping a drag. */
export function thresholds(info: DebugInfo): { w: number[]; h: number[] } {
	const w = new Set<number>();
	const h = new Set<number>();
	for (const s of info.steps) {
		if (s.minWidth !== undefined) w.add(s.minWidth);
		if (s.minHeight !== undefined) h.add(s.minHeight);
	}
	return { w: [...w].sort((a, b) => a - b), h: [...h].sort((a, b) => a - b) };
}

/** The value in `list` that is nearest to `value`, if it is within `distance`. */
export function snap(value: number, list: number[], distance: number): number {
	let best = value;
	let bestDistance = distance + 1;
	for (const t of list) {
		const d = Math.abs(t - value);
		if (d <= distance && d < bestDistance) {
			best = t;
			bestDistance = d;
		}
	}
	return best;
}

/** Splits at spaces that are not inside () or []. */
export function splitTop(list: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let current = '';
	for (const ch of list.trim()) {
		if (ch === '(' || ch === '[') depth++;
		else if (ch === ')' || ch === ']') depth--;
		if (/\s/.test(ch) && depth === 0) {
			if (current) out.push(current);
			current = '';
		} else current += ch;
	}
	if (current) out.push(current);
	return out;
}

/** One term for each track of an authored track list, or null when the count is not known (auto-fill). Line names are dropped. */
export function expandTracks(list: string): string[] | null {
	const out: string[] = [];
	for (const term of splitTop(list)) {
		if (term.startsWith('[')) continue;
		const rep = /^repeat\(\s*(\d+)\s*,\s*([\s\S]+)\)$/.exec(term);
		if (rep) {
			const inner = expandTracks(rep[2]);
			if (!inner) return null;
			for (let i = 0; i < Number(rep[1]); i++) out.push(...inner);
		} else if (term.startsWith('repeat(')) return null;
		else out.push(term);
	}
	return out;
}

/** The sizes in px of a computed track list such as "[a] 100px 50.5px". */
export function parseTrackSizes(computed: string): number[] {
	const list = computed.replace(/\[[^\]]*\]/g, ' ').trim();
	if (!list || list === 'none') return [];
	return list.split(/\s+/).map((t) => parseFloat(t));
}

/** The area map of a computed `grid-template-areas`, such as `"A A" "B B"`. Null when there is none. */
export function parseAreas(computed: string): string[][] | null {
	const rows = [...computed.matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) =>
		(m[1] ?? m[2]).trim().split(/\s+/)
	);
	return rows.length ? rows : null;
}

export type AreaBox = { name: string; row: number; col: number; rows: number; cols: number };

/** The first and last row and column of each named area. `.` is not an area. */
export function areaBoxes(map: string[][]): AreaBox[] {
	const boxes = new Map<string, { r0: number; r1: number; c0: number; c1: number }>();
	map.forEach((row, r) =>
		row.forEach((name, c) => {
			if (name === '.') return;
			const b = boxes.get(name);
			if (!b) boxes.set(name, { r0: r, r1: r, c0: c, c1: c });
			else {
				b.r0 = Math.min(b.r0, r);
				b.r1 = Math.max(b.r1, r);
				b.c0 = Math.min(b.c0, c);
				b.c1 = Math.max(b.c1, c);
			}
		})
	);
	return [...boxes].map(([name, b]) => ({
		name,
		row: b.r0,
		col: b.c0,
		rows: b.r1 - b.r0 + 1,
		cols: b.c1 - b.c0 + 1
	}));
}

/** The start of each track, from the start of the content box. */
export function trackStarts(sizes: number[], gap: number): number[] {
	const out: number[] = [];
	let at = 0;
	for (const s of sizes) {
		out.push(at);
		at += s + gap;
	}
	return out;
}

/** Reads the value of the `--gc-debug` custom property: a CSS string that holds JSON. */
export function parseDebug(raw: string, hostName: string): DebugInfo | null {
	const text = raw.trim();
	if (!text.startsWith('"')) return null;
	try {
		const info = JSON.parse(JSON.parse(text)) as DebugInfo;
		// A nested host inherits the custom property of its parent when it has none of its own.
		return info.v === 1 && info.name === hostName ? info : null;
	} catch {
		return null;
	}
}

export type Finding = { level: 'error' | 'warning' | 'info'; message: string };

export type DomFacts = {
	hostSize: { w: number; h: number };
	hasGrid: boolean;
	/** The `data-grid-area` of each direct child of the grid. Null when the child has none. */
	children: { label: string; area: string | null }[];
	/** The area names of the layout, when known. */
	known: string[] | null;
	/** The names in the area map that is active now. */
	mapped: string[];
	container: 'size' | 'inline-size' | null;
	warnings: string[];
};

/** Problems with the way the page uses the layout. */
export function diagnose(f: DomFacts): Finding[] {
	const out: Finding[] = [];
	if (!f.hasGrid) {
		out.push({
			level: 'error',
			message: 'No element with data-grid-layout is a direct child of the host.'
		});
		return out;
	}
	if (f.container !== 'inline-size' && f.hostSize.h === 0)
		out.push({
			level: 'error',
			message: 'The host has no height. Its parent needs a definite height.'
		});
	if (f.hostSize.w === 0)
		out.push({ level: 'error', message: 'The host has no width. Its parent needs a width.' });

	const known = new Set(f.known ?? f.mapped);
	const used = new Set<string>();
	for (const c of f.children) {
		if (c.area === null)
			out.push({
				level: 'warning',
				message: `${c.label} has no data-grid-area, so the layout does not place it.`
			});
		else {
			used.add(c.area);
			if (!known.has(c.area))
				out.push({
					level: 'warning',
					message: `Area "${c.area}" is not in the layout. Check the name.`
				});
		}
	}
	for (const name of f.mapped)
		if (!used.has(name)) out.push({ level: 'info', message: `No element uses area "${name}".` });
	for (const w of f.warnings) out.push({ level: 'warning', message: w });
	return out;
}
