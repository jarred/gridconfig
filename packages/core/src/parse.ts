import { LineCounter, isMap, isScalar, parseDocument, visit } from 'yaml';
import { LayoutError } from './errors.ts';
import type { Range } from './errors.ts';
import { parseLayoutObject } from './model.ts';
import type { CompileOptions, Layout, LayoutInput } from './types.ts';

type Path = (string | number)[];

type Position = { line: number; col: number };

/**
 * Prepares source text for the YAML parser. A layout inside a template literal is indented with
 * the code around it, and YAML cares about indentation, so this removes the indentation that all
 * lines share. YAML does not allow tabs as indentation, so each leading tab counts as two spaces.
 * Line numbers do not change.
 *
 * `original` changes a position in the prepared text to the position in the source as it is
 * written, so that an error points at the correct column.
 */
function prepare(source: string): { text: string; original: (p: Position) => Position } {
	const written = source.split('\n');
	const leads = written.map((line) => /^[ \t]*/.exec(line)![0]);
	const lines = written.map(
		(line, i) => leads[i].replace(/\t/g, '  ') + line.slice(leads[i].length)
	);
	let min = Infinity;
	for (const line of lines) {
		if (!line.trim()) continue;
		min = Math.min(min, /^ */.exec(line)![0].length);
	}
	if (!Number.isFinite(min)) min = 0;
	const text = lines.map((line) => (line.trim() ? line.slice(min) : line.trimEnd())).join('\n');

	const original = ({ line, col }: Position): Position => {
		const lead = leads[line - 1];
		if (lead === undefined || !written[line - 1].trim()) return { line, col };
		// The index in the line with spaces for tabs, then in the line as it is written.
		let index = col - 1 + min;
		let at = 0;
		while (at < lead.length && index > 0) index -= lead[at++] === '\t' ? 2 : 1;
		return { line, col: at + Math.max(index, 0) + 1 };
	};
	return { text, original };
}

/** The text that the YAML parser gets: the source without the indentation that all lines share. */
export function dedent(source: string): string {
	return prepare(source).text;
}

function makeLocator(doc: ReturnType<typeof parseDocument>, pos: (offset: number) => Position) {
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
	const { text, original } = prepare(source);
	const doc = parseDocument(text, { lineCounter: lines });
	const pos = (offset: number) => {
		const { line, col } = lines.linePos(offset);
		return original({ line, col });
	};
	const locate = makeLocator(doc, pos);

	try {
		if (doc.errors.length) {
			const err = doc.errors[0];
			const [a, b] = err.linePos ?? [];
			const end = b ?? a;
			throw new LayoutError(
				err.message.split('\n')[0],
				[],
				a && end && { start: original(a), end: original(end) }
			);
		}
		// A layout is plain data. Tags (`!!str`, `!custom`) would make it depend on the YAML library.
		// Anchors and aliases make one value appear in two places, and a tool that writes a layout
		// file cannot keep them.
		visit(doc, {
			Alias(_key, node) {
				const r = node.range;
				throw new LayoutError(
					`Aliases are not supported ("*${node.source}"). Write the value again`,
					[],
					r ? { start: pos(r[0]), end: pos(r[1]) } : undefined
				);
			},
			Node(_key, node) {
				const what = node.tag
					? `Tags are not supported ("${node.tag}")`
					: node.anchor
						? `Anchors are not supported ("&${node.anchor}")`
						: null;
				if (!what) return;
				const r = node.range;
				throw new LayoutError(what, [], r ? { start: pos(r[0]), end: pos(r[1]) } : undefined);
			}
		});
		return parseLayoutObject(doc.toJS() as LayoutInput, options, locate);
	} catch (e) {
		if (e instanceof LayoutError && !e.range) e.range = locate(e.path);
		throw e;
	}
}
