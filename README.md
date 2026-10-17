# GridConfig

Describe a CSS grid that changes shape with its container, in YAML. GridConfig compiles it to static CSS container queries plus a small DOM contract that any framework can use.

```yaml
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

**Status:** early prototype. The format is specified in [`spec/spec.md`](spec/spec.md) (draft). Nothing is published yet.

## Repository layout

| Path                | Package                | What it is                                                                     |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `spec/`             |                        | The layout file spec (and, later, conformance fixtures)                        |
| `packages/core`     | `@gridconfig/core`     | Parser, compiler, value grammar, types. `./runtime` has the parser-free parts. |
| `packages/unplugin` | `@gridconfig/unplugin` | Bundler plugins. Vite for now: `import layout from './hero.yaml?layout'`.      |
| `packages/svelte`   | `@gridconfig/svelte`   | `Grid` component for Svelte 5                                                  |
| `apps/site`         | `@gridconfig/site`     | The gridconfig.dev site: docs and playground (currently a demo page)           |

Planned: `cli`, `react`, `vue`, `astro`, `element` (Web Components), `examples/`, and browser conformance tests.

## Development

```sh
pnpm install
pnpm dev     # the site
pnpm test    # core tests (Node's built-in test runner)
pnpm check   # type-check
pnpm lint
```

## License

[MIT](LICENSE)
