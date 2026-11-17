# @gridconfig/vite

The Vite plugin for [GridConfig](https://github.com/jarred/gridconfig). It loads `.grid` files and compiles static `grid` calls at build time. It gives the CSS of each layout to Vite, so the CSS ships as a normal stylesheet.

```sh
npm install @gridconfig/core @gridconfig/vite
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { gridconfig } from '@gridconfig/vite';

export default defineConfig({
  plugins: [gridconfig() /* , sveltekit() or react() */]
});
```

For TypeScript, add the types for `.grid` imports, for example in `src/vite-env.d.ts`:

```ts
/// <reference types="@gridconfig/vite/client" />
```

## Options

| Option        | What it does                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `breakpoints` | Names for queries, for every layout: `{ md: '600..' }`.                                          |
| `tokenPrefix` | A prefix for design tokens: `ds` makes `{space.2}` into `var(--ds-space-2)`.                     |
| `layer`       | The cascade layer. The default is `gridconfig`. `false` gives no layer.                          |
| `modules`     | Modules that export a `grid` from `createGrid`, so their static calls compile at build time too. |

A layout that compiles in the browser gets `breakpoints`, `tokenPrefix` and `layer` from the plugin. Refer to [Options for every layout](https://github.com/jarred/gridconfig/blob/main/docs/getting-started.md#options-for-every-layout).

## Documentation

[The guide](https://github.com/jarred/gridconfig/blob/main/docs/README.md) and [the spec](https://github.com/jarred/gridconfig/blob/main/spec/spec.md).

MIT
