// The inspector in a real browser: what it draws. It only reads the page, so no test changes the host through it.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { baseCssFor, compileLayout } from '@gridconfig/core';
import { build, type Plugin } from 'esbuild';
import type { Browser, Page } from 'playwright';
import { launch } from './harness.ts';

/** Like Vite: `import css from './x.css?raw'` gives the text of the file. */
const raw: Plugin = {
	name: 'raw',
	setup(b) {
		b.onResolve({ filter: /\?raw$/ }, (a) => ({
			path: resolve(a.resolveDir, a.path.replace(/\?raw$/, '')),
			namespace: 'raw'
		}));
		b.onLoad({ filter: /.*/, namespace: 'raw' }, async (a) => ({
			contents: await readFile(a.path, 'utf8'),
			loader: 'text'
		}));
	}
};

let browser: Browser;
let script: string;

before(async () => {
	browser = await launch();
	const result = await build({
		entryPoints: [fileURLToPath(new URL('../../devtools/src/auto.ts', import.meta.url))],
		bundle: true,
		format: 'iife',
		write: false,
		plugins: [raw],
		logLevel: 'silent'
	});
	script = result.outputFiles[0].text;
});
after(async () => {
	await browser.close();
});

const SOURCE = `
name: card
container: size
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

type Options = {
	children?: string;
	wrap?: string;
	debug?: boolean;
	boxStyle?: string;
	/** Open the inspector. The default is true. */
	open?: boolean;
	/** Collects console warnings from the start. */
	warnings?: string[];
	/** More CSS for the page, for example a nested layout. */
	css?: string;
};

/** A page with the layout in a 150 x 150 box at (140, 100), and the inspector installed. */
async function setup(options: Options = {}): Promise<Page> {
	const compiled = compileLayout(SOURCE, { debug: options.debug ?? true });
	const children =
		options.children ?? compiled.areas.map((a) => `<div data-grid-area="${a}">${a}</div>`).join('');
	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	const warnings = options.warnings;
	if (warnings) page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
	// A page from a real origin, so that a test can reload it.
	const html = `<!doctype html><html><head><style>
body { margin: 0; }
${baseCssFor(compiled.layer)}
${compiled.css}
${options.css ?? ''}
#box { position: absolute; left: 140px; top: 100px; width: 150px; height: 150px; ${options.boxStyle ?? ''} }
</style></head><body>
${options.wrap ?? '<div id="wrap">__BOX__</div>'}
</body></html>`.replace(
		'__BOX__',
		`<div id="box"><div data-grid-host="card"><div data-grid-layout="card">${children}</div></div></div>`
	);
	await page.route('https://gridconfig.test/', (route) =>
		route.fulfill({ contentType: 'text/html', body: html })
	);
	await page.goto('https://gridconfig.test/');
	await start(page, options.open);
	return page;
}

/** Installs the inspector, and opens it unless `open` is false. */
async function start(page: Page, open?: boolean) {
	await page.addScriptTag({ content: script });
	if (open !== false)
		await page.evaluate(() => {
			(
				globalThis as unknown as { __gridconfigDevtools: { open(): void } }
			).__gridconfigDevtools.open();
		});
	await settle(page);
	// The guides show while the pointer is over the layout: start there.
	if (open !== false) await page.mouse.move(215, 175);
}

const settle = (page: Page) =>
	page.evaluate(
		() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
	);

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
		assert.deepEqual(await texts(page, '.tag .step'), ['100x100']);
		assert.equal(
			await page.locator('gridconfig-devtools .tag .step').getAttribute('title'),
			'Steps: base, 100x100, 200x200'
		);
		// The free overlay has no controls that change the host.
		assert.equal(
			await page
				.locator('gridconfig-devtools :is(select, .handle, .reset, .popout, .scrim)')
				.count(),
			0
		);
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

	test('the step follows the size of the host, and the overlay never writes to it', async () => {
		const page = await setup();
		const resize = async (size: number) => {
			await page.addStyleTag({
				content: `#box { width: ${size}px !important; height: ${size}px !important; }`
			});
			await settle(page);
			await settle(page);
		};
		await resize(200);
		assert.deepEqual(await texts(page, '.tag .step'), ['200x200']);
		assert.match((await texts(page, '.info')).join(' '), /gap 8px/);
		assert.equal((await texts(page, '.size'))[0], '200 × 200');

		await resize(90);
		assert.deepEqual(await texts(page, '.tag .step'), ['base']);
		// B and C are hidden at the base step: they show as no longer in the map.
		assert.match((await texts(page, '.info')).join(' '), /hidden B, C/);
		assert.equal(
			await page.evaluate(() => document.querySelector('[data-grid-host]')!.getAttribute('style')),
			null
		);
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
		assert.equal(await page.locator('gridconfig-devtools .tag .step').isHidden(), true);
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

describe('the console warning for a host with no size', () => {
	// The check waits 1s for the page to be still.
	const wait = (page: Page) => page.waitForTimeout(1400);

	test('says when a host has no height, also with the inspector closed', async () => {
		const warnings: string[] = [];
		const page = await setup({ boxStyle: 'height: auto;', open: false, warnings });
		await wait(page);
		assert.equal(warnings.length, 1, warnings.join('|'));
		assert.match(warnings[0], /layout "card" has no height/);
		assert.match(warnings[0], /height: 100dvh/);
		// Once for each element: more changes to the page do not repeat it.
		await page.evaluate(() => document.body.append(document.createElement('div')));
		await wait(page);
		assert.equal(warnings.length, 1);
		await page.close();
	});

	test('says when a host has no width', async () => {
		const warnings: string[] = [];
		const page = await setup({ boxStyle: 'width: 0;', open: false, warnings });
		await wait(page);
		assert.match(warnings.join('|'), /has no width/);
		await page.close();
	});

	test('says nothing for a host that is not rendered, or that has a size', async () => {
		for (const boxStyle of ['', 'display: none;']) {
			const warnings: string[] = [];
			const page = await setup({ boxStyle, open: false, warnings });
			await wait(page);
			assert.deepEqual(warnings, [], boxStyle || 'a host with a size');
			await page.close();
		}
	});

	test('waits for CSS that comes late', async () => {
		const warnings: string[] = [];
		const page = await setup({ boxStyle: 'height: auto;', open: false, warnings });
		// The page CSS arrives after the layout, as it can in development.
		await page.waitForTimeout(300);
		await page.addStyleTag({ content: '#box { height: 150px !important; }' });
		await wait(page);
		assert.deepEqual(warnings, []);
		await page.close();
	});
});

describe('the guides show only while the pointer is over the layout', () => {
	const opacity = (page: Page, selector: string) =>
		page.evaluate(
			(sel) =>
				getComputedStyle(
					document.querySelector('gridconfig-devtools')!.shadowRoot!.querySelector(sel)!
				).opacity,
			selector
		);
	const guides = (page: Page) => opacity(page, '.decor .group.guide');
	// The opacity has a short transition.
	const shortly = (page: Page) => page.waitForTimeout(250);

	test('they hide when the pointer goes away, and the tag stays', async () => {
		const page = await setup();
		await shortly(page);
		assert.equal(await guides(page), '1');
		await page.mouse.move(700, 550);
		await shortly(page);
		assert.equal(await guides(page), '0');
		assert.equal(await opacity(page, '.tag'), '1');
		await page.mouse.move(215, 175);
		await shortly(page);
		assert.equal(await guides(page), '1');
		await page.close();
	});

	test('the labels outside the host are in the zone, so they stay while you read them', async () => {
		const page = await setup();
		const label = (await page.locator('gridconfig-devtools .label.row').first().boundingBox())!;
		await page.mouse.move(label.x + 2, label.y + label.height / 2);
		await shortly(page);
		assert.equal(await guides(page), '1');
		await page.close();
	});

	test('the tag shows the number of problems, also when the guides are hidden', async () => {
		const page = await setup({ children: '<div data-grid-area="A">A</div><p>no area</p>' });
		await page.mouse.move(700, 550);
		const badge = page.locator('gridconfig-devtools .tag .count');
		assert.equal(await badge.isVisible(), true);
		// A <p> with no area, and no element for B and C.
		assert.equal(await badge.textContent(), '3');
		assert.match((await badge.getAttribute('class'))!, /warning/);
		await page.close();
	});
});

describe('the state does not outlive the page', () => {
	test('after a reload, the inspector is closed', async () => {
		const page = await setup();
		await page.reload();
		await start(page, false);
		assert.equal(await page.locator('gridconfig-devtools .toggle').isHidden(), true);
		await page.close();
	});

	test('the debug prop opens the inspector, and its removal closes it', async () => {
		const page = await setup({ open: false });
		const toggle = page.locator('gridconfig-devtools .toggle');
		assert.equal(await toggle.isHidden(), true);

		await page.evaluate(() =>
			document.querySelector('[data-grid-host]')!.setAttribute('data-grid-debug', '')
		);
		await settle(page);
		await settle(page);
		assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
		assert.deepEqual(await texts(page, '.tag .step'), ['100x100']);

		await page.evaluate(() =>
			document.querySelector('[data-grid-host]')!.removeAttribute('data-grid-debug')
		);
		await settle(page);
		await settle(page);
		assert.equal(await toggle.isHidden(), true);
		await page.close();
	});
});
