import {
	createElement,
	Fragment,
	useCallback,
	useEffect,
	useInsertionEffect,
	useRef,
	useState
} from 'react';
import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { DEV } from 'esm-env';
import { mountStyles, onStepChange as watchStep, sheetsOf } from '@gridconfig/core/runtime';
import type { StepListener } from '@gridconfig/core/runtime';
import type { CompiledLayout } from '@gridconfig/core';

export type GridProps = {
	layout: CompiledLayout;
	/**
	 * The area of this grid in the layout of its parent. It goes on the host element as
	 * `data-grid-area`, so a nested grid needs no element around it.
	 */
	area?: string;
	/** Opens the inspector on this grid when the page loads. Only has an effect in development. */
	debug?: boolean;
	/**
	 * Called when the active step of the layout changes, with the new step and the step before it.
	 * For work that CSS cannot do, for example an animation in JavaScript.
	 */
	onStepChange?: StepListener;
	/** A ref to the grid element. */
	ref?: Ref<HTMLDivElement>;
	children?: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

/** The precedence, and the `href`, that React gets for a sheet. One sheet has one <style> element. */
const resource = (id: string) => `gridconfig:${id}`;

/**
 * On the server, a layout compiled at runtime gives its CSS to React: a `<style>` with `href` and
 * `precedence` goes in the output one time, however many grids use the layout. A layout from the
 * build plugin imports its CSS, so it gives nothing.
 */
function serverStyles(layout: CompiledLayout): ReactNode {
	return sheetsOf(layout).map(({ id, css }) =>
		createElement('style', { key: id, href: resource(id), precedence: resource(id) }, css)
	);
}

/**
 * In the browser, the CSS of a layout compiled at runtime is on the page one time, for all the
 * grids that use it. When the layout changes, its CSS changes. The elements from the server are
 * not necessary after that, and an old one would keep the steps of an old layout, so they go.
 */
function useStyles(layout: CompiledLayout) {
	const { name, css, layer, bundled } = layout;
	useInsertionEffect(() => {
		const sheet = { name, css, layer, bundled };
		const release = mountStyles(sheet);
		for (const { id } of sheetsOf(sheet))
			for (const old of document.querySelectorAll(`style[data-precedence="${resource(id)}"]`))
				old.remove();
		return release;
	}, [name, css, layer, bundled]);
}

/** The host is the query container, because a grid cannot query its own size. Props go to the grid. */
export function Grid({
	layout,
	area,
	debug = false,
	onStepChange,
	ref,
	children,
	...rest
}: GridProps) {
	useStyles(layout);

	// The grid element, for the step listener. The ref of the caller still gets the element.
	const [grid, setGrid] = useState<HTMLDivElement | null>(null);
	const setRef = useCallback(
		(element: HTMLDivElement | null) => {
			setGrid(element);
			if (typeof ref === 'function') {
				const cleanup = ref(element);
				if (typeof cleanup === 'function')
					return () => {
						setGrid(null);
						cleanup();
					};
			} else if (ref) ref.current = element;
		},
		[ref]
	);
	// Only a grid with a listener is watched. A new function on each render does not start the
	// watch again: the watch calls the function of the last render.
	const listener = useRef(onStepChange);
	useEffect(() => {
		listener.current = onStepChange;
	});
	const listens = Boolean(onStepChange);
	useEffect(() => {
		if (grid && listens) return watchStep(grid, (change) => listener.current?.(change));
	}, [grid, listens]);

	// The inspector is for development. A production build removes this code.
	useEffect(() => {
		if (DEV) void import('@gridconfig/devtools/auto');
	}, []);

	return createElement(
		Fragment,
		null,
		typeof document === 'undefined' ? serverStyles(layout) : null,
		createElement(
			'div',
			{
				'data-grid-host': layout.name,
				'data-grid-area': area,
				'data-grid-debug': DEV && debug ? '' : undefined
			},
			createElement('div', { ...rest, ref: setRef, 'data-grid-layout': layout.name }, children)
		)
	);
}
