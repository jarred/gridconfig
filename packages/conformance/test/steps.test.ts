// `--grid-breakpoint` holds the active step, so content can target a step with a style query.
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

// 300x400 and 450x200 can match at the same time. Both set `areas`, so 450x400 decides there.
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
450x400:
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
@container style(--grid-breakpoint: base) { .probe { color: rgb(1, 1, 1); } }
@container style(--grid-breakpoint: 100x100) { .probe { color: rgb(2, 2, 2); } }
@container style(--grid-breakpoint: 300x400) { .probe { color: rgb(3, 3, 3); } }
@container style(--grid-breakpoint: 450x200) { .probe { color: rgb(4, 4, 4); } }
@container style(--grid-breakpoint: 200) { .probe { color: rgb(5, 5, 5); } }
@container style(--grid-breakpoint: 450x400) { .probe { color: rgb(6, 6, 6); } }
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
				step: getComputedStyle(grid).getPropertyValue('--grid-breakpoint').trim(),
				deep: read('deep'),
				child: read('child'),
				nested: read('nested')
			};
		},
		[w, h]
	);
}

describe('--grid-breakpoint', () => {
	test('names the active step, the last step that matches', async () => {
		const p = await page();
		for (const [w, h, step, color] of [
			[50, 50, 'base', 'rgb(1, 1, 1)'],
			[150, 150, '100x100', 'rgb(2, 2, 2)'],
			[350, 450, '300x400', 'rgb(3, 3, 3)'],
			[500, 250, '450x200', 'rgb(4, 4, 4)'],
			// 300x400 and 450x200 both match. 450x400 is inside both, so it is active.
			[500, 450, '450x400', 'rgb(6, 6, 6)']
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

describe('--grid-breakpoint with ranges, ratios and names', () => {
	const LABELS = compileLayout(`
name: labels
breakpoints:
  wide: 600..
areas: X
..300:
  gap: 1
300..600x..400:
  gap: 2
wide:
  gap: 3
300..600 ..3/4:
  padding: 1
`);
	const CSS = `
.probe { color: rgb(0, 0, 0); }
@container style(--grid-breakpoint: ..300) { .probe { color: rgb(1, 1, 1); } }
@container style(--grid-breakpoint: 300..600x..400) { .probe { color: rgb(2, 2, 2); } }
@container style(--grid-breakpoint: wide) { .probe { color: rgb(3, 3, 3); } }
@container style(--grid-breakpoint: 300..600 ..3/4) { .probe { color: rgb(4, 4, 4); } }
`;

	test('a style query can name each kind of key', async () => {
		const p = await browser.newPage();
		await p.setContent(`<style>
body { margin: 0; }
${baseCssFor(LABELS.layer)}
${LABELS.css}
${CSS}
#box { width: 100px; height: 100px; }
</style>
<div id="box" data-grid-host="labels"><div data-grid-layout="labels">
<div data-grid-area="X"><span class="probe" id="probe">x</span></div>
</div></div>`);
		for (const [w, h, step, color] of [
			[200, 300, '..300', 'rgb(1, 1, 1)'],
			[400, 300, '300..600x..400', 'rgb(2, 2, 2)'],
			[800, 300, 'wide', 'rgb(3, 3, 3)'],
			[400, 600, '300..600 ..3/4', 'rgb(4, 4, 4)']
		] as const) {
			const r = await p.evaluate(
				([w, h]) => {
					const box = document.getElementById('box')!;
					box.style.width = `${w}px`;
					box.style.height = `${h}px`;
					const grid = document.querySelector('[data-grid-layout="labels"]')!;
					return {
						step: getComputedStyle(grid).getPropertyValue('--grid-breakpoint').trim(),
						color: getComputedStyle(document.getElementById('probe')!).color
					};
				},
				[w, h]
			);
			assert.equal(r.step, step, `${w}x${h}`);
			assert.equal(r.color, color, `${w}x${h}: style query for ${step}`);
		}
		await p.close();
	});
});
