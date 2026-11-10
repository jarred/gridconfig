# Getting started

## Install

```sh
pnpm add @gridconfig/core @gridconfig/unplugin
pnpm add @gridconfig/svelte   # or @gridconfig/react
```

Add the Vite plugin. It compiles layouts at build time and gives their CSS to Vite, so it ships as a normal stylesheet.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { layoutPlugin } from '@gridconfig/unplugin/vite';

export default defineConfig({
	plugins: [layoutPlugin() /* , sveltekit() or react() */]
});
```

For TypeScript, add the types for `.grid` imports, for example in `src/app.d.ts` or `src/vite-env.d.ts`:

```ts
/// <reference types="@gridconfig/unplugin/client" />
```

## Your first layout

A layout is a `.grid` file. Its content is YAML.

```yaml
# profile.grid
gap: 8
areas: |
  photo
  name
  bio

400:
  cols: 120 1fr
  areas: |
    photo name
    photo bio
```

- `areas` draws the grid. Each word is a cell. Cells with the same name make one area.
- `400:` is a **step**. It applies when the container is 400 px wide or wider.
- `cols: 120 1fr` sets the columns. A bare number is px.

The layout is named after the file (`profile`). Each layout on a page needs a different name.

## Use it

Each direct child names its area with `data-grid-area`.

**Svelte**

```svelte
<script lang="ts">
	import { Grid } from '@gridconfig/svelte';
	import layout from './profile.grid';
</script>

<Grid {layout}>
	<img data-grid-area="photo" src={user.photo} alt="" />
	<h2 data-grid-area="name">{user.name}</h2>
	<p data-grid-area="bio">{user.bio}</p>
</Grid>
```

**React**

```tsx
import { Grid } from '@gridconfig/react';
import layout from './profile.grid';

export function Profile({ user }) {
	return (
		<Grid layout={layout}>
			<img data-grid-area="photo" src={user.photo} alt="" />
			<h2 data-grid-area="name">{user.name}</h2>
			<p data-grid-area="bio">{user.bio}</p>
		</Grid>
	);
}
```

Other props of `Grid` (`class`, `id`, event handlers) go to the grid element.

`Grid` renders two elements. The outer one is the container that the steps measure. The inner one is the grid. A grid cannot measure itself, so it needs the outer element.

## The container: width or a fixed box

By default, steps measure the **width** of the container. The height of the layout comes from its content, as it does for a normal block. This is right for most layouts in a page.

Some layouts fill a box with a fixed size: a card in a grid of cards, a banner, a panel. They can change with the height too. Set `container: size`:

```yaml
container: size
areas: A

300x200:
  areas: A B
```

`300x200` means 300 px wide or wider, and 200 px high or higher.

With `container: size`, the container does not get its height from its content. Give it a height from the page, for example with a parent that has a height. If it has no height, it is 0 px high and you see nothing. The inspector warns about this in the console.

## Without a build step

A layout can also be a string or an object in code, with the `grid` function:

```ts
import { grid } from '@gridconfig/core';

const layout = grid`
  areas: A
  600:
    areas: A B
`;

const same = grid({ areas: 'A', 600: { areas: 'A B' } });
```

With the Vite plugin, a static `grid` call compiles at build time, as a `.grid` file does. Without the plugin, or when the object is built from variables, it compiles in the browser and `Grid` injects its CSS.

## Options for every layout

The plugin takes the options that apply to every layout: named breakpoints, a prefix for tokens, and the cascade layer.

```ts
layoutPlugin({ breakpoints: { md: '600..' }, tokenPrefix: 'ds', layer: 'components' });
```

A layout that compiles in the browser gets these options from the plugin too. You do not need to do anything.

Where there is no plugin, for example in a test runner or a different bundler, make your own `grid` with `createGrid`. Keep the options in one file, so that the plugin can use the same ones:

```ts
// src/lib/grid.ts
import { createGrid } from '@gridconfig/core';

export const options = { breakpoints: { md: '600..' }, tokenPrefix: 'ds' };
export const grid = createGrid(options);
```

Import `grid` from this file in place of `@gridconfig/core`. To compile its static calls at build time, tell the plugin where the file is:

```ts
// vite.config.ts
import { options } from './src/lib/grid.ts';

layoutPlugin({ ...options, modules: ['./src/lib/grid.ts'] });
```

## The inspector

In development, `Grid` loads an overlay that draws the areas, the tracks and the active step. Press Alt+Shift+G to show or hide it, or pass `debug` to `Grid` to open it on that grid. It can resize the layout to each step, and it finds markup problems such as a child with no `data-grid-area`. Refer to [@gridconfig/devtools](../packages/devtools/README.md).

Next: [Steps](./steps.md).
