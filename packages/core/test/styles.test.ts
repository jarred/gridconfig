// The stylesheets of layouts that compile when the code runs. The tests use a small stand-in
// for the document, with only the parts that `mountStyles` uses.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { grid } from '../src/grid.ts';
import { mountStyles, sheetsOf } from '../src/styles.ts';

function fakeDocument() {
	const styles: { id: string; textContent: string; isConnected: boolean }[] = [];
	const doc = {
		createElement() {
			const element = {
				id: '',
				textContent: '',
				isConnected: false,
				setAttribute(_name: string, value: string) {
					element.id = value;
				},
				remove() {
					element.isConnected = false;
					styles.splice(styles.indexOf(element), 1);
				}
			};
			return element;
		},
		head: {
			append(element: (typeof styles)[number]) {
				element.isConnected = true;
				styles.push(element);
			}
		}
	};
	return { doc: doc as unknown as Document, styles, ids: () => styles.map((s) => s.id) };
}

const card = grid({ name: 'card', areas: 'A' });
const changed = grid({ name: 'card', areas: 'A', 600: { areas: 'A B' } });

test('a layout needs the base in its layer and its own CSS, and a bundled layout needs nothing', () => {
	assert.deepEqual(
		sheetsOf(card).map((s) => s.id),
		['base:gridconfig', 'layout:card']
	);
	assert.equal(sheetsOf(grid({ name: 'n', areas: 'A' }, { layer: false }))[0].id, 'base:-');
	assert.deepEqual(sheetsOf({ ...card, css: '', bundled: true }), []);
});

test('each sheet is on the page one time, and goes with the last grid that uses it', () => {
	const { doc, ids } = fakeDocument();
	const first = mountStyles(card, doc);
	const second = mountStyles(card, doc);
	assert.deepEqual(ids(), ['base:gridconfig', 'layout:card']);
	first();
	first(); // A second call does nothing.
	assert.deepEqual(ids(), ['base:gridconfig', 'layout:card']);
	second();
	// The base stays: it is small, and the next layout needs it.
	assert.deepEqual(ids(), ['base:gridconfig']);
});

test('a layout that changes replaces its CSS', () => {
	const { doc, styles, ids } = fakeDocument();
	const before = mountStyles(card, doc);
	const after = mountStyles(changed, doc);
	before();
	assert.deepEqual(ids(), ['base:gridconfig', 'layout:card']);
	assert.equal(styles[1].textContent, changed.css);
	after();
	assert.deepEqual(ids(), ['base:gridconfig']);
});

test('a sheet that the page removed comes back', () => {
	const { doc, styles, ids } = fakeDocument();
	mountStyles(card, doc);
	for (const s of [...styles]) (s as unknown as { remove(): void }).remove();
	assert.deepEqual(ids(), []);
	mountStyles(card, doc);
	assert.deepEqual(ids(), ['base:gridconfig', 'layout:card']);
});
