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
- Only one step is active at a time: the most specific one that matches. A step style applies only while its step is active. Thus, with a ladder, a style for `600` stops at the next step. To use it at the larger steps too, write it again for each of them.
- Use a [named breakpoint](./steps.md#named-breakpoints) for the value. A name such as `wide` is short and easy to read. A key with dots or slashes (`600..900`, `16/9`) also works, in every current browser.
- Do not copy the size of a step into your own `@container` rule. The copy can match when another step is active.

Container units are also useful for content that scales with the layout: `font-size: 8cqmin` with `container: size`.

## React to a step in JavaScript

Use CSS when possible. A style query does not use JavaScript. Some work must have code, for example an animation that changes the text of an element when the layout changes. For this, `onStepChange` calls a function each time the active step changes.

```ts
import { onStepChange } from '@gridconfig/core/runtime';

const stop = onStepChange(element, ({ step, previous }) => {
	// step: the key of the active step, or "base"
	// previous: the step before it
	scramble(element);
});

// When the element goes away:
stop();
```

- `element` is the grid element, or an element at any depth in the grid. The nearest grid around it is the one that counts. Thus a component in an area can listen for the steps of its layout, without a reference to the grid.
- The function gets `step`, `previous`, `layout` (the name of the layout) and `grid` (the grid element).
- The function runs after the browser applies the new step, and before it paints. Thus an animation starts in the same frame as the change of the layout.
- The function runs only when the step changes. A resize in the same step does nothing.
- The first call comes with the first change. To also get the current step one time at the start, give `{ immediate: true }` as the third argument. Then `previous` is `null`.
- Use a [named breakpoint](./steps.md#named-breakpoints), so that `step` is a short name such as `wide`.

`onStepChange` works in each framework, and with no framework, because it uses only the DOM. It does not depend on the `Grid` components.

To read the active step one time, use `readStep(grid)` from the same module. It gives the key as you wrote it. Do not read `--grid-step` with `getComputedStyle` yourself: Safari changes some keys. For example, `..300` becomes `./**/.300`.

**The `Grid` components.** `Grid` has a prop for the same thing. It listens for the steps of its own layout, and it stops when the component unmounts:

```svelte
<Grid {layout} onstepchange={({ step }) => (current = step)}>…</Grid>
```

```tsx
<Grid layout={layout} onStepChange={({ step }) => setCurrent(step)}>
	…
</Grid>
```

**The event.** While a grid has a listener, its grid element also gets a `gridstepchange` event for each change. The event bubbles, and `event.detail` has the same values as above. A grid with no listener gets no event. Thus a grid that does not use the event has no cost. To get the events and no function call, call `onStepChange(element)` with one argument.

```ts
onStepChange(grid);
document.addEventListener('gridstepchange', (event) => {
	console.log(event.detail.layout, event.detail.step);
});
```

**Cost.** One `ResizeObserver` watches the hosts of all the grids that have a listener. When a host changes size, the observer reads `--grid-step` one time. It reads at the moment when the styles are already up to date, so the read is cheap. Nothing runs for a grid with no listener.

**To animate a move.** The function runs after the layout changes. Thus it can start an animation at the new position, but the old position of an element is gone. To animate from the old position, your code must keep the positions from before the change.

## Cascade layers

The CSS of a layout is in the cascade layer `gridconfig`. Thus:

- Any normal CSS on your page wins over the layout. A class that sets `gap` or `padding` on the grid element overrides the layout.
- A utility class in a later layer wins, also with a lower specificity.

Set the order of your layers one time, at the start of your CSS:

```css
@layer reset, gridconfig, components, utilities;
```

Be careful with a reset that is not in a layer, such as `* { padding: 0 }`. It also wins over the layout, and the layout loses its padding. Put the reset in a layer before `gridconfig`, as above.

The `layer` option of the plugin changes the name (`layer: 'components'`), or removes the layer (`layer: false`). With Tailwind, use `layer: 'components'`. Refer to the [Tailwind note](../spec/tailwind-plugin.md).

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

Custom properties are the most useful case: set them per step, and use them in the CSS of the content. Two `css` values that overlap give a warning, because the compiler cannot examine them.

## Nested layouts

An area can hold a `Grid` with its own layout. The nested layout measures its area, not the page. Its gap, padding and `--grid-step` do not come from the parent.

```svelte
<Grid layout={page}>
	<Grid layout={card} area="main">…</Grid>
</Grid>
```

The `area` prop of `Grid` gives the nested grid its area in the layout of the parent. Do not use `data-grid-area` on a `Grid` for this. `Grid` gives its other props to its inner grid element, but the area must be on the outer one.

The nested `Grid` fills its area. If the area must hold other content too, put the `Grid` in an element with `data-grid-area`.

Next: [Examples](./examples.md).
