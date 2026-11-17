# @gridconfig/svelte

The `Grid` component of [GridConfig](https://github.com/jarred/gridconfig) for Svelte 5.

```sh
npm install @gridconfig/core @gridconfig/vite @gridconfig/svelte
```

```svelte
<script lang="ts">
	import { Grid } from '@gridconfig/svelte';
	import layout from './card.grid';
</script>

<Grid {layout}>
	<img data-grid-area="image" src="…" alt="" />
	<h3 data-grid-area="title">…</h3>
</Grid>
```

`Grid` renders two elements: the host, which is the query container, and the grid. Each direct child names its area with `data-grid-area`.

## Props

| Prop           | What it does                                                            |
| -------------- | ----------------------------------------------------------------------- |
| `layout`       | A compiled layout: a `.grid` import, or the result of `grid`.           |
| `area`         | The area of this grid in the layout of its parent, for a nested layout. |
| `debug`        | Opens the inspector on this grid in development.                        |
| `onstepchange` | A function that gets each change of the active step.                    |

`Grid` gives the other props (`class`, `id`, event handlers) to the grid element. In development, `Grid` loads the inspector: press Alt+Shift+G. With server rendering, put `GridStyles` around the page. Then the HTML from the server has the CSS of each runtime layout one time. Layouts from the Vite plugin do not use it.

## Documentation

[Getting started](https://github.com/jarred/gridconfig/blob/main/docs/getting-started.md), [the guide](https://github.com/jarred/gridconfig/blob/main/docs/README.md) and [the spec](https://github.com/jarred/gridconfig/blob/main/spec/spec.md).

MIT
