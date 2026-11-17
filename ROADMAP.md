# Roadmap

What is built, and what is planned. The format is in the [spec](./spec/spec.md).

## Built

- The parser and the compiler: cascade semantics, value grammar, validation, hiding, flow, warnings, and structured errors.
- The query keys: ranges with a maximum, ratios, orientation, AND, OR, named breakpoints, the step order, and the one-winner rule.
- The three forms: YAML text, objects, and the `grid` function. The default `name`, the removal of shared indentation, and the checks for plain data, tags, and multiple documents.
- The Vite plugin (`packages/vite`, `@gridconfig/vite`). It loads `.grid` files and `.yaml?grid` imports. It replaces each static `grid` template and object with the compiled result. It only looks at files that import `grid` from `@gridconfig/core`. It reports an error when two files give the same layout name.
- The Vite plugin delivers the CSS of each layout that it compiles as CSS modules. Refer to [Delivery](./spec/output.md#delivery).
- The Svelte `Grid` component (`packages/svelte`) and the React `Grid` component (`packages/react`, React 19). They use the `data-grid-*` attributes. For a layout that compiled when the code ran, they put its CSS on the page one time (`mountStyles` in core), and replace it when the layout changes.
- A core entry without the YAML parser (`@gridconfig/core/object`), for code that writes layouts as objects. `grid` and `createGrid` take an object only there.
- `onStepChange` in `@gridconfig/core/runtime`: a listener and a `gridstepchange` event for a change of the active step. The `Grid` components have it as a prop.
- The JSON Schema for the layout (`@gridconfig/core/schema.json`). Editors with the YAML language server use it for completion, hover text and the common errors. A test checks that each layout in the fixtures, the guide and the spec that the compiler accepts also passes the schema.
- The inspector (`packages/devtools`). Refer to [Inspector](./packages/devtools/README.md). The overlay only reads the page. Browser tests cover the drawing, the active step, the hover, and the checks of the markup.
- Browser tests (`packages/conformance`). Each fixture in `spec/fixtures` is a `.grid` file and a list of expected results at many container sizes. The tests load the compiled CSS in Chromium and compare the used tracks, the gaps, the position of each area, and the computed flow properties of each area. Other tests record how the CSS interacts with page CSS, cascade layers, and resets.

## Not built yet

1. Typed area access, `areaColor`, and the CLI.
2. Plugins for bundlers other than Vite.
3. The editor extension.
4. The shadow-DOM selector strategy for Web Components.
5. More browser fixtures: nested layouts, and browsers other than Chromium.

## Tooling (planned)

- **`.grid` extension.** The content is the YAML that [Ways to write a layout](./spec/format.md#ways-to-write-a-layout) describes. The editor extension will give syntax colors, the schema, and diagnostics. Until it exists, the JSON Schema with the YAML language server, and a Prettier override (`parser: yaml`), give basic support. Refer to [Editor support](./docs/getting-started.md#editor-support). A `.gitattributes` line (`*.grid linguist-language=YAML`) may give colors on GitHub. The Prettier override works in this repository (it needs `useTabs: false`). We did not test the `.gitattributes` line on GitHub.
- **Area colors.** Core will export `areaColor(name, index)`. It gives a perceptually even palette for light and dark themes. The editor, the inspector, the playground, and the CLI use it. Thus an area has the same color in each tool.
- **CLI.** `gridconfig build` writes the CSS and a typed module for each layout.
- **Runtime.** `compileLayout` stays available in the browser for the playground and the future design tool.
