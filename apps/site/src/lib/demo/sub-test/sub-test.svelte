<script lang="ts">
	import { Grid } from '@gridconfig/svelte';
	import subLayout from './layout.grid';
</script>

<Grid layout={subLayout} debug>
	<h1 data-grid-area="A">CTA</h1>
	<h2 data-grid-area="B">Fine Print</h2>
</Grid>

<style>
	h1 {
		background-color: rgba(255, 0, 0, 0.2);
		font-size: 16px;
		text-box-trim: trim-both;
		line-height: 1em;
	}

	h2 {
		background-color: rgba(0, 0, 255, 0.2);
		text-box-trim: trim-both;
	}
</style>
