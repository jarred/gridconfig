// The rows that the compiler calculates. With `inline-size`, the height comes from the content,
// so each row must get the height of its own content. With `size`, the rows share the height.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { compileLayout } from '@gridconfig/core';
import type { Browser } from 'playwright';
import { launch, mount, resize } from './harness.ts';

let browser: Browser;
before(async () => {
	browser = await launch();
});
after(async () => {
	await browser.close();
});

const STACK = 'areas: |\n  A\n  B\n  C\n';
/** Each area has a different height. */
const HEIGHTS =
	'[data-grid-area="A"] { height: 100px; } [data-grid-area="B"] { height: 20px; } [data-grid-area="C"] { height: 30px; }';

test('inline-size: each calculated row gets the height of its content', async () => {
	const compiled = compileLayout(`name: stack\n${STACK}`);
	// The box has no height, so the height of the layout comes from its content.
	const page = await mount(browser, compiled, {
		pageCss: `#box { height: auto !important; } ${HEIGHTS}`
	});
	const m = await resize(page, [200, 0]);
	await page.close();
	assert.deepEqual(m.rows, [100, 20, 30]);
});

test('inline-size: calculated rows fill a host with a definite height', async () => {
	const compiled = compileLayout(`name: stack\n${STACK}`);
	const page = await mount(browser, compiled);
	const m = await resize(page, [200, 300]);
	await page.close();
	const total = m.rows.reduce((sum, r) => sum + r, 0);
	assert.ok(Math.abs(total - 300) < 0.5, `the rows are ${m.rows.join(', ')}`);
});

test('size: calculated rows are equal parts of the height', async () => {
	const compiled = compileLayout(`name: stack\ncontainer: size\n${STACK}`);
	const page = await mount(browser, compiled, { pageCss: HEIGHTS });
	const m = await resize(page, [200, 300]);
	await page.close();
	assert.deepEqual(m.rows, [100, 100, 100]);
});
