// `--gc-step` holds the active step, so content can target a step with a style query.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { baseCssFor, compileLayout } from '@gridconfig/core';
import type { Browser, Page } from 'playwright';
import { launch } from './harness.ts';

let browser: Browser;
before(async () => {
	browser = await launch();
});
after(async () => {
	await browser.close();
});

// 300x400 and 450x200 can match at the same time. Steps sort by min-width, so 450x200 wins then.
const OUTER = compileLayout(`
name: promo
areas: A
100x100:
  areas: |
    A
    B
300x400:
  areas: |
    A
    B
450x200:
  areas: A B
`);
const INNER = compileLayout(`
name: inner
areas: X
200:
  areas: X
`);

const PAGE_CSS = `
.probe { color: rgb(0, 0, 0); }
@container style(--gc-step: base) { .probe { color: rgb(1, 1, 1); } }
@container style(--gc-step: 100x100) { .probe { color: rgb(2, 2, 2); } }
@container style(--gc-step: 300x400) { .probe { color: rgb(3, 3, 3); } }
@container style(--gc-step: 450x200) { .probe { color: rgb(4, 4, 4); } }
@container style(--gc-step: 200) { .probe { color: rgb(5, 5, 5); } }
`;

async function page(): Promise<Page> {
	const p = await browser.newPage({ viewport: { width: 1000, height: 800 } });
	await p.setContent(`<!doctype html><html><head><style>
body { margin: 0; }
${baseCssFor(OUTER.layer)}
${OUTER.css}
${INNER.css}
${PAGE_CSS}
#box { width: 50px; height: 50px; }
</style></head><body><div id="box">
	<div data-grid-host="promo"><div data-grid-layout="promo">
		<div data-grid-area="A"><p><span class="probe" id="deep">deep</span></p></div>
		<div data-grid-area="B" class="probe" id="child">
			<div data-grid-host="inner"><div data-grid-layout="inner">
				<div data-grid-area="X" class="probe" id="nested">x</div>
			</div></div>
		</div>
	</div></div>
</div></body></html>`);
	return p;
}

async function at(p: Page, w: number, h: number) {
	return p.evaluate(
		([w, h]) => {
			const box = document.getElementById('box')!;
			box.style.width = `${w}px`;
			box.style.height = `${h}px`;
			const read = (id: string) => getComputedStyle(document.getElementById(id)!).color;
			const grid = document.querySelector('[data-grid-layout="promo"]')!;
			return {
				step: getComputedStyle(grid).getPropertyValue('--gc-step').trim(),
				deep: read('deep'),
				child: read('child'),
				nested: read('nested')
			};
		},
		[w, h]
	);
}

describe('--gc-step', () => {
	test('names the active step, the last step that matches', async () => {
		const p = await page();
		for (const [w, h, step, color] of [
			[50, 50, 'base', 'rgb(1, 1, 1)'],
			[150, 150, '100x100', 'rgb(2, 2, 2)'],
			[350, 450, '300x400', 'rgb(3, 3, 3)'],
			[500, 250, '450x200', 'rgb(4, 4, 4)'],
			// Both 300x400 and 450x200 match. The later step in the cascade is active.
			[500, 450, '450x200', 'rgb(4, 4, 4)']
		] as const) {
			const r = await at(p, w, h);
			assert.equal(r.step, step, `${w}x${h}`);
			assert.equal(r.deep, color, `${w}x${h}: a descendant at any depth can query it`);
		}
		await p.close();
	});

	test('a nested layout sets its own step for its subtree', async () => {
		const p = await page();
		const r = await at(p, 500, 250);
		assert.equal(r.child, 'rgb(4, 4, 4)');
		// The inner host is in cell B: 250px wide, so step 200 of the inner layout is active.
		assert.equal(r.nested, 'rgb(5, 5, 5)');
		await p.close();
	});

	test('JavaScript can read the active step', async () => {
		const p = await page();
		assert.equal((await at(p, 350, 450)).step, '300x400');
		await p.close();
	});
});
