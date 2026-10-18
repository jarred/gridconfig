import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseCssFor, compileLayout } from '@gridconfig/core';
import type { CompileOptions, CompiledLayout } from '@gridconfig/core';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../../spec/fixtures');

/** What a fixture expects at one container size. Omitted keys are not checked. */
export type Case = {
	size: [number, number];
	/** The active area map: one string per row, `.` for an empty cell. */
	map: string[];
	gap?: string;
	padding?: string;
	/** Used track sizes in px. */
	cols?: number[];
	rows?: number[];
};

export type Fixture = {
	name: string;
	source: string;
	description: string;
	vars: Record<string, string>;
	pageCss: string;
	areaClasses: string;
	cases: Case[];
	compiled: CompiledLayout;
};

export function loadFixtures(options: CompileOptions = {}): Fixture[] {
	return readdirSync(FIXTURES)
		.filter((f) => f.endsWith('.grid'))
		.sort()
		.map((file) => {
			const name = basename(file, '.grid');
			const source = readFileSync(join(FIXTURES, file), 'utf8');
			const meta = JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'));
			return {
				name,
				source,
				description: meta.description ?? '',
				vars: meta.vars ?? {},
				pageCss: meta.pageCss ?? '',
				areaClasses: meta.areaClasses ?? '',
				cases: meta.cases,
				compiled: compileLayout(source, { defaultName: name, ...options })
			};
		});
}

export async function launch(): Promise<Browser> {
	return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
}

/** A page with one layout inside a box of a given size. */
export async function mount(
	browser: Browser,
	compiled: CompiledLayout,
	extra: {
		vars?: Record<string, string>;
		pageCss?: string;
		areaClasses?: string;
		layoutClass?: string;
		/** Page CSS that comes before the GridConfig CSS. */
		head?: string;
	} = {}
): Promise<Page> {
	const page = await browser.newPage();
	const vars = Object.entries(extra.vars ?? {})
		.map(([k, v]) => `${k}: ${v};`)
		.join(' ');
	const areas = compiled.areas
		.map((a) => `<div data-grid-area="${a}" class="${extra.areaClasses ?? ''}">${a}</div>`)
		.join('');
	await page.setContent(`<!doctype html>
<html><head><style>
:root { ${vars} }
body { margin: 0; }
${extra.head ?? ''}
${baseCssFor(compiled.layer)}
${compiled.css}
${extra.pageCss ?? ''}
</style></head><body>
<div id="box" style="width: 100px; height: 100px">
	<div data-grid-host="${compiled.name}"><div data-grid-layout="${compiled.name}" class="${extra.layoutClass ?? ''}">${areas}</div></div>
</div></body></html>`);
	return page;
}

export type Measured = {
	cols: number[];
	rows: number[];
	columnGap: string;
	rowGap: string;
	padding: string;
	areas: { name: string; display: string; x: number; y: number; width: number; height: number }[];
};

export async function resize(page: Page, [w, h]: [number, number]): Promise<Measured> {
	await page.evaluate(
		([w, h]) => {
			const box = document.getElementById('box')!;
			box.style.width = `${w}px`;
			box.style.height = `${h}px`;
		},
		[w, h]
	);
	// Read layout synchronously after the style change.
	return page.evaluate(() => {
		const grid = document.querySelector('[data-grid-layout]') as HTMLElement;
		const gs = getComputedStyle(grid);
		const px = (v: string) =>
			v
				.split(' ')
				.filter((t) => t && t !== 'none')
				.map(parseFloat);
		const origin = grid.getBoundingClientRect();
		return {
			cols: px(gs.gridTemplateColumns),
			rows: px(gs.gridTemplateRows),
			columnGap: gs.columnGap,
			rowGap: gs.rowGap,
			padding: gs.paddingTop,
			areas: [...grid.children].map((el) => {
				const r = el.getBoundingClientRect();
				return {
					name: (el as HTMLElement).dataset.gridArea!,
					display: getComputedStyle(el).display,
					x: r.left - origin.left,
					y: r.top - origin.top,
					width: r.width,
					height: r.height
				};
			})
		};
	});
}

const EPSILON = 0.51;
const close = (a: number, b: number) => Math.abs(a - b) <= EPSILON;
const list = (n: number[]) => `[${n.map((v) => +v.toFixed(2)).join(', ')}]`;

/** Returns a list of problems. An empty list means the browser agrees with the expectation. */
export function verify(all: string[], expected: Case, m: Measured): string[] {
	const problems: string[] = [];
	const grid = expected.map.map((row) => row.split(/\s+/));
	const present = new Set(grid.flat());
	present.delete('.');

	if (expected.gap !== undefined && (m.columnGap !== expected.gap || m.rowGap !== expected.gap))
		problems.push(`gap is ${m.columnGap} / ${m.rowGap}, expected ${expected.gap}`);
	if (expected.padding !== undefined && m.padding !== expected.padding)
		problems.push(`padding is ${m.padding}, expected ${expected.padding}`);
	for (const axis of ['cols', 'rows'] as const) {
		const want = expected[axis];
		if (want && (want.length !== m[axis].length || want.some((v, i) => !close(v, m[axis][i]))))
			problems.push(`${axis} are ${list(m[axis])}, expected ${list(want)}`);
	}

	const padding = parseFloat(m.padding);
	const gap = parseFloat(m.columnGap);
	const rowGap = parseFloat(m.rowGap);
	const start = (tracks: number[], index: number, g: number) =>
		tracks.slice(0, index).reduce((sum, t) => sum + t + g, 0);

	for (const name of all) {
		const found = m.areas.find((a) => a.name === name);
		if (!found) {
			problems.push(`${name} is not in the page`);
			continue;
		}
		const shown = found.display !== 'none';
		if (shown !== present.has(name)) {
			problems.push(
				`${name} is ${shown ? 'visible' : 'hidden'}, expected ${present.has(name) ? 'visible' : 'hidden'}`
			);
			continue;
		}
		if (!shown) continue;

		const cells: [number, number][] = [];
		grid.forEach((row, r) => row.forEach((c, i) => c === name && cells.push([r, i])));
		const rs = cells.map(([r]) => r);
		const cs = cells.map(([, c]) => c);
		const [r0, r1, c0, c1] = [Math.min(...rs), Math.max(...rs), Math.min(...cs), Math.max(...cs)];
		const x = padding + start(m.cols, c0, gap);
		const y = padding + start(m.rows, r0, rowGap);
		const width = start(m.cols, c1 + 1, gap) - start(m.cols, c0, gap) - gap;
		const height = start(m.rows, r1 + 1, rowGap) - start(m.rows, r0, rowGap) - rowGap;
		const got = [found.x, found.y, found.width, found.height];
		const want = [x, y, width, height];
		if (got.some((v, i) => !close(v, want[i])))
			problems.push(`${name} is at ${list(got)} (x, y, w, h), expected ${list(want)}`);
	}
	return problems;
}
