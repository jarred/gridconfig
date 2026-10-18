// The inspector in a real browser: what it draws, and what the select and the handles do to the host.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { baseCssFor, compileLayout } from '@gridconfig/core';
import { build } from 'esbuild';
import type { Browser, Page } from 'playwright';
import { launch } from './harness.ts';

let browser: Browser;
let script: string;

before(async () => {
	browser = await launch();
	const result = await build({
		entryPoints: [fileURLToPath(new URL('../../devtools/src/auto.ts', import.meta.url))],
		bundle: true,
		format: 'iife',
		write: false,
		logLevel: 'silent'
	});
	script = result.outputFiles[0].text;
});
after(async () => {
	await browser.close();
});

const SOURCE = `
name: card
areas: A
100x100:
  gap: 4
  cols: 1fr 40px
  rows: 50cqw 1fr
  areas: |
    A B
    C C
200x200:
  gap: 8
  padding: 6
`;

type Options = { children?: string; wrap?: string; debug?: boolean; boxStyle?: string };

/** A page with the layout in a 150 x 150 box at (140, 100), and the inspector installed. */
async function setup(options: Options = {}): Promise<Page> {
	const compiled = compileLayout(SOURCE, { debug: options.debug ?? true });
	const children =
		options.children ?? compiled.areas.map((a) => `<div data-grid-area="${a}">${a}</div>`).join('');
	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	await page.setContent(
		`<!doctype html><html><head><style>
body { margin: 0; }
${baseCssFor(compiled.layer)}
${compiled.css}
#box { position: absolute; left: 140px; top: 100px; width: 150px; height: 150px; ${options.boxStyle ?? ''} }
</style></head><body>
${options.wrap ?? '<div id="wrap">__BOX__</div>'}
</body></html>`.replace(
			'__BOX__',
			`<div id="box"><div data-grid-host="card"><div data-grid-layout="card">${children}</div></div></div>`
		)
	);
	await page.addScriptTag({ content: script });
	await page.evaluate(() => {
		(
			globalThis as unknown as { __gridconfigDevtools: { open(): void } }
		).__gridconfigDevtools.open();
	});
	await settle(page);
	return page;
}

const settle = (page: Page) =>
	page.evaluate(
		() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
	);

const hostSize = (page: Page) =>
	page.evaluate(() => {
		const r = document.querySelector('[data-grid-host]')!.getBoundingClientRect();
		return [Math.round(r.width), Math.round(r.height)];
	});

const texts = (page: Page, selector: string) =>
	page.locator(`gridconfig-devtools ${selector}`).allTextContents();

describe('the inspector', () => {
	test('draws area labels, authored track values and the active step', async () => {
		const page = await setup();
		assert.deepEqual((await texts(page, '.area-label')).map((t) => t.trim()).sort(), [
			'A',
			'B',
			'C'
		]);
		assert.deepEqual(await texts(page, '.label.col'), ['1fr', '40px']);
		assert.deepEqual(await texts(page, '.label.row'), ['50cqw', '1fr']);
		assert.equal(await page.locator('gridconfig-devtools select').inputValue(), '1');
		assert.deepEqual(await page.locator('gridconfig-devtools select option').allTextContents(), [
			'base',
			'100x100',
			'200x200'
		]);
		assert.match((await texts(page, '.info')).join(' '), /gap 4px/);
		await page.close();
	});

	test('draws used sizes in the tooltip, and the frame on the host', async () => {
		const page = await setup();
		const frame = await page.locator('gridconfig-devtools .frame:not(.dim)').boundingBox();
		assert.deepEqual([frame?.x, frame?.y, frame?.width, frame?.height], [140, 100, 150, 150]);
		const col = page.locator('gridconfig-devtools .label.col').first();
		// 150 wide, 4px gap, 40px second track: 106px for the first.
		assert.equal(await col.getAttribute('title'), 'Used: 106px');
		await page.close();
	});

	test('the select sets the host to the size of a step, and the real CSS follows', async () => {
		const page = await setup();
		await page.locator('gridconfig-devtools select').selectOption('2');
		await settle(page);
		assert.deepEqual(await hostSize(page), [200, 200]);
		assert.equal(await page.locator('gridconfig-devtools select').inputValue(), '2');
		const gap = await page.evaluate(
			() => getComputedStyle(document.querySelector('[data-grid-layout]')!).columnGap
		);
		assert.equal(gap, '8px');

		await page.locator('gridconfig-devtools select').selectOption('0');
		await settle(page);
		const [w, h] = await hostSize(page);
		assert.ok(w < 100 && h < 100, `base size is below the first step, got ${w}x${h}`);
		assert.equal(await page.locator('gridconfig-devtools select').inputValue(), '0');
		// B and C are hidden at the base step: they show as no longer in the map.
		assert.match((await texts(page, '.info')).join(' '), /hidden B, C/);
		await page.close();
	});

	test('a drag on the corner resizes the host, and snaps to a step size', async () => {
		const page = await setup();
		const dot = (await page.locator('gridconfig-devtools .handle.dot').boundingBox())!;
		const x = dot.x + dot.width / 2;
		const y = dot.y + dot.height / 2;
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x + 20, y + 30, { steps: 4 });
		await settle(page);
		assert.deepEqual(await hostSize(page), [170, 180]);
		// 197 is within 6px of 200: snap.
		await page.mouse.move(x + 47, y + 47, { steps: 4 });
		await page.mouse.up();
		await settle(page);
		assert.deepEqual(await hostSize(page), [200, 200]);
		assert.equal(await page.locator('gridconfig-devtools select').inputValue(), '2');
		assert.equal((await texts(page, '.size'))[0], '200 × 200');
		await page.close();
	});

	test('reset gives the natural size back, and close does too', async () => {
		const page = await setup();
		await page.locator('gridconfig-devtools select').selectOption('2');
		await settle(page);
		await page.locator('gridconfig-devtools .reset').click();
		await settle(page);
		assert.deepEqual(await hostSize(page), [150, 150]);
		assert.equal(
			await page.evaluate(
				() => document.querySelector<HTMLElement>('[data-grid-host]')!.style.cssText
			),
			''
		);

		await page.locator('gridconfig-devtools select').selectOption('2');
		await settle(page);
		await page.evaluate(() =>
			(
				globalThis as unknown as { __gridconfigDevtools: { close(): void } }
			).__gridconfigDevtools.close()
		);
		await settle(page);
		assert.deepEqual(await hostSize(page), [150, 150]);
		await page.close();
	});

	test('it is not clipped by an ancestor with overflow: hidden', async () => {
		const page = await setup({
			wrap: '<div style="position:absolute; left:130px; top:90px; width:170px; height:170px; overflow:hidden">__BOX__</div>',
			boxStyle: 'left: 10px; top: 10px;'
		});
		// The row labels are left of the host, outside the clipping box.
		const label = (await page.locator('gridconfig-devtools .label.row').first().boundingBox())!;
		const hit = await page.evaluate(
			([x, y]) => document.elementFromPoint(x, y)?.localName,
			[label.x + label.width / 2, label.y + label.height / 2]
		);
		assert.equal(hit, 'gridconfig-devtools');
		await page.close();
	});

	test('it finds mistakes in the markup', async () => {
		const page = await setup({
			children: '<div data-grid-area="A">A</div><p>no area</p><div data-grid-area="Z">Z</div>'
		});
		const found = await texts(page, '.finding');
		assert.ok(
			found.some((t) => /<p> has no data-grid-area/.test(t)),
			found.join('|')
		);
		assert.ok(
			found.some((t) => /Area "Z" is not in the layout/.test(t)),
			found.join('|')
		);
		assert.ok(
			found.some((t) => /No element uses area "B"/.test(t)),
			found.join('|')
		);
		await page.close();
	});

	test('it says when the host has no height', async () => {
		const page = await setup({ boxStyle: 'height: auto;' });
		const found = await texts(page, '.finding');
		assert.ok(
			found.some((t) => /no height/.test(t)),
			found.join('|')
		);
		await page.close();
	});

	test('without debug data it still draws, from the computed styles', async () => {
		const page = await setup({ debug: false });
		assert.deepEqual((await texts(page, '.area-label')).map((t) => t.trim()).sort(), [
			'A',
			'B',
			'C'
		]);
		assert.equal(await page.locator('gridconfig-devtools select').isHidden(), true);
		assert.deepEqual(await texts(page, '.label.col'), ['106px', '40px']);
		assert.match((await texts(page, '.info')).join(' '), /no debug data/);
		await page.close();
	});

	test('page resets do not reach into the inspector', async () => {
		const page = await setup();
		await page.addStyleTag({
			content:
				'* { padding: 20px !important; margin: 9px !important; border: 3px solid red !important; }'
		});
		await settle(page);
		const tag = (await page.locator('gridconfig-devtools .tag').boundingBox())!;
		assert.ok(tag.height < 40, `the tag keeps its size, got ${tag.height}`);
		await page.close();
	});
});
