# Styling and CSS

## Style content for a step

The grid element has the custom property `--grid-step`. Its value is the key of the active step, or `base`. Use a style query to style the content for a step:

```yaml
# promo.grid
breakpoints:
  wide: 900..

areas: |
  title
  text

wide:
  areas: title text
```

```css
h1 {
	font-size: 1.5rem;
}

@container style(--grid-step: wide) {
	h1 {
		font-size: 3rem;
	}
}
```

- The value inherits, so any element inside the grid can use it.
- Only one step is active at a time: the most specific one that matches. A step style applies only while its step is active. Thus, with a ladder, a style for `600` stops at the next step. Write it again for the larger steps if you want it there too.
- Use a [named breakpoint](./steps.md#named-breakpoints) for the value. A name such as `wide` is short, and it is safe in every browser. A key with dots or slashes (`600..900`, `16/9`) works in Chromium, and is not yet tested in other browsers.
- Do not copy the size of a step into your own `@container` rule. The copy can match when another step is active.

Container units are also useful for content that scales with the layout: `font-size: 8cqmin` with `container: size`.

## Cascade layers

The CSS of a layout is in the cascade layer `gridconfig`. Thus:

- Any normal CSS on your page wins over the layout. A class that sets `gap` or `padding` on the grid element overrides the layout.
- A utility class in a later layer wins, also with a lower specificity.

Set the order of your layers one time, at the start of your CSS:

```css
@layer reset, gridconfig, components, utilities;
```

One thing to watch: a reset that is not in a layer, such as `* { padding: 0 }`, also wins over the layout, and the layout loses its padding. Put the reset in a layer before `gridconfig`, as above.

The `layer` option of the plugin changes the name (`layer: 'components'`), or turns layers off (`layer: false`). With Tailwind, use `layer: 'components'`. Refer to the [Tailwind note](../spec/tailwind-plugin.md).

## The hide rule

The rule that hides an area is the one exception. It is outside the layer and it uses `!important`, so a `display: flex` on the element cannot show a hidden area by accident.

## Raw CSS for a step

`css` adds declarations to the grid element in a step. The compiler does not read them.

```yaml
areas: A

600:
  css: |
    --accent: var(--blue);
    border-radius: 12px;
```

Custom properties are the most useful case: set them per step, and use them in the CSS of the content. Two overlapping `css` values give a warning, because the compiler cannot check them.

## Nested layouts

An area can hold a `Grid` with its own layout. The nested layout measures its area, not the page. Its gap, padding and `--grid-step` start fresh.

```svelte
<Grid layout={page}>
	<Grid layout={card} area="main">…</Grid>
</Grid>
```

The `area` prop of `Grid` gives the nested grid its area in the layout of the parent. Do not use `data-grid-area` on a `Grid` for this: the other props of `Grid` go to its inner grid element, and the area must be on the outer one.

The nested `Grid` fills its area. If the area must hold other content too, put the `Grid` in an element with `data-grid-area`.

Next: [Examples](./examples.md).
