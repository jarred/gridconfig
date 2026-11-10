// Shared by the hydration test and its server render: a small app that shows a list of grids,
// compiled for the server or for the browser.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { grid } from '@gridconfig/core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The compiled files must be in the package, so that their imports resolve. This folder is ignored.
const out = join(root, 'node_modules/.cache/gridconfig-test');

const APP = `<script>
	import Grid from './Grid.MODE.js';
	let { layouts } = $props();
</script>

{#each layouts as layout, i (i)}
	<Grid {layout} class="c"><p data-grid-area="A">a</p></Grid>
{/each}`;

export const card = grid({ name: 'card', areas: 'A' });
export const changed = grid({ name: 'card', areas: 'A', 600: { areas: 'A B' } });
export const other = grid({ name: 'other', areas: 'A' });

/** Compiles `Grid` and the app, and returns the URL of the compiled app. */
export function build(mode: 'server' | 'client'): string {
	mkdirSync(out, { recursive: true });
	const write = (name: string, source: string) => {
		const file = join(out, `${name}.${mode}.js`);
		writeFileSync(file, compile(source, { generate: mode, filename: `${name}.svelte` }).js.code);
		return file;
	};
	write('Grid', readFileSync(join(root, 'src/Grid.svelte'), 'utf8'));
	return pathToFileURL(write('App', APP.replace('MODE', mode))).href;
}
