import { createElement, Fragment, useEffect } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { DEV } from 'esm-env';
import { baseCssFor } from '@gridconfig/core/runtime';
import type { CompiledLayout } from '@gridconfig/core';

export type GridProps = {
	layout: CompiledLayout;
	/** Opens the inspector on this grid when the page loads. Only has an effect in development. */
	debug?: boolean;
	children?: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

/** A short hash, so that a layout that changes at runtime gets a new stylesheet. */
function hash(text: string): string {
	let h = 5381;
	for (let i = 0; i < text.length; i++) h = (h * 33) ^ text.charCodeAt(i);
	return (h >>> 0).toString(36);
}

/**
 * A layout from the build plugin imports its CSS. A layout compiled at runtime gives its CSS to
 * React: a `<style>` with `href` and `precedence` goes in the head one time for each page, also in SSR.
 */
function styles(layout: CompiledLayout): ReactNode {
	if (layout.bundled) return null;
	const sheet = (href: string, css: string) =>
		createElement('style', { key: href, href, precedence: 'gridconfig' }, css);
	return [
		sheet(`gridconfig-base-${layout.layer ?? '-'}`, baseCssFor(layout.layer)),
		sheet(`gridconfig-${layout.name}-${hash(layout.css)}`, layout.css)
	];
}

/** The host is the query container, because a grid cannot query its own size. Props go to the grid. */
export function Grid({ layout, debug = false, children, ...rest }: GridProps) {
	// The inspector is for development. A production build removes this code.
	useEffect(() => {
		if (DEV) void import('@gridconfig/devtools/auto');
	}, []);

	return createElement(
		Fragment,
		null,
		styles(layout),
		createElement(
			'div',
			{ 'data-grid-host': layout.name, 'data-grid-debug': DEV && debug ? '' : undefined },
			createElement('div', { ...rest, 'data-grid-layout': layout.name }, children)
		)
	);
}
