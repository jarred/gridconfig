<script lang="ts">
	import { Grid } from '@gridconfig/svelte';
	import heroLayout from './hero.grid';
	import Logo from '../components/logo.svelte';
</script>

<main>
	<Grid layout={heroLayout}>
		<div data-grid-area="A">GridConfig</div>
		<div data-grid-area="B">Example</div>
		<div data-grid-area="C">
			<Logo />
		</div>
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
		background-color: #1f42dd;
		color: white;
	}

	[data-grid-area='B'] {
		background-color: #eee;
	}

	[data-grid-area='C'] {
		background-color: #eee;
		padding: 0 !important;
	}

	.button-container {
		width: 100%;
		height: 100%;
	}
</style>
