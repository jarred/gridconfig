import { buildLayout } from './build.ts';
import { parseLayout } from './parse.ts';
import type { CompileOptions, CompiledLayout, Layout } from './types.ts';

export { baseCss, baseCssFor } from './base.ts';

export { DEBUG_PROPERTY } from './debug.ts';

/** Compiles a layout to CSS. The layout is YAML text, or a layout that is parsed already. */
export function compileLayout(
	source: string | Layout,
	options: CompileOptions = {}
): CompiledLayout {
	return buildLayout(typeof source === 'string' ? parseLayout(source, options) : source, options);
}
