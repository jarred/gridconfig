import type { Plugin } from 'vite';
import { LayoutError, compileLayout } from '@gridconfig/core';
import type { CompileOptions } from '@gridconfig/core';

/** Enables `import layout from './x.yaml?layout'`, yielding `{ name, css, areas, warnings }`. */
export function layoutPlugin(options: CompileOptions = {}): Plugin {
	return {
		name: 'gridconfig:layout',
		enforce: 'pre',
		transform(code, id) {
			if (!/\.ya?ml\?layout$/.test(id)) return;
			const file = id.split('?')[0];
			try {
				const compiled = compileLayout(code, options);
				for (const w of compiled.warnings) this.warn(`${file}: ${w.message}`);
				return { code: `export default ${JSON.stringify(compiled)};`, map: null };
			} catch (e) {
				if (!(e instanceof LayoutError)) throw e;
				const start = e.range?.start;
				this.error({
					message: e.message,
					id: file,
					loc: start ? { file, line: start.line, column: start.col - 1 } : undefined
				});
			}
		}
	};
}
