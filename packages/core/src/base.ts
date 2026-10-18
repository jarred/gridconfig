import { attributes } from './attributes.ts';
import { DEFAULT_LAYER, inLayer } from './layer.ts';

const rules = `:where([${attributes.host}]) { width: 100%; height: 100%; }
:where([${attributes.layout}]) {
  display: grid;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  gap: var(--gap);
  padding: var(--padding);
}`;

/**
 * Shared rules, needed once per page. Pass the `layer` of the compiled layout (`CompiledLayout.layer`)
 * so that the base and the layout use the same cascade layer. `null` means no layer.
 */
export function baseCssFor(layer: string | null = DEFAULT_LAYER): string {
	return inLayer(layer, rules);
}

/** The shared rules in the default layer. */
export const baseCss = baseCssFor();
