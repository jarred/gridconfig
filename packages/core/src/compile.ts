import { STEP_PROPERTY, attributes } from './attributes.ts';
import { DEBUG_PROPERTY } from './debug.ts';
import { LayoutError } from './errors.ts';
import { inLayer, resolveLayer } from './layer.ts';
import { parseLayout } from './parse.ts';
import type { CompileOptions, CompiledLayout, DebugInfo, Layout, Step, Warning } from './types.ts';
import { splitTerms } from './values.ts';

export { baseCss, baseCssFor } from './base.ts';

export { DEBUG_PROPERTY } from './debug.ts';

type Path = (string | number)[];
type Axis = 'cols' | 'rows';

/** What a step writes to the grid element. Nothing is inherited: the cascade does that. */
type Emitted = { cols?: string; rows?: string; areas?: string[][]; gap?: string; padding?: string };

/** Track count of a track list, or null when it can't be known statically (e.g. auto-fill). */
function countTracks(list: string): number | null {
	let n = 0;
	for (const token of splitTerms(list)) {
		const rep = /^repeat\(\s*(\d+)\s*,\s*(.+)\)$/s.exec(token);
		if (rep) {
			const inner = countTracks(rep[2]);
			if (inner === null) return null;
			n += Number(rep[1]) * inner;
		} else if (token.startsWith('repeat(')) return null;
		else if (!token.startsWith('[')) n++;
	}
	return n;
}

function infer(areas: string[][], axis: Axis) {
	return `repeat(${axis === 'cols' ? areas[0].length : areas.length}, 1fr)`;
}

function conditions(step: Step): string[] {
	const p: string[] = [];
	if (step.minWidth !== undefined) p.push(`(min-width: ${step.minWidth}px)`);
	if (step.minHeight !== undefined) p.push(`(min-height: ${step.minHeight}px)`);
	return p;
}

function negated(step: Step): string {
	const p = conditions(step);
	return `(not ${p.length > 1 ? `(${p.join(' and ')})` : p[0]})`;
}

function block(selector: string, body: string[], indent = ''): string {
	return `${indent}${selector} {\n${body.map((l) => `${indent}  ${l}`).join('\n')}\n${indent}}`;
}

function declarations(e: Emitted, step: Step): string[] {
	const d: string[] = [];
	if (e.gap !== undefined) d.push(`--gap: ${e.gap};`);
	if (e.padding !== undefined) d.push(`--padding: ${e.padding};`);
	if (e.cols) d.push(`grid-template-columns: ${e.cols};`);
	if (e.rows) d.push(`grid-template-rows: ${e.rows};`);
	if (e.areas)
		d.push(`grid-template-areas: ${e.areas.map((row) => `'${row.join(' ')}'`).join(' ')};`);
	if (step.css) d.push(step.css.endsWith(';') ? step.css : `${step.css};`);
	// Every step sets it, so the cascade gives the active step: the last step that matches.
	d.push(`${STEP_PROPERTY}: ${step.key ?? 'base'};`);
	return d;
}

/**
 * Steps are patches on the base and the browser's cascade picks the winner per property, so any
 * step can be active together with any others. All conditions are minimums, so everything that
 * matches at a size also matches at every larger size: checking "who wins" at the smallest size
 * where a set of steps all match is enough.
 */
function validate(steps: Step[], emit: Emitted[], path: (i: number, key: string) => Path) {
	const areaSteps = steps.flatMap((s, i) => (s.areas ? [i] : []));
	const matchesAt = (j: number, w: number, h: number) =>
		(steps[j].minWidth ?? 0) <= w && (steps[j].minHeight ?? 0) <= h;
	const label = (i: number) => (i === 0 ? 'the base step' : `"${steps[i].key}"`);

	for (const axis of ['cols', 'rows'] as const) {
		const writers = emit.flatMap((e, i) => (e[axis] ? [i] : []));
		steps.forEach((step, c) => {
			const list = step[axis];
			if (list === undefined) return;
			const actual = countTracks(list);
			if (actual === null) return;

			for (const k of areaSteps) {
				if (k !== c) {
					const w = Math.max(steps[c].minWidth ?? 0, steps[k].minWidth ?? 0);
					const h = Math.max(steps[c].minHeight ?? 0, steps[k].minHeight ?? 0);
					const tracksSurvive = !writers.some((j) => j > c && matchesAt(j, w, h));
					const mapSurvives = !areaSteps.some((j) => j > k && matchesAt(j, w, h));
					if (!tracksSurvive || !mapSurvives) continue;
				}
				const areas = steps[k].areas!;
				const expected = axis === 'cols' ? areas[0].length : areas.length;
				if (actual !== expected)
					throw new LayoutError(
						k === c
							? `${axis} defines ${actual} tracks but the area map has ${expected}`
							: `${axis} defines ${actual} tracks but the area map from ${label(k)} can be active at the same time and has ${expected}`,
						path(c, axis)
					);
			}
		});
	}
}

function build(layout: Layout, options: CompileOptions): CompiledLayout {
	const { name, steps } = layout;
	const layer = resolveLayer(options.layer);
	const sel = `[${attributes.layout}="${name}"]`;
	const path = (i: number, key: string): Path => (i === 0 ? [key] : [steps[i].key!, key]);

	const emit: Emitted[] = steps.map((s, i) => ({
		areas: s.areas,
		cols: s.cols ?? (s.areas ? infer(s.areas, 'cols') : undefined),
		rows: s.rows ?? (s.areas ? infer(s.areas, 'rows') : undefined),
		// The base resets both so a nested layout never picks up its parent's values.
		gap: s.gap ?? (i === 0 ? '0' : undefined),
		padding: s.padding ?? (i === 0 ? '0' : undefined)
	}));

	validate(steps, emit, path);

	const names = new Set(emit.flatMap((e) => e.areas?.flat() ?? []));
	names.delete('.');

	const hostRule = (debug?: DebugInfo) => {
		// JSON.stringify twice: the result is a JSON string, which is also a valid CSS string.
		const data = debug ? ` ${DEBUG_PROPERTY}: ${JSON.stringify(JSON.stringify(debug))};` : '';
		return `[${attributes.host}="${name}"] { container: ${name} / ${layout.container};${data} }`;
	};
	const css: string[] = [
		hostRule(),
		block(sel, declarations(emit[0], steps[0])),
		...[...names].map((n) => `${sel} > [${attributes.area}="${n}"] { grid-area: ${n}; }`)
	];

	steps.forEach((step, i) => {
		if (i === 0) return;
		const body = declarations(emit[i], step);
		if (body.length)
			css.push(
				`@container ${name} ${conditions(step).join(' and ')} {\n${block(sel, body, '  ')}\n}`
			);
	});

	// A step that sets `areas` hides every name its map lacks, for as long as it is the active
	// map. A later `display: none` can't be undone, so the range is exclusive: this step matches
	// and no later `areas` step does.
	// These rules never go in a layer: `!important` reverses the order of layers, and an unlayered
	// `!important` rule beats every normal rule, layered or not.
	const hide: string[] = [];
	steps.forEach((step, i) => {
		if (!step.areas) return;
		const present = new Set(step.areas.flat());
		const absent = [...names].filter((n) => !present.has(n));
		if (!absent.length) return;

		const later = steps.slice(i + 1).filter((s) => s.areas);
		const when = [...conditions(step), ...later.map(negated)];
		const target =
			absent.length === 1
				? `[${attributes.area}="${absent[0]}"]`
				: `:is(${absent.map((n) => `[${attributes.area}="${n}"]`).join(', ')})`;
		const rule = `${sel} > ${target} { display: none !important; }`;
		hide.push(when.length ? `@container ${name} ${when.join(' and ')} {\n  ${rule}\n}` : rule);
	});

	const warnings: Warning[] = [];
	if (layout.container === 'inline-size')
		steps.forEach((step, i) => {
			for (const key of ['cols', 'rows', 'gap', 'padding', 'css'] as const) {
				const value = step[key];
				if (value && /\d(?:cqh|cqb|cqmin|cqmax)\b/.test(value))
					warnings.push({
						message: `"${key}" uses a block-axis container unit, but \`container\` is "inline-size"; it falls back to viewport units`,
						path: path(i, key)
					});
			}
		});

	const debug: DebugInfo | undefined = options.debug
		? {
				v: 1,
				name,
				container: layout.container,
				areas: [...names],
				steps: steps.map((s, i) => ({
					key: s.key ?? null,
					...(s.minWidth !== undefined && { minWidth: s.minWidth }),
					...(s.minHeight !== undefined && { minHeight: s.minHeight }),
					...(emit[i].cols && { cols: emit[i].cols }),
					...(emit[i].rows && { rows: emit[i].rows }),
					...(emit[i].gap !== undefined && { gap: emit[i].gap }),
					...(emit[i].padding !== undefined && { padding: emit[i].padding }),
					...(emit[i].areas && { areas: emit[i].areas })
				})),
				warnings: warnings.map((w) => w.message)
			}
		: undefined;
	css[0] = hostRule(debug);

	const rules = [inLayer(layer, css.join('\n')), ...hide];
	return {
		name,
		css: rules.join('\n'),
		layer,
		areas: [...names],
		warnings,
		...(debug && { debug })
	};
}

export function compileLayout(
	source: string | Layout,
	options: CompileOptions = {}
): CompiledLayout {
	const layout = typeof source === 'string' ? parseLayout(source, options) : source;
	try {
		return build(layout, options);
	} catch (e) {
		if (e instanceof LayoutError && !e.range && layout.locate) e.range = layout.locate(e.path);
		throw e;
	}
}
