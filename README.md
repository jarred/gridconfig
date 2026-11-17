# GridConfig

GridConfig describes a CSS grid that changes shape with the size of its container. It compiles the description to static CSS container queries and a small DOM contract that each framework can use. There is no layout JavaScript at runtime.

```yaml
# card.grid
gap: 8
areas: |
  image
  title
  text

500:
  cols: 200 1fr
  areas: |
    image title
    image text

900:
  gap: '{space.4}'
  cols: 300 1fr 240
  areas: |
    image title aside
    image text  aside
```

```svelte
<script>
	import { Grid } from '@gridconfig/svelte';
	import layout from './card.grid';
</script>

<Grid {layout}>
	<img data-grid-area="image" src="…" alt="" />
	<h3 data-grid-area="title">…</h3>
	<p data-grid-area="text">…</p>
	<aside data-grid-area="aside">…</aside>
</Grid>
```

At less than 500 px, the card is one column. From 500 px, the image is on the left. From 900 px, a third column shows `aside`. At the smaller sizes, `aside` is hidden, because their area maps do not have it.

**Status:** 1.0. The format and the output are stable in each 1.x release. [Stability](spec/spec.md#stability) says what that covers.

```sh
npm install @gridconfig/core @gridconfig/vite @gridconfig/svelte   # or @gridconfig/react
```

[Getting started](docs/getting-started.md) has the Vite setup and a first layout.

- [Guide](docs/README.md): how to use GridConfig, with examples.
- [Spec](spec/spec.md): the exact rules of the format and of the compiled output.
- [Roadmap](ROADMAP.md): the parts that we built, and the parts that we plan.
- [Changelog](CHANGELOG.md): what each release changed.

## What a layout can do

- **Steps.** A key such as `500` is a step: settings that apply from that container width. A key can also give a range (`600..900`), the height (`x400`), a ratio (`16/9`), or the orientation. A key can use named breakpoints. A step changes only what it sets.
- **One clear winner.** Two steps can match at the same size and set the same thing. Then the compiler tells you the size where they meet. The order of the steps in the file never decides the result.
- **Areas.** The area map draws the grid as text. An element whose area is not in the active map is hidden.
- **Tracks and values.** `cols`, `rows`, `gap` and `padding` take px numbers, any CSS length, CSS variables (`--space`), design tokens (`{space.2}`) and simple math (`{space.2} + 4`).
- **Flow.** `flow` arranges the content inside an area with flexbox, and it can change with the steps.
- **Checks.** The compiler examines area maps, track counts and query keys. It gives the line and the column of each error.

The [language reference](docs/language.md) has all of it on one page.

## How it works

`Grid` renders two elements: a host, which is the query container, and the grid itself. Each direct child names its cell with `data-grid-area`.

```html
<div data-grid-host="card">
	<div data-grid-layout="card">
		<img data-grid-area="image" />
		…
	</div>
</div>
```

The compiler writes one block of CSS for the base and one `@container` block for each step. By default, the CSS is in the cascade layer `gridconfig`. Thus the normal CSS of a page and its utility classes win over a layout. The grid element also carries `--grid-step`, `--grid-gap` and `--grid-padding`, so content can style itself for a step:

```css
@container style(--grid-step: 900) {
	h3 {
		font-size: 2rem;
	}
}
```

For work that CSS cannot do, `onStepChange` from `@gridconfig/core/runtime` calls a function when the active step changes, and the grid element gets a `gridstepchange` event. Refer to [the guide](docs/styling.md#react-to-a-step-in-javascript).

The output uses container queries and cascade layers. All current browsers have them. The browser tests run in Chromium, Firefox and WebKit.

## Three ways to write a layout

A layout is plain data. Write it in a `.grid` file (YAML, the first choice), in a template string, or as an object:

```ts
import card from './card.grid';

import { grid } from '@gridconfig/core';

const inline = grid`
  areas: A
  600:
    areas: A B
`;

const object = grid({ areas: 'A', 600: { areas: 'A B' } });
```

With the Vite plugin, `.grid` files and static `grid` calls compile at build time. Vite bundles their CSS as it bundles all other CSS:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { gridconfig } from '@gridconfig/vite';

export default defineConfig({
	plugins: [gridconfig({ breakpoints: { md: '600..' } }) /* , sveltekit() or react() */]
});
```

Without the plugin, a layout compiles when the code runs. This also occurs when code makes an object from variables. Then `Grid` puts its CSS on the page one time. Code that only compiles objects can import `grid` from `@gridconfig/core/object`, which leaves out the YAML parser.

In development, `Grid` loads an inspector that draws the areas, the tracks and the active step. Press Alt+Shift+G to show it.

## Repository structure

| Path                   | Package                             | What it is                                                                                                                                                                                              |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spec/`                |                                     | The spec, the browser test fixtures (`spec/fixtures`), and three research notes on Tailwind, StyleX and Taffy (explorations, not plans).                                                                |
| `docs/`                |                                     | The guide.                                                                                                                                                                                              |
| `packages/core`        | `@gridconfig/core`                  | Parser, compiler, `grid` and `createGrid`, types. `./object` is the same without the YAML parser. `./runtime` has the small parts that an adapter uses. `./schema.json` is the JSON Schema for editors. |
| `packages/vite`        | `@gridconfig/vite`                  | The Vite plugin: loads `.grid` files, compiles static `grid` calls, and bundles the CSS.                                                                                                                |
| `packages/svelte`      | `@gridconfig/svelte`                | `Grid` for Svelte 5, and `GridStyles` for server rendering of layouts compiled at runtime.                                                                                                              |
| `packages/react`       | `@gridconfig/react`                 | `Grid` for React 19.                                                                                                                                                                                    |
| `packages/devtools`    | `@gridconfig/devtools`              | The inspector overlay: areas, authored tracks, the active step, and checks of the markup.                                                                                                               |
| `packages/conformance` | `@gridconfig/conformance` (private) | Loads the fixtures in a real browser, and compares the layout that the browser makes with the expected result.                                                                                          |

Planned: a CLI, adapters for Vue, Astro and Web Components, plugins for other bundlers, and an editor extension for `.grid` files.

## Development

You must have Node 22.18 or later, and pnpm.

```sh
pnpm install
pnpm test          # Node tests in core, vite, devtools, react and svelte
pnpm test:browser  # fixtures, page CSS and the inspector in Chromium (BROWSER=firefox or webkit for the others)
pnpm test:browsers # the same in all three
pnpm check         # type-check
pnpm lint          # Prettier and ESLint
pnpm build         # build each package
```

Before the first browser test, install the browsers: `pnpm --filter @gridconfig/conformance exec playwright install chromium firefox webkit`. On some Macs, Playwright's Firefox does not start ("Could not find profile folder"). CI runs Firefox on Linux, so a local Firefox run is optional.

If you change the format, change the [spec](spec/spec.md) first, then the compiler and its tests in `packages/core`, then the fixtures in `spec/fixtures`.

## License

[MIT](LICENSE)
