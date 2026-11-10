<script lang="ts">
	import { Grid } from '@gridconfig/svelte';
	import { grid } from '@gridconfig/core';

	// Each step sets the palette and the shape behind each word. --cols and --rows give the
	// track counts to the CSS, which sizes the dots and the letters from them.
	const layout = grid`
		name: logo
		container: size
		padding: 1cqh
		areas: |
			grid grid
			grid grid
		css: |
			--cols: 2; --rows: 2;
			--bg: var(--aqua); --fg: black;
			--grid-fill: transparent; --grid-shape: none;
			--config-fill: transparent; --config-shape: none;

		breakpoints:
			small: 120x120 ..2/1
			tall: 120x300 ..3/5
			square: 240x240 3/5..2/1
			large: 400x320 3/5..2/1
			wide: 360x120 2/1..

		small:
			padding: 8cqmin
			css: |
				--bg: var(--blue);
				--grid-fill: var(--aqua); --grid-shape: var(--circle);

		wide:
			padding: 6cqmin
			css: |
				--cols: 6; --rows: 2;
				--bg: var(--pink);
				--grid-fill: var(--blue); --grid-shape: var(--triangle);
				--config-fill: var(--purple); --config-shape: var(--hexagon);
			areas: |
				grid grid . config config config
				grid grid . config config config

		square:
			padding: 6cqmin
			css: |
				--cols: 4; --rows: 4;
				--grid-fill: var(--pink); --grid-shape: var(--bar);
				--config-fill: var(--aqua); --config-shape: var(--hexagon);
			areas: |
				grid grid grid grid
				. . . .
				config config config .
				config config config .

		tall:
			padding: 6cqmin
			css: |
				--cols: 2; --rows: 6;
				--bg: var(--indigo); --fg: white;
				--grid-fill: var(--pink);
				--config-fill: var(--purple); --config-shape: var(--hexagon);
			areas: |
				grid grid
				grid grid
				. .
				config config
				config config
				config config

		large:
			padding: 4cqmin
			css: |
				--cols: 6; --rows: 5;
				--bg: var(--purple); --fg: white;
				--grid-fill: var(--blue);
				--config-fill: var(--indigo);
			areas: |
				grid grid grid grid . .
				. . . . . .
				. . config config config .
				. . config config config .
				. . . . . .
	`;

	const gridLayout = grid`
		name: logo-grid
		container: size
		areas: G
		css: '--cols: 1; --rows: 1'

		80x80 ..2/1:
			css: '--cols: 2; --rows: 2'
			areas: |
				G R
				I D

		2/1..:
			css: '--cols: 4; --rows: 1'
			areas: G R I D
	`;

	const configLayout = grid`
		name: logo-config
		container: size
		css: '--cols: 3; --rows: 2'
		areas: |
			C O N
			F I G

		3/4..2/2:
			css: '--cols: 2; --rows: 3'
			areas: |
				C F
				O I
				N G
	`;
</script>

<div class="logo">
	<Grid {layout}>
		<div class="word grid" data-grid-area="grid">
			<Grid layout={gridLayout}>
				{#each 'GRID' as letter (letter)}
					<span data-grid-area={letter}>{letter}</span>
				{/each}
			</Grid>
		</div>
		<div class="word config" data-grid-area="config">
			<Grid layout={configLayout}>
				{#each ['C', 'O', 'N', 'F', 'I', 'G'] as letter (letter)}
					<span data-grid-area={letter}>{letter}</span>
				{/each}
			</Grid>
		</div>
	</Grid>
</div>

<style>
	@property --cell {
		syntax: '<length>';
		inherits: true;
		initial-value: 0px;
	}

	.logo {
		--aqua: #84f8dd;
		--blue: #6fbfe5;
		--pink: #ea56cf;
		--purple: #8a22e0;
		--indigo: #4433bb;

		--circle: circle(closest-side);
		--triangle: polygon(50% 0, 100% 100%, 0 100%);
		--bar: inset(0 0 0 0);
		--hexagon: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);

		width: 100%;
		height: 100%;
		font-family: 'Paper Mono', ui-monospace, monospace;
		font-weight: 700;
	}

	/* The size of one cell, computed against the container of each layout. */
	.logo :global([data-grid-layout]) {
		--cell: min(
			(100cqw - 2 * var(--grid-padding)) / var(--cols),
			(100cqh - 2 * var(--grid-padding)) / var(--rows)
		);
	}

	/* A dot in the centre of each cell. The words cover the dots in their own cells. */
	.logo :global([data-grid-layout='logo']) {
		color: var(--fg);
		background-color: var(--bg);
		/* The empty second layer is there so the colour (which takes the clip of the last layer) fills the padding too. */
		background-image:
			radial-gradient(circle calc(var(--cell) * 0.06), var(--fg) 98%, transparent), none;
		background-size: calc(100% / var(--cols)) calc(100% / var(--rows));
		background-origin: content-box;
		background-clip: content-box, border-box;
		background-repeat: repeat;
	}

	.word {
		position: relative;
		isolation: isolate;
		background-color: var(--bg);
	}

	.word::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
	}

	.grid::before {
		background-color: var(--grid-fill);
		clip-path: var(--grid-shape);
	}

	.config::before {
		background-color: var(--config-fill);
		clip-path: var(--config-shape);
	}

	span {
		display: grid;
		place-items: center;
		font-size: calc(var(--cell) * 0.6);
		line-height: 1;
	}
</style>
