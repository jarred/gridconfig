<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { onMount } from 'svelte';
	import { DEV } from 'esm-env';
	import { baseCssFor } from '@gridconfig/core/runtime';
	import type { CompiledLayout } from '@gridconfig/core';

	let {
		layout,
		debug = false,
		children,
		...rest
	}: {
		layout: CompiledLayout;
		/** Opens the inspector on this grid when the page loads. Only has an effect in development. */
		debug?: boolean;
		children?: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();

	// The inspector is for development. A production build removes this code.
	onMount(() => {
		if (DEV) import('@gridconfig/devtools/auto');
	});
</script>

<!-- A layout from the build plugin imports its CSS. Only a layout compiled at runtime injects it. -->
<svelte:head>
	{#if !layout.bundled}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- CSS comes from our own compiler -->
		{@html `<style>${baseCssFor(layout.layer)}\n${layout.css}</style>`}
	{/if}
</svelte:head>

<!-- The grid can't be its own query container, so the host element is the container. -->
<div data-grid-host={layout.name} data-grid-debug={DEV && debug ? '' : undefined}>
	<div {...rest} data-grid-layout={layout.name}>
		{@render children?.()}
	</div>
</div>
