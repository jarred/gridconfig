<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { baseCss } from '@gridconfig/core/runtime';
	import type { CompiledLayout } from '@gridconfig/core';

	let {
		layout,
		debug = false,
		children,
		...rest
	}: {
		layout: CompiledLayout;
		debug?: boolean;
		children?: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();

	let overlay = $state<HTMLElement>();
	let tracks = $state({ cols: 0, rows: 0 });

	// The overlay spans every track of its parent, whose computed lists are resolved sizes; the subgrid's own value is not.
	$effect(() => {
		if (!debug || !overlay?.parentElement) return;
		const el = overlay.parentElement;
		// Computed values can contain [line names], which aren't tracks.
		const count = (v: string) => {
			const list = v.replace(/\[[^\]]*\]/g, ' ').trim();
			return list === '' || list === 'none' ? 0 : list.split(/\s+/).length;
		};
		const measure = () => {
			const style = getComputedStyle(el);
			tracks = {
				cols: count(style.gridTemplateColumns),
				rows: count(style.gridTemplateRows)
			};
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	});
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- CSS comes from our own compiler -->
	{@html `<style>${baseCss}\n${layout.css}</style>`}
</svelte:head>

<!-- The grid can't be its own query container, so the host element is the container. -->
<div data-grid-host={layout.name}>
	<div {...rest} data-grid-layout={layout.name}>
		{@render children?.()}
		{#if debug}
			<div class="overlay" bind:this={overlay} aria-hidden="true">
				{#each { length: tracks.cols * tracks.rows } as _, i (i)}
					<div>{i}</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.overlay {
		grid-area: 1 / 1 / -1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		grid-template-rows: subgrid;
		pointer-events: none;
		opacity: 1;

		/* outline takes no space, so the cells can't change track sizing */
		& > div {
			outline: 0.5px solid rgba(255, 0, 0, 1);
			outline-offset: -1px;
			font-family: monospace;
			color: red;
			padding: 4px;
		}
	}
</style>
