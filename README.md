# GridConfig

A powerful layout engine that utilises CSS Grid and @Container Queries.

Describe a CSS grid that changes shape with its container. GridConfig compiles the description to static CSS container queries plus a small DOM contract that any framework can use.

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
import card from './card.grid'; // a file

import { grid } from '@gridconfig/core';
const inline = grid`
  areas: A
  600:
    areas: |
      A A
      B B
`; // a string in code
const object = grid({ areas: 'A', 600: { areas: 'A A\nB B' } }); // an object
```

With the Vite plugin, static layouts compile at build time. Without it, they compile when the code runs.

**Status:** early prototype. Nothing is published yet. The format is in [`spec/spec.md`](spec/spec.md) (draft 0.3).

## Repository structure

| Path                | Package                | What it is                                                                                          |
| ------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| `spec/`             |                        | The spec. Also two notes on Tailwind and StyleX (explorations, not plans). Later: test fixtures.    |
| `packages/core`     | `@gridconfig/core`     | Parser, compiler, value grammar, `grid`, types. `./runtime` has the parts that need no YAML parser. |
| `packages/unplugin` | `@gridconfig/unplugin` | Bundler plugins. Vite for now: loads `.grid` files and compiles static `grid` calls.                |
| `packages/svelte`   | `@gridconfig/svelte`   | `Grid` component for Svelte 5                                                                       |
| `apps/site`         | `@gridconfig/site`     | The gridconfig.dev site: docs and playground (currently a demo page)                                |

Planned: `cli`, `react`, `vue`, `astro`, `element` (Web Components), an editor extension for `.grid` files, `examples/`, and browser conformance tests.

## Development

```sh
pnpm install
pnpm dev     # the site
pnpm test    # tests in core and unplugin (Node's built-in test runner)
pnpm check   # type-check
pnpm lint
```

## License

[MIT](LICENSE)
