// These tests record how the compiled CSS interacts with other CSS on the page.
// They are not rules of the spec. They show the current behavior, so that a change is a choice.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { compileLayout, type CompileOptions } from '@gridconfig/core';
import type { Browser } from 'playwright';
import { launch, mount, resize } from './harness.ts';

let browser: Browser;
before(async () => {
	browser = await launch();
});
after(async () => {
	await browser.close();
});

/** B is visible below 300px and hidden from 300px. The layout has a gap and a padding at 300px. */
const SOURCE = [
	'name: probe',
	'areas: A B',
	'300:',
	'  gap: 10',
	'  padding: 16',
	'  areas: A'
].join('\n');

type Measured = Awaited<ReturnType<typeof resize>>;

async function measure(
	extra: Parameters<typeof mount>[2],
	options: CompileOptions = {},
	size: [number, number] = [400, 100]
): Promise<Measured> {
	const page = await mount(browser, compileLayout(SOURCE, options), extra);
	const measured = await resize(page, size);
	await page.close();
	return measured;
}

const display = (m: Measured, area: string) => m.areas.find((a) => a.name === area)!.display;

// Hiding works the same in both modes, because hide rules are never in the layer.
for (const [mode, options] of [
	['layered', {}],
	['unlayered', { layer: false }]
] as [string, CompileOptions][]) {
	describe(`hidden areas against page CSS (${mode})`, () => {
		test('a normal rule cannot show a hidden area, whatever its specificity', async () => {
			const m = await measure(
				{ pageCss: 'div#box div[data-grid-layout] > div[data-grid-area] { display: flex; }' },
				options
			);
			assert.equal(display(m, 'B'), 'none');
		});

		test('an !important rule with lower specificity cannot show it', async () => {
			const m = await measure(
				{ pageCss: '[data-grid-area] { display: flex !important; }' },
				options
			);
			assert.equal(display(m, 'B'), 'none');
		});

		test('an !important rule with higher specificity can show it', async () => {
			const m = await measure(
				{
					pageCss: 'div[data-grid-layout] > div[data-grid-area="B"] { display: flex !important; }'
				},
				options
			);
			assert.equal(display(m, 'B'), 'flex');
		});

		test('an !important rule in a cascade layer can show it, with any specificity', async () => {
			const m = await measure(
				{ pageCss: '@layer utilities { [data-grid-area] { display: flex !important; } }' },
				options
			);
			assert.equal(display(m, 'B'), 'flex');
		});

		test('a normal rule in a cascade layer cannot show it', async () => {
			const m = await measure(
				{ pageCss: '@layer utilities { [data-grid-area] { display: flex; } }' },
				options
			);
			assert.equal(display(m, 'B'), 'none');
		});
	});
}

describe('the grid element against page CSS, layered (default)', () => {
	test('an unlayered rule on the grid element overrides gap', async () => {
		const m = await measure({ pageCss: '[data-grid-layout] { gap: 20px; }' });
		assert.deepEqual([m.columnGap, m.rowGap], ['20px', '20px']);
	});

	test('a utility in a later layer overrides gap, when the layer is declared after ours', async () => {
		const m = await measure({
			layoutClass: 'gap-4',
			head: '@layer gridconfig, utilities;',
			pageCss: '@layer utilities { .gap-4 { gap: 1rem; } }'
		});
		assert.equal(m.columnGap, '16px');
	});

	test('a utility in a layer that comes first in the layer order is overridden', async () => {
		const m = await measure({
			layoutClass: 'gap-4',
			head: '@layer utilities, gridconfig;',
			pageCss: '@layer utilities { .gap-4 { gap: 1rem; } }'
		});
		assert.equal(m.columnGap, '10px');
	});

	test('a utility overrides padding with the same layer order', async () => {
		const m = await measure({
			layoutClass: 'p-4',
			head: '@layer gridconfig, utilities;',
			pageCss: '@layer utilities { .p-4 { padding: 1rem; } }'
		});
		assert.equal(m.padding, '16px');
		const n = await measure({
			layoutClass: 'p-4',
			head: '@layer gridconfig, utilities;',
			pageCss: '@layer utilities { .p-4 { padding: 2rem; } }'
		});
		assert.equal(n.padding, '32px');
	});

	test('a layer declared first in the head gives Tailwind-style order', async () => {
		// Tailwind declares theme, base, components, utilities. Our layer is new, so it comes last.
		const m = await measure({
			layoutClass: 'gap-4',
			head: '@layer theme, base, components, utilities;',
			pageCss: '@layer utilities { .gap-4 { gap: 1rem; } }'
		});
		assert.equal(m.columnGap, '10px');
	});

	test('layer: "components" lets a Tailwind utility win', async () => {
		const m = await measure(
			{
				layoutClass: 'gap-4',
				head: '@layer theme, base, components, utilities;',
				pageCss: '@layer utilities { .gap-4 { gap: 1rem; } }'
			},
			{ layer: 'components' }
		);
		assert.equal(m.columnGap, '16px');
	});
});

describe('the grid element against page CSS, unlayered', () => {
	test('a utility class in a cascade layer does NOT override gap', async () => {
		const m = await measure(
			{ layoutClass: 'gap-4', pageCss: '@layer utilities { .gap-4 { gap: 1rem; } }' },
			{ layer: false }
		);
		assert.equal(m.columnGap, '10px');
	});
});

describe('resets', () => {
	const reset = '* { padding: 0; }';

	test('unlayered, a reset after the base CSS removes the padding', async () => {
		const m = await measure({ pageCss: reset }, { layer: false });
		assert.equal(m.padding, '0px');
	});

	test('unlayered, the same reset before the base CSS does not', async () => {
		const m = await measure({ head: reset }, { layer: false });
		assert.equal(m.padding, '16px');
	});

	test('layered, an unlayered reset removes the padding in either order', async () => {
		assert.equal((await measure({ pageCss: reset })).padding, '0px');
		assert.equal((await measure({ head: reset })).padding, '0px');
	});

	test('layered, a reset in a layer that comes before ours does not', async () => {
		const m = await measure({
			head: '@layer base, gridconfig;',
			pageCss: `@layer base { ${reset} }`
		});
		assert.equal(m.padding, '16px');
	});

	test('layered, a reset in a layer that comes after ours removes the padding', async () => {
		const m = await measure({
			head: '@layer gridconfig, base;',
			pageCss: `@layer base { ${reset} }`
		});
		assert.equal(m.padding, '0px');
	});
});

/** B has flow below 300px, and `none` from 300px. */
const FLOW_SOURCE = [
	'name: probe',
	'areas: A B',
	'flow:',
	'  B: column center',
	'300:',
	'  flow:',
	'    B: none'
].join('\n');

async function flowStyles(
	extra: Parameters<typeof mount>[2],
	options: CompileOptions,
	size: [number, number]
) {
	const page = await mount(browser, compileLayout(FLOW_SOURCE, options), extra);
	const measured = await resize(page, size);
	await page.close();
	return measured.areas.find((a) => a.name === 'B')!.styles;
}

/** A page rule in an earlier layer. The browser blockifies a grid item, so inline-flex computes to flex. */
const EARLIER_LAYER = {
	head: '@layer base, gridconfig;',
	pageCss:
		'@layer base { [data-grid-area="B"] { display: inline-flex; flex-direction: row-reverse; } }'
};

describe('flow against page CSS, layered (default)', () => {
	test('an unlayered page rule overrides flow, with any specificity', async () => {
		const s = await flowStyles({ pageCss: '[data-grid-area] { display: grid; }' }, {}, [100, 100]);
		assert.equal(s.display, 'grid');
	});

	test('flow overrides a rule in an earlier layer', async () => {
		const s = await flowStyles(EARLIER_LAYER, {}, [100, 100]);
		assert.deepEqual([s.display, s.flexDirection], ['flex', 'column']);
	});

	test('none gives back the value from an earlier layer', async () => {
		const s = await flowStyles(EARLIER_LAYER, {}, [400, 100]);
		assert.deepEqual(
			[s.display, s.flexDirection, s.justifyContent],
			['flex', 'row-reverse', 'normal']
		);
	});
});

describe('flow against page CSS, unlayered', () => {
	const options = { layer: false };

	test('flow overrides an unlayered page rule with a lower specificity', async () => {
		const s = await flowStyles(
			{ pageCss: '[data-grid-area] { display: grid; }' },
			options,
			[100, 100]
		);
		assert.equal(s.display, 'flex');
	});

	test('none gives back the value from a page layer: unlayered CSS is the last layer', async () => {
		const s = await flowStyles(EARLIER_LAYER, options, [400, 100]);
		assert.deepEqual([s.display, s.flexDirection], ['flex', 'row-reverse']);
	});

	test('none also skips an unlayered page rule with a lower specificity', async () => {
		const s = await flowStyles(
			{ pageCss: '[data-grid-area] { display: grid; }' },
			options,
			[400, 100]
		);
		assert.equal(s.display, 'block');
	});
});
