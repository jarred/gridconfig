// `onStepChange` in a real browser: the listener and the event follow the container queries.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { baseCssFor, compileLayout } from '@gridconfig/core';
import { build } from 'esbuild';
import type { Browser, Page } from 'playwright';
import { launch } from './harness.ts';

let browser: Browser;
let script: string;

before(async () => {
	browser = await launch();
	// The runtime entry of core, as a script that puts its exports in `gridconfigRuntime`.
	const result = await build({
		entryPoints: [fileURLToPath(new URL('../../core/src/runtime.ts', import.meta.url))],
		bundle: true,
		format: 'iife',
		globalName: 'gridconfigRuntime',
		write: false,
		logLevel: 'silent'
	});
	script = result.outputFiles[0].text;
});
after(async () => {
	await browser.close();
});

const LAYOUT = compileLayout(`
name: card
breakpoints:
  wide: 300..
areas: A
150:
  gap: 4
wide:
  gap: 8
`);

type Change = [previous: string | null, step: string, layout: string, gap: string];
type Recorded = { changes: Change[]; events: string[]; other: string[] };

async function setup(): Promise<Page> {
	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	await page.setContent(`<!doctype html><html><head><style>
body { margin: 0; }
${baseCssFor(LAYOUT.layer)}
${LAYOUT.css}
#box, #other { width: 100px; }
</style></head><body>
<div id="box"><div data-grid-host="card"><div data-grid-layout="card">
	<div data-grid-area="A"><p><span id="deep">deep</span></p></div>
</div></div></div>
<div id="other"><div data-grid-host="card"><div data-grid-layout="card" id="silent">
	<div data-grid-area="A">no listener</div>
</div></div></div>
</body></html>`);
	await page.addScriptTag({ content: script });
	await page.evaluate(() => {
		type Detail = { step: string; previous: string | null; layout: string; grid: HTMLElement };
		const runtime = (
			globalThis as unknown as {
				gridconfigRuntime: {
					onStepChange(target: Element, listener: (change: Detail) => void): () => void;
				};
			}
		).gridconfigRuntime;
		const recorded: Recorded = { changes: [], events: [], other: [] };
		const state = globalThis as unknown as { recorded: Recorded; stop: () => void };
		state.recorded = recorded;
		// The listener is on an element deep in the grid.
		state.stop = runtime.onStepChange(document.getElementById('deep')!, (change) =>
			// The gap shows that the styles of the new step apply when the listener runs.
			recorded.changes.push([
				change.previous,
				change.step,
				change.layout,
				getComputedStyle(change.grid).columnGap
			])
		);
		document.body.addEventListener('gridstepchange', (event) => {
			const { detail } = event as CustomEvent<Detail>;
			(detail.grid.id === 'silent' ? recorded.other : recorded.events).push(detail.step);
		});
	});
	await frames(page);
	return page;
}

/** Waits until the browser has done its layout and has called the observers. */
const frames = (page: Page) =>
	page.evaluate(
		() =>
			new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))
	);

async function resize(page: Page, id: string, width: number): Promise<Recorded> {
	await page.evaluate(
		([id, width]) => {
			document.getElementById(id as string)!.style.width = `${width}px`;
		},
		[id, width] as const
	);
	await frames(page);
	return page.evaluate(() => (globalThis as unknown as { recorded: Recorded }).recorded);
}

test('the listener gets each change of the active step, with the new styles applied', async () => {
	const page = await setup();
	// The first layout is the start value, not a change.
	assert.deepEqual((await resize(page, 'box', 120)).changes, []);
	assert.deepEqual((await resize(page, 'box', 200)).changes, [['base', '150', 'card', '4px']]);
	// A resize in the same step is not a change.
	assert.equal((await resize(page, 'box', 250)).changes.length, 1);
	assert.deepEqual((await resize(page, 'box', 400)).changes.at(-1), ['150', 'wide', 'card', '8px']);
	// From the largest step to the base in one resize.
	const recorded = await resize(page, 'box', 100);
	assert.deepEqual(recorded.changes.at(-1), ['wide', 'base', 'card', '0px']);
	assert.equal(recorded.changes.length, 3);
	await page.close();
});

test('the grid element gets an event that bubbles, and only a grid with a listener gets it', async () => {
	const page = await setup();
	await resize(page, 'box', 200);
	// The second grid has the same layout and no listener.
	await resize(page, 'other', 200);
	const recorded = await resize(page, 'box', 400);
	assert.deepEqual(recorded.events, ['150', 'wide']);
	assert.deepEqual(recorded.other, []);
	await page.close();
});

test('the result of onStepChange stops the calls and the events', async () => {
	const page = await setup();
	await resize(page, 'box', 200);
	await page.evaluate(() => (globalThis as unknown as { stop: () => void }).stop());
	const recorded = await resize(page, 'box', 400);
	assert.equal(recorded.changes.length, 1);
	assert.deepEqual(recorded.events, ['150']);
	await page.close();
});

test('readStep gives each kind of key as it is written, in each engine', async () => {
	// WebKit puts empty comments between some tokens when it reads a custom property back.
	const layout = compileLayout(`
name: keys
container: size
areas: X
..300:
  gap: 1
300..600x..400:
  gap: 2
300..600 ..3/4:
  padding: 1
`);
	const page = await browser.newPage();
	await page.setContent(`<style>
body { margin: 0; }
${baseCssFor(layout.layer)}
${layout.css}
#box { width: 100px; height: 100px; }
</style>
<div id="box" data-grid-host="keys"><div data-grid-layout="keys"><div data-grid-area="X">x</div></div></div>`);
	await page.addScriptTag({ content: script });
	for (const [w, h, step] of [
		[200, 300, '..300'],
		[400, 300, '300..600x..400'],
		[400, 600, '300..600 ..3/4'],
		[700, 700, 'base']
	] as const) {
		const read = await page.evaluate(
			([w, h]) => {
				const box = document.getElementById('box')!;
				box.style.width = `${w}px`;
				box.style.height = `${h}px`;
				const runtime = (
					globalThis as unknown as { gridconfigRuntime: { readStep(grid: Element): string } }
				).gridconfigRuntime;
				return runtime.readStep(document.querySelector('[data-grid-layout="keys"]')!);
			},
			[w, h] as const
		);
		assert.equal(read, step, `${w}x${h}`);
	}
	await page.close();
});
