import { BREAKPOINT_PROPERTY, attributes } from './attributes.ts';
import { DEBUG_PROPERTY } from './debug.ts';
import { LayoutError } from './errors.ts';
import { flowDeclarations } from './flow.ts';
import { inLayer, resolveLayer } from './layer.ts';
import { parseLayout } from './parse.ts';
import type { CompileOptions, CompiledLayout, DebugInfo, Layout, Step, Warning } from './types.ts';
import { analyseCascade, sizeText, stepLabel } from './cascade.ts';
import { conditionCss, conditionInParens, conditionKey, intersect, limitBefore } from './query.ts';
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

function negated(step: Step): string {
	return `(not ${conditionInParens(step.when!)})`;
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
	d.push(`${BREAKPOINT_PROPERTY}: ${step.key ?? 'base'};`);
	return d;
}

/** The properties that a step writes, with the path of the setting to blame in a message. */
function writes(step: Step, e: Emitted, at: (key: string) => Path): Map<string, Path> {
	const out = new Map<string, Path>();
	if (e.areas) out.set('areas', at('areas'));
	for (const axis of ['cols', 'rows'] as const)
		if (e[axis]) out.set(axis, at(step[axis] !== undefined ? axis : 'areas'));
	if (e.gap !== undefined) out.set('gap', at('gap'));
	if (e.padding !== undefined) out.set('padding', at('padding'));
	for (const area of Object.keys(step.flow ?? {})) out.set(`flow.${area}`, [...at('flow'), area]);
	if (step.css) out.set('css', at('css'));
	return out;
}

function describe(prop: string, steps: Step[]): string {
	if (prop === 'cols' || prop === 'rows') {
		const name = prop === 'cols' ? 'the columns' : 'the rows';
		// A step with `areas` also writes the tracks that it does not set.
		return steps.some((s) => s[prop] === undefined) ? `${name} (\`areas\` sets them too)` : name;
	}
	if (prop.startsWith('flow.')) return `the flow of ${prop.slice(5)}`;
	return `\`${prop}\``;
}

/**
 * Checks the cascade at every size. Each property at each size must have one clear winner: the
 * matching step that is inside every other matching step that writes the property. Then the
 * track counts must agree with the active area map.
 */
function validate(
	steps: Step[],
	emit: Emitted[],
	path: (i: number, key: string) => Path,
	warnings: Warning[]
) {
	const props = steps.map((s, i) => writes(s, emit[i], (key) => path(i, key)));
	const report = analyseCascade(
		steps,
		props.map((p) => new Set(p.keys()))
	);

	for (const c of report.conflicts) {
		const [a, b] = [steps[c.a], steps[c.b]];
		const overlap = intersect(a.when!, b.when!);
		const fix = overlap ? ` ("${conditionKey(overlap)}")` : '';
		const limited = limitBefore(a.when!, b.when!) ?? limitBefore(b.when!, a.when!);
		const limit = limited
			? ` (for example "${conditionKey(limited)}" in place of ${limitBefore(a.when!, b.when!) ? stepLabel(a) : stepLabel(b)})`
			: '';
		const message = `${stepLabel(a)} and ${stepLabel(b)} both set ${describe(c.prop, [a, b])}, and both match at ${sizeText(c.at)}. Add a step for the sizes where both match${fix}, or change one of them so that they do not overlap${limit}`;
		// `css` is not parsed, so the compiler cannot know if the two values set the same property.
		if (c.prop === 'css') warnings.push({ message, path: props[c.b].get('css')! });
		else throw new LayoutError(message, props[c.b].get(c.prop)!);
	}

	for (const axis of ['cols', 'rows'] as const) {
		const found = new Set<string>();
		report.winners.forEach((w, pi) => {
			const t = w.get(axis);
			const m = w.get('areas');
			if (t === undefined || m === undefined || found.has(`${t},${m}`)) return;
			found.add(`${t},${m}`);
			const list = emit[t][axis]!;
			const actual = countTracks(list);
			const areas = steps[m].areas!;
			const expected = axis === 'cols' ? areas[0].length : areas.length;
			if (actual === null || actual === expected) return;
			throw new LayoutError(
				t === m
					? `${axis} defines ${actual} tracks but the area map has ${expected}`
					: `${axis} defines ${actual} tracks but the area map from ${stepLabel(steps[m])} is active with it at ${sizeText(report.points[pi])} and has ${expected}`,
				path(t, axis)
			);
		});
	}

	for (const i of report.dead)
		warnings.push({
			message: `${stepLabel(steps[i])} has no effect: at each size where it matches, other steps set everything that it sets`,
			path: [steps[i].key!]
		});
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

	const warnings: Warning[] = [];
	validate(steps, emit, path, warnings);

	const names = new Set(emit.flatMap((e) => e.areas?.flat() ?? []));
	names.delete('.');

	steps.forEach((step, i) => {
		for (const area of Object.keys(step.flow ?? {}))
			if (!names.has(area))
				throw new LayoutError(`flow names "${area}", but no area map has an area with that name`, [
					...path(i, 'flow'),
					area
				]);
	});

	// A step that sets an entry writes all of its properties: more than one step can match at the
	// same time, so an entry must win in full or not at all.
	const flowRules = (step: Step, indent = '') =>
		Object.entries(step.flow ?? {}).map(([area, entry]) =>
			block(`${sel} > [${attributes.area}="${area}"]`, flowDeclarations(entry), indent)
		);

	const hostRule = (debug?: DebugInfo) => {
		// JSON.stringify twice: the result is a JSON string, which is also a valid CSS string.
		const data = debug ? ` ${DEBUG_PROPERTY}: ${JSON.stringify(JSON.stringify(debug))};` : '';
		return `[${attributes.host}="${name}"] { container: ${name} / ${layout.container};${data} }`;
	};
	const css: string[] = [
		hostRule(),
		block(sel, declarations(emit[0], steps[0])),
		...[...names].map((n) => `${sel} > [${attributes.area}="${n}"] { grid-area: ${n}; }`),
		...flowRules(steps[0])
	];

	steps.forEach((step, i) => {
		if (i === 0) return;
		const body = declarations(emit[i], step);
		const rules = [block(sel, body, '  '), ...flowRules(step, '  ')];
		css.push(`@container ${name} ${conditionCss(step.when!)} {\n${rules.join('\n')}\n}`);
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
		// A step with one clause is a list of parts joined by `and`, so it needs no extra ().
		const own = !step.when
			? []
			: [step.when.length === 1 ? conditionCss(step.when) : conditionInParens(step.when)];
		const when = [...own, ...later.map(negated)];
		const target =
			absent.length === 1
				? `[${attributes.area}="${absent[0]}"]`
				: `:is(${absent.map((n) => `[${attributes.area}="${n}"]`).join(', ')})`;
		const rule = `${sel} > ${target} { display: none !important; }`;
		hide.push(when.length ? `@container ${name} ${when.join(' and ')} {\n  ${rule}\n}` : rule);
	});

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
				v: 2,
				name,
				container: layout.container,
				areas: [...names],
				steps: steps.map((s, i) => ({
					key: s.key ?? null,
					...(s.when && { when: s.when }),
					...(emit[i].cols && { cols: emit[i].cols }),
					...(emit[i].rows && { rows: emit[i].rows }),
					...(emit[i].gap !== undefined && { gap: emit[i].gap }),
					...(emit[i].padding !== undefined && { padding: emit[i].padding }),
					...(emit[i].areas && { areas: emit[i].areas }),
					...(s.flow && { flow: s.flow })
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
