<script lang="ts">
	import { Grid } from '@gridconfig/svelte';
	import heroLayout from './layout.yaml?layout';
</script>

<main>
	<Grid layout={heroLayout} debug>
		<div data-grid-area="A">Area A</div>
		<div data-grid-area="B">Area B</div>
		<div data-grid-area="C">Area C</div>
	</Grid>
</main>

<style>
	main {
		height: 100dvh;
		width: 100%;
	}

	div {
		border-radius: 8px;
		padding: 16px;
		font-family: monospace;
	}

	[data-grid-area='A'] {
		background-color: lightcoral;
	}

	[data-grid-area='B'] {
		background-color: lightblue;
	}

	[data-grid-area='C'] {
		background-color: lightgreen;
	}
</style>
