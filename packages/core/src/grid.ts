import { compileLayout } from './compile.ts';
import { LayoutError } from './errors.ts';
import { parseLayoutObject } from './model.ts';
import { parseLayout } from './parse.ts';
import type { CompileOptions, CompiledLayout, LayoutInput } from './types.ts';

function isTemplate(value: unknown): value is TemplateStringsArray {
	return Array.isArray(value) && 'raw' in value;
}

/**
 * Defines and compiles a layout in code. There are two forms.
 *
 * ```ts
 * grid`
 *   areas: A
 *   600:
 *     areas: |
 *       A A
 *       B B
 * `;
 * grid({ areas: 'A', 600: { areas: 'A A\nB B' } });
 * ```
 *
 * Both forms must be static: a template cannot contain `${}`, and an object must be plain data.
 * Then a build plugin can compile the layout at build time and replace the call.
 * Without the plugin, the layout compiles when this function runs.
 */
export function grid(strings: TemplateStringsArray, ...values: unknown[]): CompiledLayout;
export function grid(input: LayoutInput, options?: CompileOptions): CompiledLayout;
export function grid(
	first: TemplateStringsArray | LayoutInput,
	...rest: unknown[]
): CompiledLayout {
	if (isTemplate(first)) {
		if (rest.length)
			throw new LayoutError(
				'A grid template cannot contain ${} expressions: layouts must be static'
			);
		return compileLayout(parseLayout(first.raw.join('')));
	}
	const options = (rest[0] ?? {}) as CompileOptions;
	return compileLayout(parseLayoutObject(first, options), options);
}
