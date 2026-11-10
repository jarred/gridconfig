// The server output of the Svelte `Grid`. The test compiles the component for the server and
// renders it. The browser side (one stylesheet for each layout) is `mountStyles` in core.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { grid } from '@gridconfig/core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The compiled file must be in the package, so that its imports resolve. This folder is ignored.
const out = join(root, 'node_modules/.cache/gridconfig-test');
mkdirSync(out, { recursive: true });
const source = readFileSync(join(root, 'src/Grid.svelte'), 'utf8');
const file = join(out, 'Grid.server.js');
writeFileSync(file, compile(source, { generate: 'server', filename: 'Grid.svelte' }).js.code);
const { default: Grid } = await import(pathToFileURL(file).href);

const layout = grid({ name: 'card', areas: 'A B' });

test('renders the DOM contract and passes props to the grid element', () => {
	const { body } = render(Grid, { props: { layout, class: 'c', id: 'g' } });
	assert.match(body, /<div data-grid-host="card">/);
	assert.match(body, /<div[^>]*class="c"[^>]*data-grid-layout="card"/);
	assert.match(body, /id="g"/);
});

test('a runtime layout writes the base and its CSS to the head', () => {
	const { head } = render(Grid, { props: { layout } });
	assert.match(head, /<style data-gridconfig-ssr="base:gridconfig">/);
	assert.match(head, /<style data-gridconfig-ssr="layout:card">/);
	assert.ok(head.includes('container: card / inline-size'));
});

test('a bundled layout writes no CSS', () => {
	const bundled = { ...layout, css: '', bundled: true as const };
	assert.doesNotMatch(render(Grid, { props: { layout: bundled } }).head, /<style/);
});

test('the area prop names the area of a nested grid on its host', () => {
	const { body } = render(Grid, { props: { layout, area: 'main' } });
	assert.match(body, /<div data-grid-host="card" data-grid-area="main">/);
	assert.doesNotMatch(render(Grid, { props: { layout } }).body, /data-grid-area/);
});
