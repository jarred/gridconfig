<script lang="ts" module>
	/**
	 * The context of `GridStyles`: the ids of the stylesheets that the server render has written.
	 * With it, the server writes the CSS of a layout one time, not one time for each grid.
	 */
	export const WRITTEN = Symbol('gridconfig.written');
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { getContext, onMount } from 'svelte';
	import { BROWSER, DEV } from 'esm-env';
	import { mountStyles, sheetsOf } from '@gridconfig/core/runtime';
	import type { CompiledLayout } from '@gridconfig/core';

	let {
		layout,
		area,
		debug = false,
		children,
		...rest
	}: {
		layout: CompiledLayout;
		/**
		 * The area of this grid in the layout of its parent. It goes on the host element as
		 * `data-grid-area`, so a nested grid needs no element around it.
		 */
		area?: string;
		/** Opens the inspector on this grid when the page loads. Only has an effect in development. */
		debug?: boolean;
		children?: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();

	// A layout from the build plugin imports its CSS. A layout compiled at runtime has its CSS on
	// the page one time, for all the grids that use it. When the layout changes, so does its CSS.
	// The effect runs before the grid is in the DOM, so the grid never shows without its CSS.
	$effect.pre(() => mountStyles(layout));

	// On the server there is no document, so the grid writes its CSS to the head. Inside
	// `GridStyles`, only the first grid with a stylesheet writes it.
	const written = getContext<Set<string> | undefined>(WRITTEN);
	function serverSheets() {
		const sheets = sheetsOf(layout);
		if (!written) return sheets;
		return sheets.filter((sheet) => !written.has(sheet.id) && written.add(sheet.id));
	}

	// The inspector is for development. A production build removes this code.
	onMount(() => {
		if (DEV) import('@gridconfig/devtools/auto');
	});
</script>

<!-- In the browser, the effect above replaces these elements with one element for each layout. -->
<svelte:head>
	{#if !BROWSER}
		{#each serverSheets() as sheet (sheet.id)}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- CSS comes from our own compiler -->
			{@html `<style data-gridconfig-ssr="${sheet.id}">${sheet.css}</style>`}
		{/each}
	{/if}
</svelte:head>

<!-- The grid can't be its own query container, so the host element is the container. -->
<div
	data-grid-host={layout.name}
	data-grid-area={area}
	data-grid-debug={DEV && debug ? '' : undefined}
>
	<div {...rest} data-grid-layout={layout.name}>
		{@render children?.()}
	</div>
</div>
