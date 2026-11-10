/**
 * Finds `grid` calls with static arguments in source text, so that a plugin can compile them
 * at build time. The scanner works on raw text. Thus it also works inside .svelte, .vue and
 * .astro files, which are not valid JavaScript before the framework compiles them.
 *
 * A call that is not static (a variable, a spread, a function call) is not an error here.
 * The scanner skips it, and the call compiles when the code runs. The one exception is a
 * template with `${}`, which can never work, so the scanner reports it.
 *
 * The scanner does not read text in a comment or in a string. It also skips a file that gives
 * the name `grid` to a different variable or parameter, because it cannot know which calls use
 * the import. Those calls compile when the code runs.
 */

export type Call =
	| { kind: 'template'; start: number; end: number; source: string }
	| { kind: 'object'; start: number; end: number; value: unknown }
	| { kind: 'interpolation'; start: number; end: number };

class NotStatic extends Error {}

const WORD = /[A-Za-z_$][\w$]*/y;
const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

/** The local names of `grid` imported from `@gridconfig/core`. */
export function localNames(code: string): Set<string> {
	const names = new Set<string>();
	const imports = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]@gridconfig\/core['"]/g;
	for (const match of code.matchAll(imports)) {
		if (match[1]) continue;
		for (const part of match[2].split(',')) {
			const spec = part.trim();
			if (!spec || spec.startsWith('type ')) continue;
			const m = /^grid(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(spec);
			if (m) names.add(m[1] ?? 'grid');
		}
	}
	return names;
}

export type Import = {
	/** The module that the statement imports from, as it is written. */
	source: string;
	/** The index after the statement. */
	end: number;
	/** The imported names, and the local name of each. */
	names: { imported: string; local: string }[];
};

/** The named imports of values in the code. Type imports are not included. */
export function namedImports(code: string): Import[] {
	const out: Import[] = [];
	const imports = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*(['"])([^'"\n]+)\3;?/g;
	for (const match of code.matchAll(imports)) {
		if (match[1]) continue;
		const names: Import['names'] = [];
		for (const part of match[2].split(',')) {
			const spec = part.trim();
			if (!spec || spec.startsWith('type ')) continue;
			const m = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(spec);
			if (m) names.push({ imported: m[1], local: m[2] ?? m[1] });
		}
		out.push({ source: match[4], end: match.index + match[0].length, names });
	}
	return out;
}

export function lineOf(code: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index; i++) if (code.charCodeAt(i) === 10) line++;
	return line;
}

function skipSpace(src: string, i: number): number {
	for (;;) {
		while (i < src.length && /\s/.test(src[i])) i++;
		if (src.startsWith('//', i)) {
			while (i < src.length && src[i] !== '\n') i++;
		} else if (src.startsWith('/*', i)) {
			const end = src.indexOf('*/', i + 2);
			if (end < 0) throw new NotStatic();
			i = end + 2;
		} else return i;
	}
}

const ESCAPES: Record<string, string> = {
	n: '\n',
	t: '\t',
	r: '\r',
	b: '\b',
	f: '\f',
	v: '\v',
	'0': '\0'
};

/** Reads a quoted string or a template without `${}`. Returns the value and the next index. */
function readString(src: string, i: number): [string, number] {
	const quote = src[i];
	let out = '';
	for (i++; i < src.length; i++) {
		const c = src[i];
		if (c === quote) return [out, i + 1];
		if (quote === '`' && c === '$' && src[i + 1] === '{') throw new NotStatic();
		if (quote !== '`' && c === '\n') throw new NotStatic();
		if (c !== '\\') {
			out += c;
			continue;
		}
		const n = src[++i];
		if (n === 'u' || n === 'x') {
			const len = n === 'x' ? 2 : 4;
			const hex = src.slice(i + 1, i + 1 + len);
			if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(hex)) throw new NotStatic();
			out += String.fromCharCode(parseInt(hex, 16));
			i += len;
		} else if (n === '\n') {
			// A line continuation adds nothing.
		} else out += ESCAPES[n] ?? n;
	}
	throw new NotStatic();
}

function readKey(src: string, i: number): [string, number] {
	if (src[i] === '"' || src[i] === "'") return readString(src, i);
	NUMBER.lastIndex = i;
	const n = NUMBER.exec(src);
	if (n) return [String(Number(n[0])), i + n[0].length];
	WORD.lastIndex = i;
	const w = WORD.exec(src);
	if (w) return [w[0], i + w[0].length];
	throw new NotStatic();
}

function readValue(src: string, i: number): [unknown, number] {
	i = skipSpace(src, i);
	const c = src[i];
	if (c === '{') {
		const obj: Record<string, unknown> = {};
		i = skipSpace(src, i + 1);
		while (src[i] !== '}') {
			const [key, afterKey] = readKey(src, i);
			i = skipSpace(src, afterKey);
			if (src[i] !== ':') throw new NotStatic();
			const [value, afterValue] = readValue(src, i + 1);
			obj[key] = value;
			i = skipSpace(src, afterValue);
			if (src[i] === ',') i = skipSpace(src, i + 1);
			else if (src[i] !== '}') throw new NotStatic();
		}
		return [obj, i + 1];
	}
	if (c === '[') {
		const list: unknown[] = [];
		i = skipSpace(src, i + 1);
		while (src[i] !== ']') {
			const [value, after] = readValue(src, i);
			list.push(value);
			i = skipSpace(src, after);
			if (src[i] === ',') i = skipSpace(src, i + 1);
			else if (src[i] !== ']') throw new NotStatic();
		}
		return [list, i + 1];
	}
	if (c === '"' || c === "'" || c === '`') return readString(src, i);
	NUMBER.lastIndex = i;
	const n = NUMBER.exec(src);
	if (n) return [Number(n[0]), i + n[0].length];
	WORD.lastIndex = i;
	const w = WORD.exec(src);
	if (w) {
		if (w[0] === 'true') return [true, i + 4];
		if (w[0] === 'false') return [false, i + 5];
		if (w[0] === 'null') return [null, i + 4];
		if (w[0] === 'undefined') return [undefined, i + 9];
	}
	throw new NotStatic();
}

/** Finds the end of a template literal that starts at `i`. Reports whether it has `${}`. */
function scanTemplate(src: string, i: number): { end: number; interpolated: boolean } | null {
	let interpolated = false;
	for (let j = i + 1; j < src.length; j++) {
		if (src[j] === '\\') j++;
		else if (src[j] === '$' && src[j + 1] === '{') interpolated = true;
		else if (src[j] === '`') return { end: j + 1, interpolated };
	}
	return null;
}

/**
 * Marks each character that is in a comment or in a string. Code in the `${}` of a template is
 * not marked. A quoted string stops at the end of its line, so an apostrophe in the markup of a
 * component hides only the remainder of that line.
 */
export function inertMask(code: string): Uint8Array {
	const mask = new Uint8Array(code.length);
	/** One entry for each open template: the depth of {} in its current `${}`, or -1 in its text. */
	const templates: number[] = [];
	let i = 0;
	const fill = (to: number) => {
		mask.fill(1, i, to);
		i = to;
	};
	while (i < code.length) {
		const c = code[i];
		const top = templates.length - 1;
		if (top >= 0 && templates[top] < 0) {
			// The text of a template.
			if (c === '\\') fill(i + 2);
			else if (c === '`') {
				templates.pop();
				fill(i + 1);
			} else if (c === '$' && code[i + 1] === '{') {
				templates[top] = 0;
				fill(i + 2);
			} else fill(i + 1);
		} else if (c === '/' && code[i + 1] === '/') {
			const end = code.indexOf('\n', i);
			fill(end < 0 ? code.length : end);
		} else if (c === '/' && code[i + 1] === '*') {
			const end = code.indexOf('*/', i + 2);
			fill(end < 0 ? code.length : end + 2);
		} else if (c === '"' || c === "'") {
			let j = i + 1;
			while (j < code.length && code[j] !== c && code[j] !== '\n') j += code[j] === '\\' ? 2 : 1;
			fill(Math.min(j + 1, code.length));
		} else if (c === '`') {
			templates.push(-1);
			fill(i + 1);
		} else {
			if (top >= 0) {
				if (c === '{') templates[top]++;
				else if (c === '}' && templates[top]-- === 0) {
					templates[top] = -1;
					mask[i] = 1;
				}
			}
			i++;
		}
	}
	return mask;
}

/** True when the code gives `name` to a variable, a function or a parameter of its own. */
export function isRedeclared(code: string, name: string): boolean {
	const n = name.replace(/\$/g, '\\$');
	const word = `(?<![\\w$.])${n}(?![\\w$])`;
	return [
		// const grid = …, function grid() {}, class grid {}
		`(?:const|let|var|function\\*?|class)\\s+${n}(?![\\w$])`,
		// const { grid } = …, const [grid] = …, const { a: grid } = …
		`(?:const|let|var)\\s*[{[][^=;]*${word}\\s*(?:[,}\\]=])`,
		// function f(a, grid) {}, (grid) => …, catch (grid)
		`(?:function\\*?\\s*[\\w$]*|catch)\\s*\\([^()]*${word}[^()]*\\)`,
		`\\([^()]*${word}[^()]*\\)\\s*(?::[^=]+)?=>`,
		`${word}\\s*=>`
	].some((pattern) => new RegExp(pattern).test(code));
}

export function findCalls(code: string, names: Set<string>): Call[] {
	const calls: Call[] = [];
	const inert = inertMask(code);

	for (const name of names) {
		if (isRedeclared(code, name)) continue;
		const escaped = name.replace(/\$/g, '\\$');
		const pattern = new RegExp(`(?<![\\w$.])${escaped}(?![\\w$])\\s*([\`(])`, 'g');
		for (const match of code.matchAll(pattern)) {
			const start = match.index;
			const open = start + match[0].length - 1;
			if (inert[start]) continue;
			if (calls.some((c) => start >= c.start && start < c.end)) continue;

			if (match[1] === '`') {
				const t = scanTemplate(code, open);
				if (!t) continue;
				calls.push(
					t.interpolated
						? { kind: 'interpolation', start, end: t.end }
						: { kind: 'template', start, end: t.end, source: code.slice(open + 1, t.end - 1) }
				);
				continue;
			}

			try {
				const first = skipSpace(code, open + 1);
				if (code[first] !== '{') continue;
				const [value, after] = readValue(code, first);
				let i = skipSpace(code, after);
				if (code[i] === ',') i = skipSpace(code, i + 1);
				// A second argument (options) is not read here. That call compiles when it runs.
				if (code[i] !== ')') continue;
				calls.push({ kind: 'object', start, end: i + 1, value });
			} catch (e) {
				if (!(e instanceof NotStatic)) throw e;
			}
		}
	}
	return calls.sort((a, b) => a.start - b.start);
}
