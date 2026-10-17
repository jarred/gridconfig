import { LineCounter, isMap, isScalar, parseDocument, visit } from 'yaml';
import { LayoutError } from './errors.ts';
import type { Range } from './errors.ts';
import { parseLayoutObject } from './model.ts';
import type { CompileOptions, Layout, LayoutInput } from './types.ts';

type Path = (string | number)[];

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

/**
 * Prepares source text for the YAML parser. A layout inside a template literal is indented with
 * the code around it, and YAML cares about indentation, so this removes the indentation that all
 * lines share. YAML does not allow tabs as indentation, so each leading tab counts as two spaces.
 * Line numbers do not change.
 */
export function dedent(source: string): string {
	const lines = source
		.split('\n')
		.map((line) => line.replace(/^[ \t]+/, (lead) => lead.replace(/\t/g, '  ')));
	let min = Infinity;
	for (const line of lines) {
		if (!line.trim()) continue;
		min = Math.min(min, /^[ \t]*/.exec(line)![0].length);
	}
	if (!Number.isFinite(min) || min === 0) return lines.join('\n');
	return lines.map((line) => (line.trim() ? line.slice(min) : line.trimEnd())).join('\n');
}

export function parseLayout(source: string, options: CompileOptions = {}): Layout {
	const lines = new LineCounter();
	const doc = parseDocument(dedent(source), { lineCounter: lines });
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
		// A layout is untyped data. Tags (`!!str`, `!custom`) would make it depend on the YAML library.
		visit(doc, {
			Node(_key, node) {
				if (!node.tag) return;
				const r = node.range;
				const at = (offset: number) => lines.linePos(offset);
				throw new LayoutError(
					`Tags are not supported ("${node.tag}")`,
					[],
					r ? { start: at(r[0]), end: at(r[1]) } : undefined
				);
			}
		});
		return parseLayoutObject(doc.toJS() as LayoutInput, options, locate);
	} catch (e) {
		if (e instanceof LayoutError && !e.range) e.range = locate(e.path);
		throw e;
	}
}
