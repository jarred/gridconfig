# Taffy support for GridConfig

**Status: research note.** This document is for review. No work is planned. Nothing here is a promise. Claims that we did not test are in the section [Not verified](#not-verified). We read the documentation and the source of Taffy 0.15.1. We did not write or run Rust code.

## Summary

Taffy is a layout engine in Rust. It calculates the position and the size of each node in a tree. It implements the CSS Grid, Flexbox, and Block algorithms. It is not a CSS engine: it has no selectors, no cascade, no at-rules, and no custom properties.

GridConfig can support Taffy. Taffy has each layout feature that a GridConfig layout uses: named grid areas, track sizes, gap, padding, hidden nodes, and flex containers. Nothing in Taffy stops the work.

The work is on the GridConfig side. The compiler makes only CSS today, and Taffy cannot read CSS rules. A Taffy target needs three things that do not exist:

1. **A resolved layout.** A function that takes a layout and a container size, and gives the values that apply at that size. The inspector has this function as a prototype (`resolve` in `packages/devtools/src/model.ts`).
2. **Values as data.** The compiler keeps each value as a CSS string. A Taffy target needs numbers and track lists. Some values cannot go to Taffy at all, for example `var(--x)` with no known value.
3. **The container query.** In a browser, `@container` selects the step. Taffy has no container queries. The program that uses Taffy must select the step, with the size of the host.

We recommend items 1 and 2 as work in core, because the playground, the design tool, and a `gridconfig explain` command need them too. We recommend a small test in TypeScript before a Rust crate, with one of the WebAssembly builds of Taffy.

## Background

### What Taffy does

- Taffy takes a tree of nodes. Each node has a `Style`. Taffy gives each node a `Layout`: an x and y position, and a width and a height.
- The high-level API is `TaffyTree`. It stores the nodes, keeps a cache, and selects the algorithm for each node.
- The low-level API is a set of traits (the main one is `LayoutPartialTree`) and one function for each algorithm, for example `compute_grid_layout`. A program that has its own tree uses this API.
- The algorithms are cargo features: `grid`, `flexbox`, `block_layout`, and `float_layout`. All are on by default. `calc` is also a default feature.
- The `parse` feature reads a CSS value from a string, for example a track list with `repeat()` and `minmax()`. It does not read a rule or a stylesheet.
- Named grid lines and named grid areas are available from version 0.9. `Style` has the fields `grid_template_areas`, `grid_template_column_names`, and `grid_template_row_names`.
- `calc()` is available in the low-level API from version 0.8. The program gives Taffy a pointer to its own expression, and Taffy calls `resolve_calc_value` when it needs the result.
- Lengths are numbers with no unit. One GridConfig px is one Taffy unit. The program applies the scale of the screen.

### Who uses Taffy

Taffy is the layout engine of Dioxus and Blitz, of Bevy UI, and of GPUI (the UI framework of the Zed editor). Servo uses it for CSS Grid. Bindings for JavaScript exist as WebAssembly packages, but none is from the Taffy project: `taffy-layout` (ByteLand Technology) and TaffyJS (`@taffyjs/node`, `@taffyjs/wasm`). The Taffy repository lists its own WebAssembly bindings and C bindings as work in progress.

Thus Taffy support has two possible audiences:

- **Rust programs** with a native UI. They have no browser, and they want the same `.grid` file to control a native layout.
- **JavaScript programs with no DOM**: a canvas, WebGL, a terminal UI, or a server that makes images or PDF files.

### What GridConfig makes

The output is CSS: the shared base, one block for each step in an `@container` rule, the area placement rules, and the hide rules. The browser does three jobs that the CSS does not show:

1. It measures the host, and finds the steps that match.
2. It applies the cascade: for each property, the last matching step that sets it wins.
3. It resolves each value: `var()`, `calc()`, and container units.

With Taffy, GridConfig or the program must do these three jobs.

## Where the two systems meet

| GridConfig feature                         | Taffy                                                   | Result                                                                 |
| ------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| Area map                                   | `grid_template_areas`, or line numbers on each child    | Works. Line numbers are the simpler form. Refer to [Areas](#areas).    |
| `cols`, `rows`: px, `fr`, `auto`, percent  | Track sizing functions                                  | Works.                                                                 |
| `minmax()`, `fit-content()`, `1fr*3`       | Min and max sizing functions, `repeat()` with a count   | Works.                                                                 |
| `repeat(auto-fill, …)`                     | `auto-fill` and `auto-fit` counts                       | Works.                                                                 |
| Line names in a track list                 | `grid_template_column_names`, `grid_template_row_names` | Works from Taffy 0.9.                                                  |
| `gap`, `padding`                           | `gap`, `padding`                                        | Works when the value is a length or a percent.                         |
| Hidden areas                               | `Display::None` on the child                            | Works. There is no `!important` problem, because there is no cascade.  |
| `flow`                                     | `Display::Flex` and the flex container properties       | Works. Each flow property has a Taffy field.                           |
| Nested layouts                             | A grid node in a grid node                              | Works. Refer to [The container query](#problem-1-the-container-query). |
| Query keys (steps)                         | Nothing                                                 | The program selects the step.                                          |
| The cascade of the steps                   | Nothing                                                 | GridConfig resolves it. The one-winner rule makes the result exact.    |
| Tokens (`{space.2}`) and variables (`--x`) | Nothing                                                 | The program gives the values. Refer to [Values](#problem-2-values).    |
| Expressions (`{space.2} + 4`)              | `calc()` with a callback, in the low-level API          | GridConfig calculates the result when all terms are lengths.           |
| Container units (`cqw`, `cqh`, `cqmin`)    | Nothing                                                 | GridConfig changes them to px, because it knows the size of the host.  |
| `clamp()`, `min()`, `max()`, other CSS     | Nothing                                                 | Not portable. An error or a warning for a Taffy target.                |
| `css` (raw declarations)                   | Nothing                                                 | Not portable. Ignored with a warning.                                  |
| Cascade layers                             | Nothing                                                 | Not applicable.                                                        |
| `--grid-step`, `--grid-gap`                | Nothing                                                 | The resolved layout gives the active step and the gap as data.         |
| The inspector                              | Nothing                                                 | Not applicable. It needs a DOM.                                        |

## A Taffy target

The target has two parts. The first part is in core and has no Taffy code. The second part is small, and one exists for each language.

### Part 1: the resolved layout (core)

```ts
resolveLayout(layout, { width, height }, { tokens? }): ResolvedLayout
```

```ts
type ResolvedLayout = {
	/** The key of the active step, or "base". */
	step: string;
	/** Rows of cell names. */
	areas: string[][];
	/** The first and last line of each area that is in the map. */
	boxes: Record<string, { row: [number, number]; col: [number, number] }>;
	/** The area names of the layout that are not in the map at this size. */
	hidden: string[];
	cols: Track[];
	rows: Track[];
	gap: [Length, Length];
	padding: [Length, Length, Length, Length];
	flow: Record<string, Flow>;
};
```

The function does the three jobs of the browser:

1. It finds the steps that match the size, with `matches` from `@gridconfig/core/runtime`.
2. For each property, it takes the value of the last matching step that sets it. The steps are in cascade order already. The compiler has proved that this step is the one winner.
3. It changes each value to data. Refer to [Problem 2](#problem-2-values).

`ResolvedLayout` is plain data. Thus it can go through JSON to a program in a different language.

A program in a different language cannot call a TypeScript function at each resize. For that case, the layout itself must go through JSON, and the resolve step must exist in that language. The debug data (`DebugInfo`) is almost this format: it has the steps in cascade order, with the condition of each step as data. It has two gaps: the values are CSS strings, and it is only present with `debug: true`.

### Part 2: the adapter

The adapter changes a `ResolvedLayout` to Taffy styles. This is a sketch, and we did not compile it:

```rust
// The grid node.
let mut grid = Style {
    display: Display::Grid,
    size: Size { width: percent(1.0), height: percent(1.0) },
    grid_template_columns: tracks(&resolved.cols),
    grid_template_rows: tracks(&resolved.rows),
    gap: gap(&resolved.gap),
    padding: padding(&resolved.padding),
    ..Default::default()
};

// One child for each area.
for (name, node) in &children {
    let style = match resolved.boxes.get(name) {
        // The area is in the map: place it with line numbers.
        Some(b) => Style {
            grid_row: line(b.row.0)..line(b.row.1),
            grid_column: line(b.col.0)..line(b.col.1),
            ..flow_style(resolved.flow.get(name))
        },
        // The area is not in the map at this size.
        None => Style { display: Display::None, ..Default::default() },
    };
    tree.set_style(*node, style)?;
}
```

### Areas

Taffy has `grid_template_areas`, and a child can use the name of an area for its placement. But the adapter does not need it. The compiler already knows the rectangle of each area (`areaBoxes` in the inspector does this). The adapter can give each child its line numbers.

Line numbers have two advantages. They work in a version of Taffy before 0.9, and they work in each JavaScript binding. Named areas are useful only if the program wants to see the names in its own debug tools.

## Problems

### Problem 1: the container query

This is the largest problem. The step depends on the size of the host. The size of the host comes from the layout of the tree. Thus the step is not known before the layout starts.

A browser solves this with containment: the size of a query container does not depend on its content. Taffy has no containment. There are two ways to do the same thing.

**Two passes, with `TaffyTree`.**

1. Calculate the layout.
2. Read the width and the height of each host.
3. Resolve the layout of each host at that size, and set the styles.
4. Calculate the layout again. Taffy keeps a cache, so only the parts that changed are calculated.

A nested layout needs one more pass for each level, because the size of an inner host is known only after the outer layout is correct. The size of a host must not depend on its content. If it does, the passes can change the size again, and the result is not stable. This is the rule that `container-type` gives in CSS, and the program must obey it without help: give the host a definite width, or let its parent stretch it.

**One pass, with the low-level API.** The program has its own tree and implements `LayoutPartialTree`. When Taffy asks for the layout of a host node, the program gets the known size and the available space. It resolves the step at that moment, and then it calls `compute_grid_layout` with the resolved style. This is exact, and it is how a UI framework would do it. It is also more work, and each framework has its own tree.

For `container: inline-size`, only the width is necessary. The height comes from the content, as in CSS. The decision to calculate `auto` rows for `inline-size` layouts applies here with no change.

### Problem 2: values

The compiler changes each value to a CSS string and keeps only the string. The rule "anything else: no change" lets each CSS value through. For CSS output this is correct. For Taffy it is a problem, because Taffy needs data, and it cannot calculate most CSS functions.

A Taffy target needs a value as a small tree:

| Value in a layout                                             | For Taffy                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `8`, `8px`                                                    | A length.                                                             |
| `50%`                                                         | A percent.                                                            |
| `1fr`, `auto`, `min-content`                                  | A track keyword.                                                      |
| `minmax(a, b)`, `fit-content(a)`                              | A track with a minimum and a maximum.                                 |
| `{space.2}`, `--x`                                            | A reference. The program gives a table of values: `{ "space.2": 8 }`. |
| `{space.2} + 4`, `--gap * 2`                                  | An expression. The result is a length when each term is a length.     |
| `10cqw`, `5cqmin`                                             | A length. The resolve step knows the size of the host.                |
| `rem`, `em`                                                   | A length, if the program gives the font size.                         |
| A percent in an expression (`50% - 8`)                        | `calc()` in Taffy, with a callback. Only in the low-level API.        |
| `clamp()`, `min()`, `max()`, `var(--x, 8px)`, other functions | Not portable. The compiler must report it for a Taffy target.         |

A token stays a reference, and the program gives its value. This is the same rule as in CSS output: the compiler never changes a token to its value.

There is a shortcut for the track lists. With its `parse` feature, Taffy can read a CSS track list from a string. Thus the adapter can give Taffy the string that the compiler makes today, after it replaces each `var()` and each container unit with a length. This removes most of the work on track data in a Rust adapter. It does not help a JavaScript binding, which has no parser.

### Problem 3: two implementations of the rules

A Rust program cannot call the TypeScript compiler when it runs. There are three ways to give it a layout:

1. **Compile to JSON at build time.** The TypeScript compiler writes a JSON file for each layout: the steps in cascade order, with conditions and values as data. A Rust crate reads the file, and has only the resolve step (some tens of lines) and the adapter. The Rust code has no parser and no cascade checks.
2. **Write the compiler again in Rust.** Then the two compilers must give the same result for each layout. This is a large cost, and the fixtures in `spec/fixtures` become the only protection.
3. **Run the TypeScript compiler in a JavaScript engine in the Rust program.** Too heavy for this purpose.

We recommend 1. It keeps one implementation of the parser, the step order, and the one-winner rule.

### Problem 4: `css` and content styles

`css` adds raw declarations to the grid element. Taffy cannot use them. A Taffy target ignores `css` and gives a warning.

A page can also style content for a step with a style query on `--grid-step`. There is no equivalent. The resolved layout gives the active step as data, and the program uses it in its own way.

### Problem 5: content sizes

A track with `auto`, `min-content`, or `1fr` needs the size of the content. Taffy asks the program for it with a measure function. The program must measure its own text and images. This is not a GridConfig problem, but a layout does not look the same in Taffy and in a browser unless the measure function and the fonts agree.

## Taffy as a test tool

One use does not need a Rust program. A JavaScript binding of Taffy runs in Node with no browser. The fixtures in `spec/fixtures` give the expected track sizes and area positions at many container sizes. A test can resolve each fixture, calculate it with Taffy, and compare the numbers.

This does not replace the Chromium tests. A browser is the reference for the CSS output, and Taffy can have its own differences. But it is a fast test of `resolveLayout`, and it shows early if a Taffy target gives the same result as a browser.

## Blitz: a different route

Blitz is an HTML and CSS engine from the same organization. It uses Stylo for CSS and Taffy for layout. A program that uses Blitz has real CSS. If Blitz supports container queries and grid areas, the CSS output of GridConfig works there with no Taffy target. This is the same as the "plain import" option in the [Tailwind note](./tailwind-plugin.md). We did not test it.

## What to keep in mind now

These decisions in the current format help a Taffy target, and it is good to keep them:

- The query keys are in px only, and they cannot use a variable. Thus a step is selected with numbers only.
- The one-winner rule. The result at a size does not depend on the order of the rules, so a resolve step is short and exact.
- `flow` sets only properties of the flex container. Each of them has a Taffy field.
- A token is a reference, not a value.

These parts make a Taffy target harder, and they are a reason to be careful with new features of the same type:

- The rule that lets each CSS value through with no change.
- `css`.
- Each feature that depends on the cascade of the page, on inheritance, or on a custom property that the content reads.

## Recommended path

| Step | Work                                                                                                                      | Useful without Taffy                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1    | Move `resolve` from the inspector to core as `resolveLayout`. Add `boxes` and `hidden`.                                   | Yes: inspector, playground, `gridconfig explain`.     |
| 2    | Parse each value to a small tree in core. Keep the CSS string as one output of it. Mark the values that are not portable. | Yes: better errors, the JSON Schema, the design tool. |
| 3    | Define the layout data as a JSON format with a version. It replaces the debug data.                                       | Yes: the design tool, the CLI.                        |
| 4    | Test: a TypeScript adapter for one WebAssembly build of Taffy, and the fixtures as tests in Node.                         | Partly: a fast test of step 1.                        |
| 5    | A Rust crate `gridconfig-taffy`: read the JSON, resolve, make styles. Start with the two-pass method.                     | No.                                                   |
| 6    | Examples for one or two frameworks, with the low-level API if the framework permits it.                                   | No.                                                   |

Steps 1 to 3 are worth doing for other reasons. Decide about steps 4 to 6 when there is a person who wants to use GridConfig in a native program.

## Not verified

1. **The two-pass method.** We did not run it. We did not measure the number of passes for nested layouts, or the cost.
2. **The low-level API.** We read that `LayoutPartialTree` exists and that a program selects the algorithm for each node. We did not confirm the exact inputs that the program gets for a host node.
3. **`calc()` with `TaffyTree`.** The release notes describe `calc()` for the low-level API. We did not find out if the high-level API can use it.
4. **Placement by area name.** We read the source of the resolver for named lines and areas. We did not test a child that uses an area name.
5. **`box-sizing`.** The shared base uses `box-sizing: border-box`. We did not check the default of Taffy.
6. **The JavaScript bindings.** We read the README of `taffy-layout`. It shows `gridTemplateAreas`, `gridRow`, `gridColumn`, flex properties, `gap`, and `padding`. It does not give the version of Taffy that it uses, and it does not show `Display.None` or `calc()`.
7. **Blitz.** We did not check if Blitz supports `@container`, `grid-template-areas`, or `@layer`.
8. **Results that agree with a browser.** Taffy implements the CSS Grid specification, but we did not compare its numbers with Chromium for a GridConfig layout.

## Risks

- **Taffy changes fast.** The version is 0.15, and a minor version can break the API. `Style` became generic over a string type in 0.9. A Rust crate must follow these changes.
- **A second output to keep correct.** Each new feature of the format needs a decision for Taffy: supported, changed, or not portable.
- **Bindings that are not official.** The WebAssembly packages come from other people. One can stop.
- **Small audience.** Most users of a YAML layout format are on the web. The Rust UI audience is real but small.

## Questions for review

1. Is there a person or a project that wants GridConfig in a native program now? If not, do only steps 1 to 3.
2. Is `resolveLayout` in core, or in a package of its own (`@gridconfig/resolve`)?
3. For a Taffy target, is a value that is not portable an error or a warning?
4. Does the layout data (step 3) replace `DebugInfo`, or do both exist?
5. Is the Taffy test tool (step 4) worth a new dev dependency?

## Sources

- Taffy 0.15.1 documentation: <https://docs.rs/taffy/latest/taffy/>
- Taffy grid style source (as used by Servo): <https://doc.servo.org/src/taffy/style/grid.rs.html>
- Taffy named line and area resolver: <https://doc.servo.org/src/taffy/compute/grid/types/named.rs.html>
- Taffy releases (0.8 `calc()`, 0.9 named lines and areas): <https://github.com/DioxusLabs/taffy/releases>
- Taffy repository (bindings in progress): <https://github.com/DioxusLabs/taffy>
- Blitz: <https://github.com/DioxusLabs/blitz>
- `taffy-layout` (WebAssembly bindings, ByteLand Technology): <https://www.npmjs.com/package/taffy-layout>
- TaffyJS (`@taffyjs/node`, `@taffyjs/wasm`): the packages on npm
- Zed, "Add grid support to GPUI" (#36153): <https://git.secluded.site/zed/commit/32f9de612449d4aee68e28ffe1373e26a84516ca>
