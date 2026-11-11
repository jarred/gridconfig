<script lang="ts">
	import type { Snippet } from 'svelte';
	import { setContext } from 'svelte';
	import { WRITTEN } from './Grid.svelte';

	// Only layouts that compile when the code runs need this component, and only with server
	// rendering. Put it around the page, for example in the root layout. Then the HTML from the
	// server has the CSS of each layout one time. Without it, each grid writes the CSS of its layout.
	let { children }: { children?: Snippet } = $props();

	setContext(WRITTEN, new Set<string>());
</script>

{@render children?.()}
