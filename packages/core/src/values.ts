import { LayoutError } from './errors.ts';
import type { CompileOptions } from './types.ts';

type Path = (string | number)[];

export const OPERATORS = new Set(['+', '-', '*', '/']);
export const NUMBER = /^-?\d+(?:\.\d+)?$/;
const CUSTOM_PROP = /^--[\w-]+$/;
const TOKEN_PATH = /^[A-Za-z0-9_.-]+$/;

/** Splits on whitespace that is not inside () or {}. Throws on unbalanced brackets. */
export function splitTerms(value: string, path: Path = []): string[] {
	const terms: string[] = [];
	let parens = 0;
	let braces = 0;
	let current = '';
	for (const ch of value.trim()) {
		if (ch === '(') parens++;
		else if (ch === ')') parens--;
		else if (ch === '{') braces++;
		else if (ch === '}') braces--;
		if (parens < 0 || braces < 0) throw new LayoutError(`Unbalanced "${ch}" in "${value}"`, path);
		if (/\s/.test(ch) && parens === 0 && braces === 0) {
			if (current) terms.push(current);
			current = '';
		} else current += ch;
	}
	if (parens !== 0 || braces !== 0)
		throw new LayoutError(`Unbalanced brackets in "${value}"`, path);
	if (current) terms.push(current);
	return terms;
}

export function px(n: number | string): string {
	const num = Number(n);
	return num === 0 ? '0' : `${num}px`;
}

function tokenValue(tokenPath: string, options: CompileOptions, path: Path): string {
	if (!TOKEN_PATH.test(tokenPath))
		throw new LayoutError(`Invalid token reference "{${tokenPath}}"`, path);
	if (options.tokenVar) return options.tokenVar(tokenPath);
	const prefix = options.tokenPrefix ? `${options.tokenPrefix}-` : '';
	return `var(--${prefix}${tokenPath.replaceAll('.', '-')})`;
}

/** Converts one term: numbers to px (or left unitless), `--x` to var(), `{token}` to var(). */
export function convertTerm(
	term: string,
	unitless: boolean,
	options: CompileOptions,
	path: Path
): string {
	if (NUMBER.test(term)) return unitless ? term : px(term);
	if (CUSTOM_PROP.test(term)) return `var(${term})`;
	return term.replace(/\{([^{}]*)\}/g, (_, inner: string) =>
		tokenValue(inner.trim(), options, path)
	);
}

/**
 * The value grammar shared by `gap`, `padding` and track sizes.
 * A value with operator terms is one expression and becomes calc(); otherwise each term stands alone.
 */
export function compileValue(value: unknown, options: CompileOptions, path: Path): string {
	if (typeof value === 'number') return px(value);
	if (typeof value !== 'string') throw new LayoutError('Expected a number or a string', path);

	const terms = splitTerms(value, path);
	if (!terms.length) throw new LayoutError('Value is empty', path);
	if (!terms.some((t) => OPERATORS.has(t)))
		return terms.map((t) => convertTerm(t, false, options, path)).join(' ');

	terms.forEach((t, i) => {
		const isOperator = OPERATORS.has(t);
		if (i % 2 === 0 && isOperator)
			throw new LayoutError(`Misplaced operator "${t}" in "${value}"`, path);
		if (i % 2 === 1 && !isOperator)
			throw new LayoutError(
				`"${value}" mixes a list of values with operators; use calc() for the maths`,
				path
			);
	});
	if (terms.length % 2 === 0)
		throw new LayoutError(`Misplaced operator "${terms.at(-1)}" in "${value}"`, path);

	const body = terms.map((t, i) => {
		if (OPERATORS.has(t)) return t;
		const beside = [terms[i - 1], terms[i + 1]].some((n) => n === '*' || n === '/');
		return convertTerm(t, beside, options, path);
	});
	return `calc(${body.join(' ')})`;
}
