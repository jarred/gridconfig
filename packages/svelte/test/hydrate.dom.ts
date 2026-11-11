// The browser side of `Grid`, in jsdom: the page has one stylesheet for each layout, and the CSS
// of a layout that changes replaces the old CSS. Run with `--conditions=browser
// --conditions=production`: the browser build of Svelte, and no inspector.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { build, card, changed, other, wrapped } from './app.ts';

const here = dirname(fileURLToPath(import.meta.url));

test('hydrates the server output, and keeps one stylesheet for each layout', async () => {
	// The server render: a process with no export conditions.
	const server = JSON.parse(
		execFileSync(process.execPath, [join(here, 'render.ts')], {
			encoding: 'utf8',
			env: { ...process.env, NODE_OPTIONS: '', NODE_NO_WARNINGS: '1' }
		})
	) as { head: string; body: string };
	// On the server, each of the three grids writes the base and the CSS of the layout. Inside
	// `GridStyles`, only the first grid writes them.
	const fromServer = wrapped ? 2 : 6;
	assert.equal(server.head.match(/<style data-gridconfig-ssr=/g)?.length, fromServer);

	const dom = new JSDOM(
		`<!doctype html><html><head>${server.head}</head><body><div id="app">${server.body}</div></body>`,
		{ pretendToBeVisual: true }
	);
	for (const key of [
		'window',
		'document',
		'navigator',
		'Node',
		'Element',
		'HTMLElement',
		'Text',
		'Comment',
		'DocumentFragment',
		'Event',
		'requestAnimationFrame'
	])
		Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
	const { document } = dom.window;
	/** The id of each stylesheet of the registry, or `server` for an element from the server. */
	const sheets = () =>
		[...document.head.querySelectorAll('style')].map(
			(s) => s.getAttribute('data-gridconfig') ?? 'server'
		);
	assert.equal(sheets().filter((s) => s === 'server').length, fromServer);

	const problems: string[] = [];
	const { warn, error } = console;
	console.warn = console.error = (...args: unknown[]) => problems.push(String(args[0]));

	try {
		const { hydrate, mount, unmount, flushSync } = await import('svelte');
		const { default: App } = await import(build('client'));
		const target = document.getElementById('app')!;

		const app = hydrate(App, { target, props: { layouts: [card, card, card] } });
		flushSync();
		// The elements from the server are gone, and three grids share two stylesheets.
		assert.deepEqual(sheets(), ['base:gridconfig', 'layout:card']);
		assert.equal(document.querySelectorAll('[data-grid-layout="card"].c').length, 3);

		// A layout that changes and keeps its name: the new CSS replaces the old CSS.
		const second = mount(App, { target, props: { layouts: [changed, other] } });
		flushSync();
		assert.deepEqual(sheets(), ['base:gridconfig', 'layout:card', 'layout:other']);
		const css = () => document.querySelector('[data-gridconfig="layout:card"]')!.textContent;
		assert.equal(css(), changed.css);

		// The stylesheet of a layout goes with its last grid. The base stays.
		await unmount(second);
		flushSync();
		assert.deepEqual(sheets(), ['base:gridconfig', 'layout:card']);
		await unmount(app);
		flushSync();
		assert.deepEqual(sheets(), ['base:gridconfig']);

		assert.deepEqual(problems, []);
	} finally {
		console.warn = warn;
		console.error = error;
	}
});
