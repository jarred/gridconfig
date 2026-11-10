// The browser side of `Grid`, in jsdom: the page has one stylesheet for each layout, and the CSS
// of a layout that changes replaces the old CSS. Run with `--conditions=production`, so that
// the component does not load the inspector.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { grid } from '@gridconfig/core';
import type { CompiledLayout } from '@gridconfig/core';
import { Grid } from '../src/index.ts';

const card = grid({ name: 'card', areas: 'A' });
const changed = grid({ name: 'card', areas: 'A', 600: { areas: 'A B' } });
const other = grid({ name: 'other', areas: 'A' });

let setLayouts: (layouts: CompiledLayout[]) => void;
function App() {
	const [layouts, set] = useState([card, card, card]);
	setLayouts = set;
	return createElement(
		'main',
		null,
		layouts.map((layout, i) =>
			createElement(
				Grid,
				{ key: i, layout, className: 'c' },
				createElement('p', { 'data-grid-area': 'A' }, 'a')
			)
		)
	);
}

test('hydrates the server output, and keeps one stylesheet for each layout', async () => {
	// The server render comes first: there is no document yet.
	const html = renderToString(createElement(App));
	assert.equal(html.match(/<style/g)?.length, 2);

	const dom = new JSDOM(
		`<!doctype html><html><head></head><body><div id="app">${html}</div></body>`,
		{
			pretendToBeVisual: true
		}
	);
	for (const key of ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'Event'])
		Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	const { document } = dom.window;
	/** The id of each stylesheet of the registry, or the precedence of an element from the server. */
	const sheets = () =>
		[...document.querySelectorAll('style')].map(
			(s) => s.getAttribute('data-gridconfig') ?? `server ${s.getAttribute('data-precedence')}`
		);
	const problems: string[] = [];
	const error = console.error;
	console.error = (...args: unknown[]) => problems.push(String(args[0]));

	try {
		const { hydrateRoot } = await import('react-dom/client');
		await act(async () => {
			hydrateRoot(document.getElementById('app')!, createElement(App), {
				onRecoverableError: (e) => problems.push(String(e))
			});
		});
		// The elements from the server are gone, and three grids share two stylesheets.
		assert.deepEqual(sheets(), ['base:gridconfig', 'layout:card']);
		assert.equal(document.querySelectorAll('[data-grid-layout="card"].c').length, 3);

		// The layout changes and keeps its name: the new CSS replaces the old CSS.
		await act(async () => setLayouts([changed, changed]));
		assert.deepEqual(sheets(), ['base:gridconfig', 'layout:card']);
		assert.equal(
			document.querySelector('[data-gridconfig="layout:card"]')!.textContent,
			changed.css
		);

		await act(async () => setLayouts([card, other]));
		assert.deepEqual(sheets(), ['base:gridconfig', 'layout:card', 'layout:other']);
		assert.equal(document.querySelector('[data-gridconfig="layout:card"]')!.textContent, card.css);

		// The stylesheet of a layout goes with its last grid. The base stays.
		await act(async () => setLayouts([]));
		assert.deepEqual(sheets(), ['base:gridconfig']);
		await act(async () => setLayouts([other]));
		assert.deepEqual(sheets(), ['base:gridconfig', 'layout:other']);

		assert.deepEqual(problems, []);
	} finally {
		console.error = error;
	}
});
