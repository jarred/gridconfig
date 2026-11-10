# The compiled output

Part of the [GridConfig spec](./spec.md). This part is normative. It describes the CSS and the DOM that the compiler makes, and that each framework adapter must make or use. The [layout format](./format.md) describes the input.

## DOM contract

```html
<div data-grid-host="hero">
	<!-- the query container -->
	<div data-grid-layout="hero">
		<!-- the grid -->
		<h1 data-grid-area="A">…</h1>
		<!-- direct children name their cell -->
		<div data-grid-area="B">…</div>
	</div>
</div>
```

- The host is the query container, because a grid cannot query its own size.
- Children must be **direct children** of the grid element. Each child gives its cell with `data-grid-area`.
- The layout does not place a child that has no `data-grid-area`.
- Layouts can nest. A nested host is in a cell. The shared base rules give it `width: 100%; height: 100%`.

## CSS contract

The compiled output has two parts.

**Cascade layer.** By default, the compiler puts all rules in the layer `gridconfig`, except the hide rules. Thus a utility class or a page rule in a later layer can override the layout. An unlayered rule of the page also wins over the layout. The `layer` option sets the name of the layer. The value `false` gives no layer.

The shared base and the per-layout CSS must use the same layer. Use `baseCssFor(layer)` to get the correct base.

The order of layers comes from the first time that the page uses each name. A page can declare the order, for example `@layer base, gridconfig, utilities;`. Tailwind users must set `layer: 'components'`. Refer to the [Tailwind note](./tailwind-plugin.md).

**Shared base (one time for each page).** The rules use `:where()`. Thus they have zero specificity, and each per-layout rule wins over them in any source order.

```css
@layer gridconfig {
	:where([data-grid-host]) {
		width: 100%;
		height: 100%;
	}
	:where([data-grid-layout]) {
		display: grid;
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		gap: var(--grid-gap);
		padding: var(--grid-padding);
	}
}
```

**Per layout.** The output for one layout has these parts:

- One block for the base step.
- One `@container` block for each query step.
- The area placement rules.
- The hide rules. These are outside the layer.
- The flow rules, if the layout has flow. Refer to [Flow output](#flow-output).

The container name is the `name` of the layout. If the base step does not set `--grid-gap` and `--grid-padding`, they are `0`.

This is example output for the `hero` example in the [spec overview](./spec.md). The format of the output is not a part of the contract:

```css
@layer gridconfig {
	[data-grid-host='hero'] {
		container: hero / size;
	}

	[data-grid-layout='hero'] {
		--grid-gap: 0;
		--grid-padding: 0;
		grid-template-columns: repeat(1, 1fr);
		grid-template-rows: repeat(1, 1fr);
		grid-template-areas: 'A';
		--grid-step: base;
	}
	[data-grid-layout='hero'] > [data-grid-area='A'] {
		grid-area: A;
	}
	[data-grid-layout='hero'] > [data-grid-area='B'] {
		grid-area: B;
	}

	@container hero (min-width: 100px) and (min-height: 100px) {
		[data-grid-layout='hero'] {
			--grid-gap: 4px;
			grid-template-columns: repeat(2, 1fr);
			grid-template-rows: repeat(2, 1fr);
			grid-template-areas: 'A A' 'B B';
			--grid-step: 100x100;
		}
	}

	@container hero (min-width: 200px) and (min-height: 200px) {
		[data-grid-layout='hero'] {
			--grid-gap: var(--space-2);
			grid-template-columns: repeat(2, 1fr);
			grid-template-rows: 1fr 40px;
			grid-template-areas: 'A A' '. B';
			--grid-step: 200x200;
		}
	}
}

/* B is absent from the base map and shown by every later areas step */
@container hero (not ((min-width: 100px) and (min-height: 100px))) and (not ((min-width: 200px) and (min-height: 200px))) {
	[data-grid-layout='hero'] > [data-grid-area='B'] {
		display: none !important;
	}
}
```

## Delivery

The page needs the shared base one time, and the CSS of each layout one time. There are two routes.

**Build plugin.** A layout that compiles at build time imports its CSS as CSS modules. A `.grid` file, a `.yaml?grid` import, and a static `grid` call each import two modules: the shared base in the layer of the layout, and the CSS of the layout. The bundler then delivers the CSS as it delivers other CSS: one time for each page, in a stylesheet, also with server rendering. In development, a change to a layout updates the styles, and the page does not reload. The compiled layout then has `bundled: true` and an empty `css`. An adapter must not inject the CSS of a bundled layout.

**Runtime.** A layout that compiles when the code runs has its CSS in `css`. The adapter injects `baseCssFor(layer)` and `css`, one time for each page if it can. Two layouts on one page cannot have the same name. Thus the adapter can use the name to remove duplicates, but a layout that changes at runtime must get a new stylesheet. The React adapter gives the CSS to React as `<style href precedence>`, and React puts it in the head one time. The Svelte adapter puts the CSS in `<svelte:head>` for each instance.

## Flow output

For each step that sets flow, the compiler writes one rule for each area in the entry. The rule has the same selector as the `grid-area` rule, and it is in the same block as the other output of the step. The rule sets six properties: `display`, `flex-direction`, `justify-content`, `align-items`, `gap`, and `flex-wrap`.

This is the output of the step `600x` in the [Flow](./format.md#flow) example:

```css
@container card (min-width: 600px) {
	[data-grid-layout='card'] > [data-grid-area='B'] {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: nowrap;
	}
}
```

**`none`.** The entry `none` writes `revert-layer` for the six properties. `revert-layer` ignores all the rules in the layer of the layout, also the flow of earlier steps. The area gets the values from the earlier layers of the page, or the browser defaults. The compiler does not write `display: block`, because an element that the page makes a grid or a flex container must keep its value.

- With a layer, unlayered page CSS wins over the layout in all cases. Thus `none` changes only the layout values.
- Without a layer (`layer: false`), the browser counts all unlayered CSS as the last layer. Thus `revert-layer` also ignores the unlayered page rules that have a lower specificity than the flow rule. For example, with `[data-grid-area] { display: grid }` on the page, `none` gives `display: block`. Use a page rule with a higher specificity, or use a layer.

**Page CSS.** With a layer, unlayered page CSS wins over flow. Thus a page rule such as `.card h3 { display: grid }` stops the flow of that area, and there is no error.

The browser changes the `display` of a grid item to a block-level value. Thus an `inline-flex` value on an area computes to `flex`.

## Active step

Each step sets the custom property `--grid-step` on the grid element. The value is the query key of the step, or `base` for the base step. The cascade gives the active step: the last step that matches. Thus two steps that match at the same time give one value.

Content can use a style query to target a step. The custom property inherits, so a descendant at any depth can use it:

```css
@container style(--grid-step: 200x200) {
	h1 {
		font-size: 12cqmin;
	}
}
```

A nested layout sets its own value for its subtree. JavaScript can read the value with `getComputedStyle(grid).getPropertyValue('--grid-step')`. Style queries for custom properties are in all current browsers (Baseline in 2026). An older browser ignores the rule.

Use the style query, and do not copy the size conditions of a step to page CSS. A copy of the conditions tells you that a step matches, but not that it is active.

The output uses only standard CSS container queries and grid features. It has no JavaScript and no selectors for a specific framework. Thus a plain stylesheet is sufficient to use it from each framework. The Web Components adapter describes the shadow-DOM variant (selectors that use `:host` and `::slotted()`).

## Core API

```ts
grid`…`                                         // a static template; returns a compiled layout
grid(input: LayoutInput, options?): CompiledLayout
parseLayout(source: string, options?): Layout     // YAML text
parseLayoutObject(input: LayoutInput, options?): Layout
compileLayout(source: string | Layout, options?): { name: string; css: string; layer: string | null; areas: string[]; warnings: Warning[]; bundled?: true }
baseCss: string                       // the shared base rules in the default layer
baseCssFor(layer: string | null): string  // the shared base rules in a given layer
```

`options`: `tokenPrefix`, `tokenVar`, `defaultName`, `layer`, `debug`, `breakpoints`. The tag form takes no options.

`breakpoints` is a map from a name to a query, for example `{ md: '600..' }`. Refer to [Named breakpoints](./format.md#named-breakpoints). In TypeScript, the object form types the names from its own `breakpoints` key as keys.

`debug: true` adds data for development tools. Refer to [Inspector](../packages/devtools/README.md). Use it in development only, because it makes the CSS larger.

`layer` is a name, `true` (the default name `gridconfig`), or `false` (no layer). A name can have dots for a nested layer. An invalid name is an error.

`css` is only the per-layout part. The page also needs the base rules from `baseCssFor(layer)`. `bundled` is `true` when a build plugin delivers the CSS. Then `css` is empty. Refer to [Delivery](#delivery). `layer` is the layer that the compiler used, or `null`. `areas` is a list of each area name. Thus generated code can give typed access.
