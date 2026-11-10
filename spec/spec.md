# GridConfig spec

**Status: draft 0.6.** The compiler in `packages/core` is the implementation of this spec. The tests are in `packages/core/test`, `packages/vite/test`, and the browser fixtures in [`fixtures`](./fixtures). The [roadmap](../ROADMAP.md) lists the parts that are not built yet.

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
- Two notes explore how GridConfig can work with other tools. They are not part of the spec: [Tailwind](./tailwind-plugin.md) and [StyleX](./stylex-support.md).

The spec does not describe framework usage (Svelte, React, Vue, Astro, Web Components). Each adapter has its own documentation for it.
