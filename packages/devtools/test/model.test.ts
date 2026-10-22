import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileLayout } from '@gridconfig/core';
import {
	areaBoxes,
	diagnose,
	expandTracks,
	parseAreas,
	parseDebug,
	parseTrackSizes,
	resolve,
	sizeForStep,
	snap,
	splitTop,
	thresholds,
	trackStarts
} from '../src/model.ts';

const compiled = compileLayout(
	`
name: card
areas: |
  A
100x100:
  gap: 4
  areas: |
    A
    B
200x200:
  gap: '{space.2}'
  rows: 50cqw 1fr
  areas: |
    A
    B
600:
  padding: 8
`,
	{ debug: true }
);
const info = compiled.debug!;

test('resolve gives the last matching step for each property', () => {
	assert.equal(resolve(info, 50, 50).step, 0);
	assert.equal(resolve(info, 150, 150).step, 1);
	assert.equal(resolve(info, 150, 150).gap, '4px');
	assert.equal(resolve(info, 250, 250).step, 2);
	assert.equal(resolve(info, 250, 250).gap, 'var(--space-2)');
	assert.equal(resolve(info, 250, 250).rows, '50cqw 1fr');
	// Step 600 matches but sets only padding, so the active step is the last match.
	const wide = resolve(info, 700, 150);
	assert.equal(wide.step, 3);
	assert.equal(wide.padding, '8px');
	assert.equal(wide.gap, '4px');
});

test('resolve for a layout with a mixed-axis cascade', () => {
	const r = resolve(info, 700, 50);
	assert.equal(r.step, 3);
	assert.equal(r.gap, '0');
	assert.deepEqual(r.areas, [['A']]);
});

test('sizeForStep sets the axes that a step sets', () => {
	assert.deepEqual(sizeForStep(info, 2, { w: 10, h: 10 }), { w: 200, h: 200 });
	assert.deepEqual(sizeForStep(info, 3, { w: 10, h: 77 }), { w: 600, h: 77 });
	const base = sizeForStep(info, 0, { w: 500, h: 500 });
	assert.equal(resolve(info, base.w, base.h).step, 0);
	for (let i = 1; i < info.steps.length; i++) {
		const s = sizeForStep(info, i, { w: 1, h: 1 });
		assert.ok(resolve(info, s.w, s.h).step >= i || i === 1);
	}
});

test('thresholds and snap', () => {
	assert.deepEqual(thresholds(info), { w: [100, 200, 600], h: [100, 200] });
	assert.equal(snap(198, [100, 200], 6), 200);
	assert.equal(snap(150, [100, 200], 6), 150);
});

test('splitTop and expandTracks', () => {
	assert.deepEqual(splitTop('1fr minmax(10px, 1fr) [a b] repeat(2, 1fr 2fr)'), [
		'1fr',
		'minmax(10px, 1fr)',
		'[a b]',
		'repeat(2, 1fr 2fr)'
	]);
	assert.deepEqual(expandTracks('1fr 40px'), ['1fr', '40px']);
	assert.deepEqual(expandTracks('repeat(2, 1fr 2fr) [x] auto'), [
		'1fr',
		'2fr',
		'1fr',
		'2fr',
		'auto'
	]);
	assert.equal(expandTracks('repeat(auto-fill, 100px)'), null);
});

test('computed values', () => {
	assert.deepEqual(parseTrackSizes('[a] 100px 50.5px'), [100, 50.5]);
	assert.deepEqual(parseTrackSizes('none'), []);
	assert.deepEqual(parseAreas('"A A" "B ."'), [
		['A', 'A'],
		['B', '.']
	]);
	assert.equal(parseAreas('none'), null);
	assert.deepEqual(
		areaBoxes([
			['A', 'A'],
			['B', '.']
		]),
		[
			{ name: 'A', row: 0, col: 0, rows: 1, cols: 2 },
			{ name: 'B', row: 1, col: 0, rows: 1, cols: 1 }
		]
	);
	assert.deepEqual(trackStarts([10, 20, 30], 5), [0, 15, 40]);
});

test('parseDebug reads the custom property that the compiler wrote', () => {
	const raw = /--gc-debug:\s*("(?:[^"\\]|\\.)*");/.exec(compiled.css)![1];
	assert.deepEqual(parseDebug(` ${raw}`, 'card'), info);
	assert.equal(parseDebug(raw, 'other'), null);
	assert.equal(parseDebug('', 'card'), null);
	assert.equal(parseDebug('"not json"', 'card'), null);
});

test('diagnose finds the common mistakes', () => {
	const base = {
		hostSize: { w: 200, h: 200 },
		hasGrid: true,
		children: [
			{ label: '<div>', area: 'A' },
			{ label: '<p>', area: null },
			{ label: '<div>', area: 'Z' }
		],
		known: ['A', 'B'],
		mapped: ['A', 'B'],
		container: 'size' as const,
		warnings: ['w1']
	};
	const messages = diagnose(base).map((f) => f.message);
	assert.deepEqual(messages, [
		'<p> has no data-grid-area, so the layout does not place it.',
		'Area "Z" is not in the layout. Check the name.',
		'No element uses area "B".',
		'w1'
	]);
	assert.match(
		diagnose({ ...base, children: [], hostSize: { w: 200, h: 0 } })[0].message,
		/no height/
	);
	assert.equal(diagnose({ ...base, hasGrid: false })[0].level, 'error');
	// A host with `inline-size` does not need a height.
	assert.equal(
		diagnose({
			...base,
			children: [],
			hostSize: { w: 200, h: 0 },
			container: 'inline-size',
			mapped: [],
			warnings: []
		}).length,
		0
	);
});

test('sizeForStep goes to the nearest size where a step with a max or a ratio is active', () => {
	const ranged = compileLayout(
		`
name: r
areas: A
..600:
  gap: 1
600..900:
  gap: 2
16/9:
  padding: 1
`,
		{ debug: true }
	).debug!;
	const index = (key: string) => ranged.steps.findIndex((s) => s.key === key);
	// Just inside the max, and the height stays.
	assert.deepEqual(sizeForStep(ranged, index('..600'), { w: 800, h: 500 }), { w: 599, h: 500 });
	assert.deepEqual(sizeForStep(ranged, index('600..900'), { w: 300, h: 500 }), { w: 600, h: 500 });
	// At 599 × 300 the ratio is above 16/9, so that step is active: the nearest size is taller.
	assert.deepEqual(sizeForStep(ranged, index('..600'), { w: 800, h: 300 }), { w: 599, h: 337 });
	const wide = sizeForStep(ranged, index('16/9'), { w: 700, h: 700 });
	assert.equal(resolve(ranged, wide.w, wide.h).step, index('16/9'));
	assert.ok(wide.w / wide.h >= 16 / 9);
	assert.deepEqual(thresholds(ranged), { w: [600, 900], h: [] });
});
