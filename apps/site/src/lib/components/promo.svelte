<script lang="ts">
	import layout from './promo.grid';
	import { Grid } from '@gridconfig/svelte';
</script>

<Grid {layout}>
	<h1 data-grid-area="A">A Powerful Layout Engine</h1>
	<p data-grid-area="B">GridConfig is a new approach to building responsive layouts.</p>
	<div data-grid-area="C" class="image"></div>
	<p data-grid-area="D">gridconfig.dev</p>
	<div data-grid-area="E" class="illustration"></div>
</Grid>

<style>
	h1 {
		font-size: 20px;
		line-height: 0.78em;
		padding: 0;
		margin: 0;
		text-box-trim: both;
	}

	@container style(--grid-step: 300x400) {
		h1 {
			opacity: 0.4;
		}
	}

	h1,
	p {
		padding: var(--gap);
	}

	p {
		line-height: 1em;
		text-box-trim: both;
	}

	.image {
		background-color: red;
		border-radius: 16px;
	}

	.illustration {
		background-color: blue;
		border-radius: 16px;
	}
</style>
