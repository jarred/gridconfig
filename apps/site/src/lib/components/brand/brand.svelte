<script lang="ts">
	import layout from './brand.grid';
	import { Grid } from '@gridconfig/svelte';
	import Logo from '../logo.svelte';
</script>

<div class="outer">
	<Grid {layout}>
		<div data-grid-area="A"><Logo colourway="brand" /></div>
		<div data-grid-area="B">Healthy Bulk Staples for Much Less</div>
		<div data-grid-area="C">hello@ecogoto.nz</div>
		<div data-grid-area="D">EcoGoto<br /></div>
	</Grid>
</div>

<style>
	.outer {
		--highlight: #00a23e;
		width: 400px;
		height: 400px;
	}

	[data-grid-area='D'] {
		background-color: var(--highlight);
		color: contrast-color(var(--highlight));
	}
</style>
