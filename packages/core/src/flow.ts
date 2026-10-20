import { LayoutError } from './errors.ts';
import type { CompileOptions, Flow, FlowEntry } from './types.ts';
import { OPERATORS, compileValue, convertTerm, splitTerms } from './values.ts';

type Path = (string | number)[];

const DIRECTIONS = ['row', 'column'] as const;
const MAIN = ['start', 'center', 'end', 'between', 'around', 'evenly'] as const;
const CROSS = ['start', 'center', 'end', 'stretch', 'baseline'] as const;
const OBJECT_KEYS = new Set(['direction', 'main', 'cross', 'gap', 'wrap']);

const CSS_VALUE: Record<string, string> = {
	start: 'flex-start',
	end: 'flex-end',
	between: 'space-between',
	around: 'space-around',
	evenly: 'space-evenly'
};

/** The properties a flow entry writes. A step that sets an entry writes all of them. */
export const FLOW_PROPERTIES = [
	'display',
	'flex-direction',
	'justify-content',
	'align-items',
	'gap',
	'flex-wrap'
] as const;

const isDirection = (w: string): w is Flow['direction'] =>
	(DIRECTIONS as readonly string[]).includes(w);
const isMain = (w: string): w is Flow['main'] => (MAIN as readonly string[]).includes(w);
const isCross = (w: string): w is Flow['cross'] => (CROSS as readonly string[]).includes(w);
const list = (words: readonly string[]) => words.map((w) => `"${w}"`).join(', ');

function defaults(): Flow {
	return { direction: 'row', main: 'start', cross: 'stretch', wrap: false };
}

/** `[direction] [main] [cross] [gap <term>] [wrap]`, or `none`. */
function parseString(source: string, options: CompileOptions, path: Path): Flow {
	const words = splitTerms(source, path);
	const flow = defaults();
	const fail = (message: string): never => {
		throw new LayoutError(`${message} in flow "${source}"`, path);
	};

	let i = 0;
	if (i < words.length && isDirection(words[i])) flow.direction = words[i++] as Flow['direction'];

	// Up to two alignment words: main, then cross. They stop at the first word that is not one.
	const alignments: string[] = [];
	while (i < words.length && words[i] !== 'gap' && words[i] !== 'wrap') {
		const w = words[i];
		if (isDirection(w)) fail(`The direction "${w}" must be the first word`);
		if (alignments.length === 0) {
			if (!isMain(w))
				fail(
					isCross(w)
						? `"${w}" is not a main word (expected ${list(MAIN)}); write the main word first`
						: `Unknown word "${w}" (expected ${list(MAIN)})`
				);
			flow.main = w as Flow['main'];
		} else if (alignments.length === 1) {
			if (!isCross(w)) fail(`"${w}" is not a cross word (expected ${list(CROSS)})`);
			flow.cross = w as Flow['cross'];
		} else fail(`Unexpected word "${w}": a flow has one main word and one cross word`);
		alignments.push(w);
		i++;
	}

	let seenGap = false;
	while (i < words.length) {
		const w = words[i++];
		if (w === 'wrap') {
			if (flow.wrap) fail('"wrap" is written twice');
			flow.wrap = true;
		} else if (w === 'gap') {
			if (seenGap) fail('"gap" is written twice');
			seenGap = true;
			const term = words[i++];
			if (term === undefined || term === 'wrap') fail('"gap" needs a value');
			if (OPERATORS.has(term))
				fail(`"gap" takes one term; for an expression use calc() or the flow object`);
			const next = words[i];
			if (next !== undefined && next !== 'wrap' && next !== 'gap')
				fail(
					OPERATORS.has(next)
						? `"gap" takes one term; for an expression use calc() or the flow object`
						: `"gap" takes one term; for a list use the flow object`
				);
			flow.gap = convertTerm(term, false, options, path);
		} else if (isDirection(w)) fail(`The direction "${w}" must be the first word`);
		else if (isMain(w) || isCross(w)) fail(`"${w}" must come before "gap" and "wrap"`);
		else fail(`Unknown word "${w}"`);
	}
	return flow;
}

function parseObject(raw: Record<string, unknown>, options: CompileOptions, path: Path): Flow {
	const flow = defaults();
	for (const [k, v] of Object.entries(raw)) {
		if (v === undefined) continue;
		const at = [...path, k];
		if (!OBJECT_KEYS.has(k))
			throw new LayoutError(`Unknown flow key "${k}" (expected ${list([...OBJECT_KEYS])})`, at);
		if (k === 'direction') {
			if (typeof v !== 'string' || !isDirection(v))
				throw new LayoutError(`"direction" must be ${list(DIRECTIONS)}`, at);
			flow.direction = v;
		} else if (k === 'main') {
			if (typeof v !== 'string' || !isMain(v))
				throw new LayoutError(`"main" must be ${list(MAIN)}`, at);
			flow.main = v;
		} else if (k === 'cross') {
			if (typeof v !== 'string' || !isCross(v))
				throw new LayoutError(`"cross" must be ${list(CROSS)}`, at);
			flow.cross = v;
		} else if (k === 'wrap') {
			if (typeof v !== 'boolean') throw new LayoutError('"wrap" must be true or false', at);
			flow.wrap = v;
		} else if (v !== null) flow.gap = compileValue(v, options, at);
	}
	return flow;
}

/** One entry of a `flow` map: a flow string, a flow object, or `none`. */
export function parseFlowEntry(value: unknown, options: CompileOptions, path: Path): FlowEntry {
	if (typeof value === 'string') {
		if (value.trim() === 'none') return 'none';
		return parseString(value, options, path);
	}
	if (value && typeof value === 'object' && !Array.isArray(value))
		return parseObject(value as Record<string, unknown>, options, path);
	throw new LayoutError('A flow entry must be a flow string, a flow object or "none"', path);
}

/** The `flow` setting: a map from an area name to an entry. */
export function parseFlow(
	value: unknown,
	options: CompileOptions,
	path: Path
): Record<string, FlowEntry> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new LayoutError('`flow` must be a map from an area name to a flow', path);
	const out: Record<string, FlowEntry> = {};
	for (const [area, entry] of Object.entries(value)) {
		if (entry === undefined) continue;
		out[area] = parseFlowEntry(entry, options, [...path, area]);
	}
	return out;
}

/** The declarations for one entry. `none` reverts every property to the layers before this one. */
export function flowDeclarations(entry: FlowEntry): string[] {
	if (entry === 'none') return FLOW_PROPERTIES.map((p) => `${p}: revert-layer;`);
	return [
		'display: flex;',
		`flex-direction: ${entry.direction};`,
		`justify-content: ${CSS_VALUE[entry.main] ?? entry.main};`,
		`align-items: ${CSS_VALUE[entry.cross] ?? entry.cross};`,
		`gap: ${entry.gap ?? 'normal'};`,
		`flex-wrap: ${entry.wrap ? 'wrap' : 'nowrap'};`
	];
}
