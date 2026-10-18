// The inspector in a real browser: what it draws, and what the select and the handles do to the host.
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
};

/** A page with the layout in a 150 x 150 box at (140, 100), and the inspector installed. */
async function setup(options: Options = {}): Promise<Page> {
	const compiled = compileLayout(SOURCE, { debug: options.debug ?? true });
	const children =
		options.children ?? compiled.areas.map((a) => `<div data-grid-area="${a}">${a}</div>`).join('');
	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	const warnings = options.warnings;
	if (warnings) page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
	// A page from a real origin, because a blank page cannot use sessionStorage.
	const html = `<!doctype html><html><head><style>
body { margin: 0; }
${baseCssFor(compiled.layer)}
${compiled.css}
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
	await page.addScriptTag({ content: script });
	if (options.open !== false)
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

describe('pop out', () => {
	const popButton = (page: Page) => page.locator('gridconfig-devtools .popout');
	const state = (page: Page) =>
		page.evaluate(() => {
			const host = document.querySelector<HTMLElement>('[data-grid-host]')!;
			const r = host.getBoundingClientRect();
			return {
				open: host.matches(':popover-open'),
				attr: host.getAttribute('popover'),
				style: host.getAttribute('style') ?? '',
				cx: Math.round(r.left + r.width / 2),
				cy: Math.round(r.top + r.height / 2),
				w: Math.round(r.width),
				h: Math.round(r.height),
				parent: host.parentElement?.id
			};
		});

	test('puts the real host in the middle of the screen, and keeps it in the DOM', async () => {
		const page = await setup();
		await popButton(page).click();
		await settle(page);
		const s = await state(page);
		assert.equal(s.open, true);
		assert.deepEqual([s.cx, s.cy], [400, 300]);
		assert.deepEqual([s.w, s.h], [150, 150]);
		assert.equal(s.parent, 'box');
		// The host is above the scrim, and the page below it cannot get clicks.
		const hit = await page.evaluate(() => {
			const e = document.elementFromPoint(400, 300);
			return e?.closest('[data-grid-host]') ? 'host' : e?.localName;
		});
		assert.equal(hit, 'host');
		const corner = await page.evaluate(() => document.elementFromPoint(5, 5)?.localName);
		assert.equal(corner, 'gridconfig-devtools');
		await page.close();
	});

	test('an ancestor with a transform and overflow: hidden does not move or clip it', async () => {
		const page = await setup({
			wrap: '<div style="position:absolute; left:20px; top:20px; width:60px; height:60px; overflow:hidden; transform: translateX(30px)">__BOX__</div>',
			boxStyle: 'left: 0; top: 0;'
		});
		await popButton(page).click();
		await settle(page);
		const s = await state(page);
		assert.deepEqual([s.cx, s.cy], [400, 300]);
		await page.close();
	});

	test('Esc puts the host back, with its natural size and its own inline style', async () => {
		const page = await setup();
		await page.evaluate(() => {
			document.querySelector<HTMLElement>('[data-grid-host]')!.style.opacity = '0.9';
		});
		const before = await state(page);
		await popButton(page).click();
		await settle(page);
		await page.keyboard.press('Escape');
		await settle(page);
		const after = await state(page);
		assert.equal(after.open, false);
		assert.equal(after.attr, null);
		assert.equal(after.style, before.style);
		assert.deepEqual([after.w, after.h], [150, 150]);
		await page.close();
	});

	test('a click on the scrim puts the host back', async () => {
		const page = await setup();
		await popButton(page).click();
		await settle(page);
		await page.mouse.click(5, 5);
		await settle(page);
		assert.equal((await state(page)).open, false);
		await page.close();
	});

	test('the host keeps the padding, border, colour and overflow that the page gives it', async () => {
		const read = (page: Page) =>
			page.evaluate(() => {
				const cs = getComputedStyle(document.querySelector('[data-grid-host]')!);
				return [cs.paddingTop, cs.borderTopWidth, cs.borderTopStyle, cs.color, cs.overflowX];
			});
		for (const css of [
			'',
			'padding: 5px; border: 2px dotted red; color: rgb(10, 20, 30); overflow: hidden;'
		]) {
			const page = await setup({ boxStyle: '' });
			await page.addStyleTag({ content: `[data-grid-host] { ${css} }` });
			await settle(page);
			const before = await read(page);
			await popButton(page).click();
			await settle(page);
			assert.deepEqual(await read(page), before, css || 'no styles');
			await page.close();
		}
	});

	test('a transparent host gets the background behind it, and a host with a background keeps it', async () => {
		const bg = (page: Page) =>
			page.evaluate(
				() => getComputedStyle(document.querySelector('[data-grid-host]')!).backgroundColor
			);
		const page = await setup();
		await page.addStyleTag({ content: 'body { background: rgb(1, 2, 3); }' });
		await popButton(page).click();
		await settle(page);
		assert.equal(await bg(page), 'rgb(1, 2, 3)');
		await page.close();

		const own = await setup();
		await own.addStyleTag({ content: '[data-grid-host] { background: rgb(9, 8, 7); }' });
		await popButton(own).click();
		await settle(own);
		assert.equal(await bg(own), 'rgb(9, 8, 7)');
		await own.close();
	});

	test('a host with no height gets a size when it pops out', async () => {
		const page = await setup({ boxStyle: 'height: auto;' });
		assert.ok((await texts(page, '.finding')).some((t) => /no height/.test(t)));
		await popButton(page).click();
		await settle(page);
		const s = await state(page);
		assert.deepEqual([s.w, s.h], [480, 360]);
		assert.equal(
			(await texts(page, '.finding')).some((t) => /no height/.test(t)),
			false
		);
		await page.close();
	});

	test('a resize stays inside the viewport, and resizing does not move the page', async () => {
		const page = await setup();
		const boxBefore = await page.evaluate(() => {
			const r = document.querySelector('#box')!.getBoundingClientRect();
			return [r.left, r.top, r.width, r.height];
		});
		await popButton(page).click();
		await settle(page);
		const dot = (await page.locator('gridconfig-devtools .handle.dot').boundingBox())!;
		const x = dot.x + dot.width / 2;
		const y = dot.y + dot.height / 2;
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x + 900, y + 900, { steps: 4 });
		await page.mouse.up();
		await settle(page);
		const s = await state(page);
		assert.deepEqual([s.w, s.h], [800 - 160, 600 - 160]);
		assert.deepEqual([s.cx, s.cy], [400, 300]);
		const boxAfter = await page.evaluate(() => {
			const r = document.querySelector('#box')!.getBoundingClientRect();
			return [r.left, r.top, r.width, r.height];
		});
		assert.deepEqual(boxAfter, boxBefore);
		await page.close();
	});

	test('closing the inspector puts the host back', async () => {
		const page = await setup();
		await popButton(page).click();
		await settle(page);
		await page.evaluate(() =>
			(
				globalThis as unknown as { __gridconfigDevtools: { close(): void } }
			).__gridconfigDevtools.close()
		);
		await settle(page);
		const s = await state(page);
		assert.equal(s.open, false);
		assert.deepEqual([s.w, s.h], [150, 150]);
		await page.close();
	});

	test('a host that the page replaces pops out again, with the size it had', async () => {
		const page = await setup();
		await popButton(page).click();
		await settle(page);
		await page.locator('gridconfig-devtools select').selectOption('2');
		await settle(page);
		await page.evaluate(() => {
			const old = document.querySelector('[data-grid-host]')!;
			const fresh = document.createElement('div');
			fresh.setAttribute('data-grid-host', 'card');
			fresh.innerHTML = old.innerHTML;
			old.replaceWith(fresh);
		});
		await settle(page);
		const s = await state(page);
		assert.equal(s.open, true);
		assert.deepEqual([s.w, s.h], [200, 200]);
		assert.deepEqual([s.cx, s.cy], [400, 300]);
		await page.close();
	});
});

describe('a drag always ends', () => {
	/** Puts the mouse on the corner handle and returns its position. Records the pointer id. */
	async function grab(page: Page) {
		await page.evaluate(() => {
			window.addEventListener(
				'pointerdown',
				(e) => ((globalThis as unknown as { pid: number }).pid = e.pointerId),
				true
			);
		});
		const dot = (await page.locator('gridconfig-devtools .handle.dot').boundingBox())!;
		const x = dot.x + dot.width / 2;
		const y = dot.y + dot.height / 2;
		await page.mouse.move(x, y);
		return { x, y };
	}
	const dotEvent = (page: Page, script: string) =>
		page.evaluate((code) => {
			const dot = document
				.querySelector('gridconfig-devtools')!
				.shadowRoot!.querySelector<HTMLElement>('.handle.dot')!;
			const pid = (globalThis as unknown as { pid: number }).pid;
			new Function('dot', 'pid', code)(dot, pid);
		}, script);

	test('a right click on the handle does not start a drag', async () => {
		const page = await setup();
		const { x, y } = await grab(page);
		await page.mouse.down({ button: 'right' });
		await page.mouse.move(x + 40, y + 40, { steps: 4 });
		await page.mouse.up({ button: 'right' });
		await page.mouse.move(x + 60, y + 60, { steps: 4 });
		await settle(page);
		assert.deepEqual(await hostSize(page), [150, 150]);
		await page.close();
	});

	test('when the window loses focus', async () => {
		const page = await setup();
		const { x, y } = await grab(page);
		await page.mouse.down();
		await page.mouse.move(x + 20, y + 20, { steps: 2 });
		await page.evaluate(() => window.dispatchEvent(new Event('blur')));
		await page.mouse.move(x + 60, y + 60, { steps: 4 });
		await page.mouse.up();
		await settle(page);
		assert.deepEqual(await hostSize(page), [170, 170]);
		await page.close();
	});

	test('when a move comes with no button down (the pointerup went elsewhere)', async () => {
		const page = await setup();
		const { x, y } = await grab(page);
		await page.mouse.down();
		await page.mouse.move(x + 20, y + 20, { steps: 2 });
		await dotEvent(
			page,
			"dot.dispatchEvent(new PointerEvent('pointermove', { pointerId: pid, isPrimary: true, buttons: 0, clientX: 0, clientY: 0, bubbles: true }))"
		);
		await page.mouse.move(x + 60, y + 60, { steps: 4 });
		await settle(page);
		assert.deepEqual(await hostSize(page), [170, 170]);
		await page.mouse.up();
		await page.close();
	});

	test('when the handle loses pointer capture', async () => {
		const page = await setup();
		const { x, y } = await grab(page);
		await page.mouse.down();
		await page.mouse.move(x + 20, y + 20, { steps: 2 });
		await dotEvent(page, 'dot.releasePointerCapture(pid)');
		await settle(page);
		// Back over the handle, with the button still down: no capture, so no drag.
		const dot = (await page.locator('gridconfig-devtools .handle.dot').boundingBox())!;
		await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2, { steps: 2 });
		await page.mouse.move(dot.x + 40, dot.y + 40, { steps: 4 });
		await settle(page);
		assert.deepEqual(await hostSize(page), [170, 170]);
		await page.mouse.up();
		await page.close();
	});

	test('when Esc puts a popped host back during a drag', async () => {
		const page = await setup();
		await page.locator('gridconfig-devtools .popout').click();
		await settle(page);
		const { x, y } = await grab(page);
		await page.mouse.down();
		await page.mouse.move(x + 20, y + 20, { steps: 2 });
		await page.keyboard.press('Escape');
		await page.mouse.move(x + 60, y + 60, { steps: 4 });
		await page.mouse.up();
		await settle(page);
		assert.deepEqual(await hostSize(page), [150, 150]);
		await page.close();
	});

	test('a host with padding and a border does not jump when a drag starts', async () => {
		const page = await setup();
		await page.addStyleTag({ content: '[data-grid-host] { padding: 10px; border: 2px solid; }' });
		await settle(page);
		// The host is 100% of the 150px box, and content-box: padding and border are outside.
		assert.equal((await texts(page, '.size'))[0], '150 × 150');
		assert.deepEqual(await hostSize(page), [174, 174]);
		const { x, y } = await grab(page);
		await page.mouse.down();
		await page.mouse.move(x + 10, y, { steps: 2 });
		await page.mouse.up();
		await settle(page);
		assert.deepEqual(await hostSize(page), [184, 174]);
		assert.equal((await texts(page, '.size'))[0], '160 × 150');
		await page.close();
	});

	test('the select gives a host with padding the content size of the step', async () => {
		const page = await setup();
		await page.addStyleTag({ content: '[data-grid-host] { padding: 10px; }' });
		await page.locator('gridconfig-devtools select').selectOption('2');
		await settle(page);
		assert.deepEqual(await hostSize(page), [220, 220]);
		assert.equal(await page.locator('gridconfig-devtools select').inputValue(), '2');
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
