<script lang="ts">
	import { grid } from '@gridconfig/core';
	import { Grid } from '@gridconfig/svelte';

	const layout = grid`
		name: button
		areas: ICON

		80x32:
			areas: |
				ICON LABEL

		160x56:
			areas: |
				ICON LABEL
				ICON CTA
	`;
</script>

<button>
	<Grid {layout}>
		<div data-grid-area="ICON">icon</div>
		<div data-grid-area="LABEL">label</div>
		<div data-grid-area="CTA">cta</div>
	</Grid>
</button>
