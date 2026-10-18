import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { CompileOptions } from '@gridconfig/core';
import type { Browser } from 'playwright';
import { launch, loadFixtures, mount, resize, verify } from './harness.ts';

let browser: Browser;
before(async () => {
	browser = await launch();
});
after(async () => {
	await browser.close();
});

// Every fixture must give the same result with a layer and without one.
const MODES: [string, CompileOptions][] = [
	['layered', {}],
	['unlayered', { layer: false }],
	['custom layer', { layer: 'components' }]
];

for (const [mode, options] of MODES)
	for (const fixture of loadFixtures(options)) {
		describe(`${fixture.name} (${mode})`, () => {
			test(fixture.description || fixture.name, async () => {
				const page = await mount(browser, fixture.compiled, fixture);
				const failures: string[] = [];

				// Forward and then backward: a size must give the same result in any order.
				const order = [...fixture.cases, ...[...fixture.cases].reverse()];
				for (const expected of order) {
					const measured = await resize(page, expected.size);
					for (const p of verify(fixture.compiled.areas, expected, measured))
						failures.push(`${expected.size.join('x')}: ${p}`);
				}
				await page.close();
				assert.deepEqual([...new Set(failures)], []);
			});
		});
	}
