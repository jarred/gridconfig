# GridConfig guide

GridConfig describes a CSS grid that changes shape with the size of its container. You write a small YAML layout. The compiler turns it into static CSS container queries. There is no JavaScript at runtime.

```yaml
# card.grid
areas: |
  image
  title
  text

500:
  cols: 200 1fr
  areas: |
    image title
    image text
```

```svelte
<Grid {layout}>
	<img data-grid-area="image" src="…" alt="" />
	<h3 data-grid-area="title">…</h3>
	<p data-grid-area="text">…</p>
</Grid>
```

Below 500 px the card is one column. From 500 px the image is on the left.

## Contents

1. [Getting started](./getting-started.md): install, the Vite plugin, and your first layout in Svelte or React.
2. [Steps](./steps.md): how a layout changes with its container. Start here to understand the model.
3. [Areas, tracks and values](./areas-and-tracks.md): the area map, columns and rows, gap and padding, and design tokens.
4. [Flow](./flow.md): arrange the content inside an area.
5. [Styling and CSS](./styling.md): style content for a step, cascade layers, and how the layout meets the CSS of your page.
6. [Examples](./examples.md): complete layouts, from a card to one ad layout that fits every ad format.
7. [The whole language on one page](./language.md): a reference to keep open.

The [spec](../spec/spec.md) is the exact definition. This guide explains it.
