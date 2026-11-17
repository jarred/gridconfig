// The active step, for JavaScript. A step changes when the size of the host crosses a query, so
// one ResizeObserver watches the hosts and reads `--grid-step` when a host changes size. This
// module has no YAML parser.
import { STEP_PROPERTY, attributes } from './attributes.ts';

/** The name of the event that a grid element gets when its active step changes. */
export const STEP_EVENT = 'gridstepchange';

export type StepChange = {
	/** The active step: the query key of the step, or `base`. */
	step: string;
	/** The step before this one. `null` for the first call with `immediate`. */
	previous: string | null;
	/** The name of the layout. */
	layout: string;
	/** The grid element: the one with `data-grid-layout`. */
	grid: HTMLElement;
};

export type StepListener = (change: StepChange) => void;

declare global {
	interface HTMLElementEventMap {
		gridstepchange: CustomEvent<StepChange>;
	}
}

type Watched = {
	grid: HTMLElement;
	/** The last step that the listeners know. Undefined until the first reading. */
	step: string | undefined;
	/** One entry for each call of `onStepChange`. A call can have no listener: it only wants the events. */
	listeners: Set<{ listener?: StepListener }>;
};

type Watcher = { observer: ResizeObserver; watched: WeakMap<Element, Watched> };

const watchers = new WeakMap<Document, Watcher>();

// WebKit puts an empty comment between two tokens that would join when the value is read again.
// Thus the key ..300 comes back as "." then an empty comment then ".300". A step name never has
// a comment, so readStep removes them, and each engine gives the key as it is written.
const EMPTY_COMMENT = /\/\*\*\//g;

/**
 * The active step of a grid element: the value of `--grid-step`, as the key is written in the
 * layout, or `base`. An element that is not in the page, or a layout with no CSS yet, gives ''.
 */
export function readStep(grid: Element): string {
	const view = grid.ownerDocument.defaultView;
	if (!grid.isConnected || !view) return '';
	return view
		.getComputedStyle(grid)
		.getPropertyValue(STEP_PROPERTY)
		.replace(EMPTY_COMMENT, '')
		.trim();
}

const read = readStep;

function notify(entry: Watched, step: string, previous: string | null) {
	const { grid } = entry;
	const change: StepChange = {
		step,
		previous,
		layout: grid.getAttribute(attributes.layout) ?? '',
		grid
	};
	const view = grid.ownerDocument.defaultView;
	if (view)
		grid.dispatchEvent(
			new view.CustomEvent(STEP_EVENT, { bubbles: true, composed: true, detail: change })
		);
	for (const { listener } of [...entry.listeners]) listener?.(change);
}

function watcherOf(doc: Document): Watcher | null {
	let watcher = watchers.get(doc);
	if (watcher) return watcher;
	const Observer = doc.defaultView?.ResizeObserver;
	if (!Observer) return null;

	const watched: Watcher['watched'] = new WeakMap();
	const observer = new Observer((entries) => {
		// The observer calls this after layout, so the styles are up to date and a read is cheap.
		// Read each step before a listener runs: a listener can change styles, and a read after
		// that makes the browser calculate the styles again.
		const changes: [Watched, string, string | undefined][] = [];
		for (const { target } of entries) {
			const entry = watched.get(target);
			if (!entry) continue;
			const step = read(entry.grid);
			if (step && step !== entry.step) changes.push([entry, step, entry.step]);
		}
		for (const [entry, step, previous] of changes) {
			entry.step = step;
			// The first reading is the start value, not a change.
			if (previous !== undefined) notify(entry, step, previous);
		}
	});
	watcher = { observer, watched };
	watchers.set(doc, watcher);
	return watcher;
}

/** The grid element of `target`: the element itself, the grid of a host, or the nearest grid around it. */
function gridOf(target: Element): HTMLElement | null {
	if (target.hasAttribute(attributes.host))
		return target.querySelector<HTMLElement>(`:scope > [${attributes.layout}]`);
	return target.closest<HTMLElement>(`[${attributes.layout}]`);
}

/**
 * Calls `listener` when the active step of a layout changes. `target` is the grid element, its
 * host, or an element in the grid: the nearest grid around it is the one that counts.
 *
 * ```ts
 * const stop = onStepChange(element, ({ step, previous }) => {
 * 	// `step` is the query key of the active step, or "base"
 * });
 * ```
 *
 * While a grid has a listener, the grid element also gets a `gridstepchange` event for each
 * change. The event bubbles, and its `detail` is the same object. Call `onStepChange(element)`
 * with no listener to get only the events.
 *
 * `immediate: true` also calls the listener one time now, with the current step and a `previous`
 * of `null`.
 *
 * Returns a function that stops the calls. Call it when the element goes away. In an
 * environment with no `ResizeObserver`, for example on a server, nothing happens.
 */
export function onStepChange(
	target: Element,
	listener?: StepListener,
	options: { immediate?: boolean } = {}
): () => void {
	const grid = gridOf(target);
	if (!grid)
		throw new Error(
			`onStepChange: the element is not in a grid. It needs an element with ${attributes.layout} around it`
		);
	const watcher = watcherOf(grid.ownerDocument);
	if (!watcher) return () => {};

	// The host is the query container, so its size decides the step. A grid with no host fills
	// its parent, and its own size is the next best thing.
	const parent = grid.parentElement;
	const host = parent?.hasAttribute(attributes.host) ? parent : grid;

	let entry = watcher.watched.get(host);
	if (!entry) {
		entry = { grid, step: undefined, listeners: new Set() };
		watcher.watched.set(host, entry);
		watcher.observer.observe(host);
	}
	// Each call is one subscription, also when two calls give the same function.
	const own = { listener };
	entry.listeners.add(own);

	if (options.immediate && listener) {
		const step = read(grid);
		if (step) {
			entry.step ??= step;
			listener({ step, previous: null, layout: grid.getAttribute(attributes.layout) ?? '', grid });
		}
	}

	const watched = entry;
	let stopped = false;
	return () => {
		if (stopped) return;
		stopped = true;
		watched.listeners.delete(own);
		if (watched.listeners.size > 0) return;
		watcher.observer.unobserve(host);
		watcher.watched.delete(host);
	};
}
