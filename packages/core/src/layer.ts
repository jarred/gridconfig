/** The cascade layer that compiled layouts use unless an option says otherwise. */
export const DEFAULT_LAYER = 'gridconfig';

const LAYER_NAME = /^[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*$/;

/** Turns the `layer` option into a layer name, or null for no layer. */
export function resolveLayer(layer: boolean | string | undefined): string | null {
	if (layer === false) return null;
	if (layer === undefined || layer === true) return DEFAULT_LAYER;
	if (!LAYER_NAME.test(layer)) throw new Error(`Invalid layer name "${layer}"`);
	return layer;
}

/** Wraps CSS in `@layer name { … }`, or returns it unchanged when there is no layer. */
export function inLayer(layer: string | null, css: string): string {
	if (layer === null) return css;
	const body = css
		.split('\n')
		.map((line) => (line ? `  ${line}` : line))
		.join('\n');
	return `@layer ${layer} {\n${body}\n}`;
}
