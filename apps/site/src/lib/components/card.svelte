<script lang="ts">
	import { Grid } from '@gridconfig/svelte';
	import layout from './card.grid';
</script>

<div class="card">
	<Grid {layout}>
		<div class="image" data-grid-area="A"></div>
		<h3 data-grid-area="B">A Powerful Layout Engine</h3>
		<p data-grid-area="C">GridConfig is a new approach to building responsive layouts.</p>
		<div data-grid-area="D">gridconfig.dev</div>
	</Grid>
</div>

<style>
	.card {
		min-width: 100px;
		min-height: 100px;
	}

	.image {
		background-color: #eee;
	}
</style>
