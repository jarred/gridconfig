# Roadmap

What is built, and what is planned. The format is in the [spec](./spec/spec.md).

## Built

- The parser and the compiler: cascade semantics, value grammar, validation, hiding, flow, warnings, and structured errors.
- The query keys: ranges with a maximum, ratios, orientation, AND, OR, named breakpoints, the step order, and the one-winner rule.
- The three forms: YAML text, objects, and the `grid` function. The default `name`, the removal of shared indentation, and the checks for plain data, tags, and multiple documents.
- The Vite plugin (`packages/unplugin`). It loads `.grid` files and `.yaml?grid` imports. It replaces each static `grid` template and object with the compiled result. It only looks at files that import `grid` from `@gridconfig/core`. It reports an error when two files give the same layout name.
- The Vite plugin delivers the CSS of each layout that it compiles as CSS modules. Refer to [Delivery](./spec/output.md#delivery).
- The Svelte `Grid` component (`packages/svelte`) and the React `Grid` component (`packages/react`, React 19). They use the `data-grid-*` attributes, and inject CSS only for a layout that compiled when the code ran.
- The inspector (`packages/devtools`). Refer to [Inspector](./packages/devtools/README.md). Browser tests cover the drawing, the select, the handles, and the checks of the markup.
- Browser tests (`packages/conformance`). Each fixture in `spec/fixtures` is a `.grid` file and a list of expected results at many container sizes. The tests load the compiled CSS in Chromium and compare the used tracks, the gaps, the position of each area, and the computed flow properties of each area. Other tests record how the CSS interacts with page CSS, cascade layers, and resets.

## Not built yet

1. Typed area access, the JSON Schema, `areaColor`, and the CLI.
2. Plugins for bundlers other than Vite.
3. The editor extension.
4. A core entry point without the YAML parser, for code that uses only objects.
5. The shadow-DOM selector strategy for Web Components.
6. More browser fixtures: nested layouts, and browsers other than Chromium.

## Tooling (planned)

- **JSON Schema** for the layout. It gives editor autocomplete for the settings, the query keys, the `container` values, and the flow words.
- **`.grid` extension.** The content is the YAML that [Ways to write a layout](./spec/format.md#ways-to-write-a-layout) describes. The editor extension will give syntax colors, the schema, and diagnostics. Until it exists, a `.gitattributes` line (`*.grid linguist-language=YAML`) and a Prettier override (`parser: yaml`) can give basic support. The Prettier override works in this repository (it needs `useTabs: false`). We did not test the `.gitattributes` line on GitHub.
- **Area colors.** Core will export `areaColor(name, index)`. It gives a perceptually even palette for light and dark themes. The editor, the inspector, the playground, and the CLI use it. Thus an area has the same color in each tool.
- **CLI.** `gridconfig build` writes the CSS and a typed module for each layout.
- **Runtime.** `compileLayout` stays available in the browser for the playground and the future design tool.
