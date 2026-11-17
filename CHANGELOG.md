# Changelog

All the packages (`@gridconfig/core`, `vite`, `svelte`, `react` and `devtools`) have the same version. The project follows [semantic versioning](https://semver.org). [Stability](./spec/spec.md#stability) says what each 1.x release keeps.

## 1.0.0 (2026-11-17)

The first release.

**The format** ([spec](./spec/format.md))

- A layout is YAML in a `.grid` file, a `grid` template, or an object. The top level is the base step. Each other key is a step.
- Query keys for width, height, ranges, ratios and orientation, with AND (a space), OR (a comma) and named breakpoints.
- The one-winner rule: at each size, each setting has one clear winner. Two steps that can tie are an error that gives the size where they meet. The order of the steps in the file never decides the result.
- Area maps as text, tracks with `SIZE*N`, values with px numbers, custom properties, design tokens and simple math.
- `flow` arranges the content of an area with flexbox, and it follows the steps.
- Errors with the line and the column. Warnings for `css` values that overlap, steps with no effect, and height units without a height.

**The output** ([spec](./spec/output.md))

- Static CSS container queries in the cascade layer `gridconfig`. No layout JavaScript at runtime.
- The DOM contract `data-grid-host`, `data-grid-layout` and `data-grid-area`, the same in each framework.
- `--grid-step`, `--grid-gap` and `--grid-padding` on the grid element, for style queries and for content.
- `onStepChange` and `readStep` in `@gridconfig/core/runtime` for work that CSS cannot do.

**The packages**

- `@gridconfig/core`: the parser and the compiler, with `grid`, `createGrid` and `compileLayout`. `/object` leaves out the YAML parser. `/schema.json` is a JSON Schema for editor completion.
- `@gridconfig/vite`: loads `.grid` files, compiles static `grid` calls at build time, and bundles the CSS.
- `@gridconfig/svelte` (Svelte 5) and `@gridconfig/react` (React 19): the `Grid` component, with server rendering.
- `@gridconfig/devtools`: a read-only overlay that draws the areas, the tracks and the active step, and finds mistakes in the markup.

**Tests**

- The browser tests examine each fixture in Chromium, Firefox and WebKit, at many container sizes, with and without a cascade layer.
