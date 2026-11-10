import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { grid } from '@gridconfig/core';
import { Grid } from '../src/index.ts';

const layout = grid({ name: 'card', areas: 'A B', 600: { areas: 'A\nB' } });
/** The stylesheets in the output. React puts the sheets of one precedence in one tag. */
const hrefs = (html: string) =>
	[...html.matchAll(/data-href="([^"]*)"/g)].flatMap((m) => m[1].split(' '));
const area = (name: string) => createElement('p', { key: name, 'data-grid-area': name }, name);

test('renders the DOM contract and passes props to the grid element', () => {
	const html = renderToString(
		createElement(Grid, { layout, className: 'c', id: 'g' }, [area('A'), area('B')])
	);
	assert.match(
		html,
		/<div data-grid-host="card"><div class="c" id="g" data-grid-layout="card"><p data-grid-area="A">A<\/p><p data-grid-area="B">B<\/p><\/div><\/div>/
	);
});

test('a runtime layout gives its CSS and the base to React, one time each', () => {
	const two = createElement('div', null, [
		createElement(Grid, { key: 1, layout }),
		createElement(Grid, { key: 2, layout })
	]);
	const html = renderToString(two);
	const sheets = hrefs(html);
	assert.equal(sheets.length, 2, sheets.join());
	assert.deepEqual(sheets, ['gridconfig:base:gridconfig', 'gridconfig:layout:card']);
	assert.equal(html.match(/:where\(\[data-grid-layout\]\)/g)?.length, 1);
	assert.match(html, /container: card \/ inline-size/);
	// One precedence for each sheet, so that React makes one <style> element for each sheet. The
	// browser code can then remove the element of one layout.
	assert.match(html, /data-precedence="gridconfig:base:gridconfig"/);
	assert.match(html, /data-precedence="gridconfig:layout:card"/);
});

test('a bundled layout injects no CSS', () => {
	const bundled = { ...layout, css: '', bundled: true as const };
	const html = renderToString(createElement(Grid, { layout: bundled }));
	assert.doesNotMatch(html, /<style/);
});

test('two layouts give one element each, and share the base', () => {
	const other = grid({ name: 'other', areas: 'A B', gap: 4 });
	const html = renderToString(
		createElement('div', null, [
			createElement(Grid, { key: 1, layout }),
			createElement(Grid, { key: 2, layout: other })
		])
	);
	assert.deepEqual(hrefs(html), [
		'gridconfig:base:gridconfig',
		'gridconfig:layout:card',
		'gridconfig:layout:other'
	]);
	assert.equal(html.match(/<style/g)?.length, 3);
});

test('the area prop names the area of a nested grid on its host', () => {
	const bundled = { ...layout, css: '', bundled: true as const };
	const inner = { ...bundled, name: 'inner' };
	const html = renderToString(
		createElement(Grid, { layout: bundled }, createElement(Grid, { layout: inner, area: 'A' }))
	);
	assert.match(
		html,
		/<div data-grid-layout="card"><div data-grid-host="inner" data-grid-area="A"><div data-grid-layout="inner">/
	);
	// Without the prop, the host has no area.
	assert.doesNotMatch(renderToString(createElement(Grid, { layout: bundled })), /data-grid-area/);
});
