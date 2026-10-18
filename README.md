# GridConfig

A powerful layout engine that utilises CSS Grid and @Container Queries.

Describe a CSS grid that changes shape with its container. GridConfig compiles the description to static CSS container queries plus a small DOM contract that any framework can use.

[See the Spec for more](spec/spec.md)

```yaml
# card.grid
name: card
areas: A

100x100:
  gap: 4
  areas: |
    B B
    A A

200x200:
  gap: '{space.2}'
  rows: 1fr 40px
  areas: |
    A A
    . B
```

A layout is YAML. Write it in a `.grid` file (the first choice), in a template string, or as an object:

```ts
// a standalone file
import card from './card.grid';

// inline as string ...
import { grid } from '@gridconfig/core';
const inline = grid`
  areas: A
  600:
    areas: |
      A A
      B B
`;

// ... or as an object
const object = grid({ areas: 'A', 600: { areas: 'A A\nB B' } });
```

With the Vite plugin, static layouts compile at build time. Without it, they compile when the code runs.

**Status:** early prototype. Nothing is published yet. The format is in [`spec/spec.md`](spec/spec.md) (draft 0.3).

## Repository structure

| Path                   | Package                             | What it is                                                                                                     |
| ---------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `spec/`                |                                     | The spec, the test fixtures (`spec/fixtures`), and two notes on Tailwind and StyleX (explorations, not plans). |
| `packages/core`        | `@gridconfig/core`                  | Parser, compiler, value grammar, `grid`, types. `./runtime` has the parts that need no YAML parser.            |
| `packages/unplugin`    | `@gridconfig/unplugin`              | Bundler plugins. Vite for now: loads `.grid` files and compiles static `grid` calls.                           |
| `packages/svelte`      | `@gridconfig/svelte`                | `Grid` component for Svelte 5                                                                                  |
| `packages/conformance` | `@gridconfig/conformance` (private) | Loads the fixtures in Chromium and checks the layout the browser makes.                                        |
| `apps/site`            | `@gridconfig/site`                  | The gridconfig.dev site: docs and playground (currently a demo page)                                           |

Planned: `cli`, `react`, `vue`, `astro`, `element` (Web Components), an editor extension for `.grid` files, and `examples/`.

## Development

```sh
pnpm install
pnpm dev     # the site
pnpm test    # tests in core and unplugin (Node's built-in test runner)
pnpm test:browser  # fixtures in Chromium (once: pnpm exec playwright install chromium)
pnpm check   # type-check
pnpm lint
```

## License

[MIT](LICENSE)

## Cascade layers

The compiled CSS goes in the cascade layer `gridconfig`, except the hide rules. A utility class in a later layer can override a layout. Use the `layer` option to set the name, or `layer: false` for no layer. Tailwind users: set `layer: 'components'`. Use `baseCssFor(layer)` for the shared base. Refer to the [spec](./spec/spec.md).
