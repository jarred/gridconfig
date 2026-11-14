// `onStepChange` in jsdom. jsdom has no layout, so the test gives it a ResizeObserver that the
// test calls by hand, and sets `--grid-step` in an inline style. The browser tests in
// packages/conformance check the same function with real container queries.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { STEP_EVENT, onStepChange } from '../src/step.ts';
import type { StepChange } from '../src/step.ts';

function page() {
	const dom = new JSDOM(`<!doctype html><body>
		<div data-grid-host="card" id="host"><div data-grid-layout="card" id="grid" style="--grid-step: base">
			<p data-grid-area="A"><span id="deep">a</span></p>
		</div></div>
		<div data-grid-host="other"><div data-grid-layout="other" id="other" style="--grid-step: base"></div></div>
		<p id="outside">no grid</p>
	</body>`);
	const { document } = dom.window;
	const observed = new Set<Element>();
	let callback: ResizeObserverCallback = () => {};
	let observers = 0;
	dom.window.ResizeObserver = class {
		constructor(cb: ResizeObserverCallback) {
			callback = cb;
			observers++;
		}
		observe(el: Element) {
			observed.add(el);
		}
		unobserve(el: Element) {
			observed.delete(el);
		}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	const get = (id: string) => document.getElementById(id)!;
	return {
		get,
		observed,
		observers: () => observers,
		/** Sets the step of a grid, as a container query does, and tells the observer about its host. */
		resize(id: string, step?: string) {
			const grid = get(id);
			if (step !== undefined) grid.style.setProperty('--grid-step', step);
			const target = grid.parentElement!;
			if (observed.has(target))
				callback([{ target } as unknown as ResizeObserverEntry], {} as ResizeObserver);
		}
	};
}

const steps = (changes: StepChange[]) => changes.map((c) => `${c.previous}>${c.step}`);

test('calls the listener when the step changes, and only then', () => {
	const p = page();
	const changes: StepChange[] = [];
	onStepChange(p.get('grid'), (c) => changes.push(c));
	// The first reading is the start value.
	p.resize('grid');
	assert.equal(changes.length, 0);
	// A resize in the same step is not a change.
	p.resize('grid');
	p.resize('grid', '600');
	p.resize('grid');
	p.resize('grid', 'wide short');
	assert.deepEqual(steps(changes), ['base>600', '600>wide short']);
	assert.equal(changes[0].layout, 'card');
	assert.equal(changes[0].grid, p.get('grid'));
});

test('the target can be the grid, its host, or an element in the grid', () => {
	const p = page();
	const seen: string[] = [];
	for (const id of ['grid', 'host', 'deep']) onStepChange(p.get(id), () => seen.push(id));
	// All three watch one host, with one observer.
	assert.equal(p.observed.size, 1);
	assert.equal(p.observers(), 1);
	p.resize('grid');
	p.resize('grid', '600');
	assert.deepEqual(seen, ['grid', 'host', 'deep']);
	assert.throws(() => onStepChange(p.get('outside'), () => {}), /not in a grid/);
});

test('the grid element gets an event that bubbles', () => {
	const p = page();
	const events: StepChange[] = [];
	p.get('host').parentElement!.addEventListener(STEP_EVENT, (e) =>
		events.push((e as CustomEvent<StepChange>).detail)
	);
	// With no listener, a call only turns the events on.
	const stop = onStepChange(p.get('grid'));
	p.resize('grid');
	p.resize('grid', '600');
	assert.deepEqual(steps(events), ['base>600']);
	// A grid with no call gets no events.
	p.resize('other', '600');
	assert.equal(events.length, 1);
	stop();
	p.resize('grid', '900');
	assert.equal(events.length, 1);
});

test('immediate gives the current step one time', () => {
	const p = page();
	const changes: StepChange[] = [];
	onStepChange(p.get('grid'), (c) => changes.push(c), { immediate: true });
	assert.deepEqual(steps(changes), ['null>base']);
	p.resize('grid');
	p.resize('grid', '600');
	assert.deepEqual(steps(changes), ['null>base', 'base>600']);
});

test('the result stops one listener, and the last one stops the observation', () => {
	const p = page();
	const seen: string[] = [];
	const listener = (c: StepChange) => seen.push(c.step);
	// The same function two times is two listeners.
	const first = onStepChange(p.get('grid'), listener);
	const second = onStepChange(p.get('grid'), listener);
	p.resize('grid');
	p.resize('grid', '600');
	assert.deepEqual(seen, ['600', '600']);
	first();
	first(); // A second call does nothing.
	p.resize('grid', '900');
	assert.deepEqual(seen, ['600', '600', '900']);
	assert.equal(p.observed.size, 1);
	second();
	assert.equal(p.observed.size, 0);
});

test('a layout with no CSS yet has no step, and gives no change', () => {
	const p = page();
	const changes: StepChange[] = [];
	p.get('grid').style.removeProperty('--grid-step');
	onStepChange(p.get('grid'), (c) => changes.push(c), { immediate: true });
	p.resize('grid');
	assert.deepEqual(changes, []);
	// The CSS arrives: this is the start value. The next one is a change.
	p.resize('grid', 'base');
	p.resize('grid', '600');
	assert.deepEqual(steps(changes), ['base>600']);
});

test('with no ResizeObserver, nothing happens', () => {
	const dom = new JSDOM('<div data-grid-layout="x" id="g"></div>');
	const stop = onStepChange(dom.window.document.getElementById('g')!, () => {});
	stop();
});
