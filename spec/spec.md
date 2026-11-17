# GridConfig spec

**Status: 1.0 release candidate.** The format and the output are frozen for 1.0. [Stability](#stability) says what 1.x keeps. The compiler in `packages/core` is the implementation of this spec. The tests are in `packages/core/test`, `packages/vite/test`, and the browser fixtures in [`fixtures`](./fixtures). The [roadmap](../ROADMAP.md) lists the parts that are not built yet.

A layout is a description of a CSS grid. The grid changes shape when the size of its container changes. The compiler makes static CSS (container queries) and a small DOM contract from the layout. The DOM contract does not depend on a framework.

```yaml
name: hero
container: size
areas: A

100x100:
  gap: 4
  areas: |
    A A
    B B

200x200:
  gap: '{space.2}'
  rows: 1fr 40px
  areas: |
    A A
    . B
```

The spec has two normative parts:

1. **[The layout format](./format.md)**: the data that a person writes, the three ways to write it, the rules of the steps and the cascade, and the errors.
2. **[The compiled output](./output.md)**: the CSS and the DOM that each framework adapter must make or use, how the CSS gets to the page, and the core API.

Other documents:

- [Decisions and open questions](./decisions.md): why the spec is as it is, and what is still open.
- [The guide](../docs/README.md): how to use GridConfig, with examples. It is not normative.
- Three notes explore how GridConfig can work with other tools. They are not part of the spec: [Tailwind](./tailwind-plugin.md), [StyleX](./stylex-support.md), and [Taffy](./taffy-support.md).

The spec does not describe framework usage (Svelte, React, Vue, Astro, Web Components). Each adapter has its own documentation for it.

## Stability

GridConfig follows semantic versioning from 1.0. In each 1.x release:

- **A layout that compiles keeps compiling, and keeps its behaviour.** At each container size, the same areas show, in the same cells, with the same tracks, gap, padding and flow, and the same step is active. A new error for a layout that compiled before is a breaking change, so it waits for 2.0.
- **The DOM contract stays.** The attributes `data-grid-host`, `data-grid-layout` and `data-grid-area`, and the rule that children of the grid are direct children. Refer to [DOM contract](./output.md#dom-contract).
- **The CSS contract stays.** The custom properties `--grid-gap`, `--grid-padding` and `--grid-step`, the default layer name `gridconfig`, the base rules from `baseCssFor`, and the layout `name` as the container name. A page can write `@container card (…)` and `@container style(--grid-step: wide)`, and both keep working.
- **The core API stays.** The functions and options in [Core API](./output.md#core-api), and the error shape `{ message, path, range? }`.

A minor release can add settings, query terms, options, API and warnings. These do not change a layout that does not use them.

Not covered: the exact text of the CSS (selectors, rule order, whitespace), the wording of errors and warnings, the format of the debug data (the inspector reads it, and it has its own version number), and the inspector itself. The [JSON Schema](../packages/core/schema.json) follows the compiler: it never rejects a layout that the compiler accepts.

**Browsers.** The output needs container queries, container style queries for `--grid-step`, and cascade layers. The browser tests run each fixture in Chromium, Firefox and WebKit.
