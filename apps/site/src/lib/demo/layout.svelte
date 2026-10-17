<script lang="ts">
	import { Grid } from '@gridconfig/svelte';
	import hero from './layout.grid';
	import SubTest from './sub-test/sub-test.svelte';
</script>

<Grid layout={hero} debug>
	<h1 data-grid-area="A">This is the heading</h1>
	<div data-grid-area="B">
		<SubTest />
	</div>
</Grid>

<style>
	h1 {
		background-color: rgba(255, 0, 0, 0.2);
		font-size: 10cqh;
		padding: var(--padding);
		text-box-trim: trim-both;
		line-height: 1em;
	}
</style>
