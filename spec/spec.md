# GridConfig layout spec

**Status: draft 0.3.** The compiler in `packages/core` is the implementation of this document. The tests are in `packages/core/test` and `packages/unplugin/test`. Refer to [Implementation notes](#implementation-notes) for the parts that are not built yet.

Two other notes explore how GridConfig can work with other tools. They are not part of this spec: [Tailwind](./tailwind-plugin.md) and [StyleX](./stylex-support.md).

A layout is a description of a CSS grid. The grid changes shape when the size of its container changes. The compiler makes static CSS (container queries) and a small DOM contract from the layout. The DOM contract does not depend on a framework. This document has two parts:

1. **The layout**: the data that a person writes. Section 1 describes the data model and the three ways to write it.
2. **The compiled output**: the CSS and the DOM that each framework adapter must make or use.

This document does not describe framework usage (Svelte, React, Vue, Astro, Web Components). Each adapter has its own documentation for it.

```yaml
name: hero
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

---

## 1. The layout

### Ways to write a layout

A layout is plain data. There are three ways to write it. All three give the same data model, and the same rules apply to all of them.

| Form              | Example                     | Use                                                     |
| ----------------- | --------------------------- | ------------------------------------------------------- |
| A `.grid` file    | `hero.grid`                 | The first choice. Tools read and write this form.       |
| A string in code  | `` grid`name: hero …` ``    | A layout that is only for one component.                |
| An object in code | `grid({ name: 'hero', … })` | A layout that code makes, for example from shared data. |

**The `.grid` file.** A `.grid` file is a UTF-8 text file. Its content is YAML 1.2 with these limits:

- The file has one document.
- The file has no tags (for example `!!str`).
- A leading tab counts as two spaces, because YAML does not permit tabs as indentation.

A `.yaml` or `.yml` file with the same content is also a layout. Tools handle `.grid` first, and `.yaml` and `.yml` second. JSON is also valid, because JSON is valid YAML 1.2.

**The string in code.** The tag `grid` takes a template literal. The template must be static. It cannot have `${}` expressions. The compiler removes the indentation that all lines share. Thus a layout can have the same indentation as the code around it.

**The object in code.** The function `grid` also takes an object. The object must be plain data: strings, numbers, booleans, arrays, and objects. It cannot have functions, symbols, `NaN`, dates, or class instances. A value of `undefined` counts as absent. Query keys can be numbers (`600: { … }`).

A template must always be static. An object can be static or dynamic. A build plugin compiles a template or an object at build time when each value in it is written as a literal in the code. If an object has a variable, a spread, or a call, the object compiles when the code runs.

An area map is a multi-line string in all three forms. A list of rows is not permitted.

### Top level

The top level is the **base step**. It also has these keys.

| Key         | Required | Description                                                                                                                                  |
| ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`      | no       | An identifier (`[A-Za-z_][\w-]*`). It is the name of the container and a part of the `data-grid-layout` selector. See below for the default. |
| `container` | no       | `size` (default) or `inline-size`. Use `inline-size` if the container has no fixed height.                                                   |

The default `name` has two sources, in this order:

1. The file name without its extension. A tool gives it to the compiler as `defaultName`. The compiler changes each character that is not valid to `-`. If the result starts with a digit, the compiler adds `_` at the start. Thus `1-hero.card.grid` becomes `_1-hero-card`.
2. A hash of the content, written `gc-` and seven characters. The same content always gets the same name, in each of the three forms.

Two layouts on one page must not have the same name. A tool must report an error or add a hash when two file names are the same.

Each other key is a step setting (below) or a query key. The base step must set `areas`. Thus there is always an active area map.

### Steps and query keys

The top-level settings are the base step. Each query key defines one more step.

A query key gives minimum values, in px. A query key cannot use a variable or a token, because CSS does not permit `var()` in a container condition.

| Key       | Compiles to                                  |
| --------- | -------------------------------------------- |
| `600x400` | `(min-width: 600px) and (min-height: 400px)` |
| `600x`    | `(min-width: 600px)`                         |
| `x400`    | `(min-height: 400px)`                        |
| `600`     | same as `600x`                               |

The compiler puts the steps in this order: first by min-width, then by min-height. A missing value counts as 0. This order is the cascade order. If more than one step matches, the later step wins, one property at a time.

### Settings

All settings are optional in a query step.

| Key       | Description                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| `areas`   | The area map (below).                                                                                        |
| `cols`    | The column tracks (below).                                                                                   |
| `rows`    | The row tracks (below).                                                                                      |
| `gap`     | A [value](#values). It sets `--gap` on the grid element. The grid applies `--gap` as `gap`.                  |
| `padding` | A [value](#values). It sets `--padding` on the grid element. The grid applies `--padding` as `padding`.      |
| `css`     | Raw declarations. The compiler adds them to the grid element in this step. It does not parse or change them. |

`--gap` and `--padding` are custom properties on the grid element. Thus children can use them (`padding: var(--gap)`). Each layout sets both to `0` on its grid element. Thus a nested layout does not get the values of its parent.

### Area map

The area map is a multi-line string. Each line is a row.

- `.` is an empty cell. A series of only dots counts as one empty cell.
- If one or more lines have a space, spaces separate the cells. Thus a name can have more than one character (`hdr hdr nav`). If no line has a space, each character is a cell (`AAB`).
- A name matches `[A-Za-z_][\w-]*`. A name must not be `auto`, `span`, `default`, `inherit`, `initial`, `unset`, or `revert`.
- All rows must have the same number of cells.
- Each named area must make a filled rectangle.

### Tracks

`cols` and `rows` accept a number or a track list. Spaces separate the tracks in a track list.

| Input         | Output                                 |
| ------------- | -------------------------------------- |
| `3` (alone)   | `repeat(3, 1fr)`                       |
| `3x200px`     | `repeat(3, minmax(200px, 1fr))`        |
| `1fr*3`       | `repeat(3, 1fr)`                       |
| `100 1fr`     | `100px 1fr`                            |
| anything else | no change, after the value rules apply |

- A single number is a repeat count. It must be a positive integer. In a list, a bare number is px.
- In the shorthands `NxSIZE` and `SIZE*N`, `SIZE` obeys the [value grammar](#values). But `SIZE` cannot have spaces or operators. Use `minmax()` or `calc()` for a more complex size.
- Spaces in `()` or `{}` do not split tokens. Thus `minmax(100px, 1fr)` is one track.
- A track list cannot have operators. Use `calc()` for one track.
- A step can set `areas` and not set `cols` or `rows`. Then the compiler calculates the missing item from the area map as `repeat(N, 1fr)`. The compiler writes it in the output of that step.
- If the compiler knows the number of tracks, the number must be the same as in the area map. The compiler does not count `auto-fill` and `auto-fit`. Thus it does not check them.

### Values

The settings `gap` and `padding`, and the track sizes in `cols` and `rows`, use the same grammar.

A value is a list of **terms**. Whitespace separates the terms. Whitespace in `()` or `{}` does not separate terms.

| Term                              | Meaning                                                            | Output                 |
| --------------------------------- | ------------------------------------------------------------------ | ---------------------- |
| a bare number (`8`, `-2.5`)       | A length in px. `0` stays `0`.                                     | `8px`                  |
| `--name`                          | A CSS custom property.                                             | `var(--name)`          |
| `{path.to.token}`                 | A design token.                                                    | `var(--path-to-token)` |
| `+`, `-`, `*`, `/`                | An operator, only if it is a separate term.                        | see below              |
| anything else (`4px`, `clamp(…)`) | No change. The compiler still replaces `{token}` references in it. | no change              |

**Tokens.** `{space.2}` becomes `var(--space-2)`. Dots become hyphens. The path can have the characters `[A-Za-z0-9_.-]`. The compiler option `tokenPrefix` adds a prefix (`ds` gives `--ds-space-2`).

The option `tokenVar(path)` replaces the mapping fully. It receives `space.2` and returns the CSS value to use.

The compiler never changes a token to its value. A token is a CSS variable. Thus theming works at runtime.

**Expressions.** If a value has an operator term, the complete value is one expression. The compiler puts it in `calc()`. An operator must have whitespace on each side. Thus `--space-2` is a variable and `--a - --b` is a subtraction.

A bare number next to `*` or `/` has no unit. Each other bare number becomes px. A value cannot be an expression and a list of values at the same time. To do math on one part of a list, write an explicit `calc()` for that part.

If a value has no operator term, each term is separate. Thus a list of two values, for example `4 8`, works.

| You write                 | Compiles to                          |
| ------------------------- | ------------------------------------ |
| `8`                       | `8px`                                |
| `4 8`                     | `4px 8px`                            |
| `--gap`                   | `var(--gap)`                         |
| `{space.2}`               | `var(--space-2)`                     |
| `{space.2} 16`            | `var(--space-2) 16px`                |
| `--gap * 2`               | `calc(var(--gap) * 2)`               |
| `{space.2} + 4`           | `calc(var(--space-2) + 4px)`         |
| `var(--x, 8px)`           | `var(--x, 8px)`                      |
| `clamp(4, {space.2}, 16)` | no change, but the token is replaced |

Note about YAML: a value that starts with `{` must have quotes (`'{space.2}'`). If not, YAML reads it as a mapping.

### Cascade semantics

Each step is a **patch on the base**. A step writes only the values that it sets. If more than one step matches, the cascade of the browser decides. Thus the later step wins, one property at a time. A step does not inherit from the previous step. A step never depends on the match of another step.

- Only the steps that set `gap`, `padding`, `areas`, `cols`, `rows`, or `css` write them.
- A step can set `areas` and not set `cols` or `rows`. Then the step writes calculated tracks for the missing axis (refer to [Tracks](#tracks)). These tracks replace the tracks of earlier steps. Thus old tracks cannot conflict with an area map of a different size.
- A step can set `cols` or `rows` and not set `areas`. Then the step writes only the tracks.
- The **active area map** at a container size is the map of the last matching step that sets `areas`.

Nested ranges (`100x100 → 200x200 → 600x600`) work as people expect. Steps on different axes (`x400` with `600`) also work. Each property comes from the last matching step that sets it.

**Validation.** The compiler checks the tracks of a step against each area map that can be active at the same time as the tracks. It checks a step that sets `areas` and tracks against its own map. It checks a step that sets only `cols` or `rows` against each step with `areas`. That step must be able to be active when the first step matches. Only a mismatch that the compiler can prove is an error.

### Hidden areas

The layout hides an item when its `data-grid-area` is not in the active area map.

Take each step that sets `areas`. The layout uses some area names that are not in the map of this step. The layout hides these areas when this step matches and no later step with `areas` matches. A later step cannot cancel `display: none`. Thus the compiler writes the rule as an exclusive range. The range uses `not (…)` conditions.

An omitted area is always hidden. This is absolute in v1. You cannot keep an absent area visible. The hide rule is `display: none !important`.

The compiler never puts it in a cascade layer. Thus it wins against the normal CSS of the page, for example a `display: flex` on the item. Only another `!important` can override it. That `!important` must have equal or higher specificity, or be in a cascade layer. Refer to the Open questions for what can change this.

---

## 2. The compiled output

### DOM contract

```html
<div data-grid-host="hero">
	<!-- the query container -->
	<div data-grid-layout="hero">
		<!-- the grid -->
		<h1 data-grid-area="A">…</h1>
		<!-- direct children name their cell -->
		<div data-grid-area="B">…</div>
	</div>
</div>
```

- The host is the query container, because a grid cannot query its own size.
- Children must be **direct children** of the grid element. Each child gives its cell with `data-grid-area`.
- The layout does not place a child that has no `data-grid-area`.
- Layouts can nest. A nested host is in a cell. The shared base rules give it `width: 100%; height: 100%`.

### CSS contract

The compiled output has two parts.

**Shared base (one time for each page).** The rules use `:where()`. Thus they have zero specificity, and each per-layout rule wins over them in any source order.

```css
:where([data-grid-host]) {
	width: 100%;
	height: 100%;
}
:where([data-grid-layout]) {
	display: grid;
	box-sizing: border-box;
	width: 100%;
	height: 100%;
	gap: var(--gap);
	padding: var(--padding);
}
```

**Per layout.** The output for one layout has these parts:

- One block for the base step.
- One `@container` block for each query step.
- The area placement rules.
- The hide rules.

The container name is the `name` of the layout. If the base step does not set `--gap` and `--padding`, they are `0`.

This is example output for the example at the top. The format of the output is not a part of the contract:

```css
[data-grid-host='hero'] {
	container: hero / size;
}

[data-grid-layout='hero'] {
	--gap: 0;
	--padding: 0;
	grid-template-columns: repeat(1, 1fr);
	grid-template-rows: repeat(1, 1fr);
	grid-template-areas: 'A';
}
[data-grid-layout='hero'] > [data-grid-area='A'] {
	grid-area: A;
}
[data-grid-layout='hero'] > [data-grid-area='B'] {
	grid-area: B;
}

@container hero (min-width: 100px) and (min-height: 100px) {
	[data-grid-layout='hero'] {
		--gap: 4px;
		grid-template-columns: repeat(2, 1fr);
		grid-template-rows: repeat(2, 1fr);
		grid-template-areas: 'A A' 'B B';
	}
}

@container hero (min-width: 200px) and (min-height: 200px) {
	[data-grid-layout='hero'] {
		--gap: var(--space-2);
		grid-template-columns: repeat(2, 1fr);
		grid-template-rows: 1fr 40px;
		grid-template-areas: 'A A' '. B';
	}
}

/* B is absent from the base map and shown by every later areas step */
@container hero (not ((min-width: 100px) and (min-height: 100px))) and (not ((min-width: 200px) and (min-height: 200px))) {
	[data-grid-layout='hero'] > [data-grid-area='B'] {
		display: none !important;
	}
}
```

The output uses only standard CSS container queries and grid features. It has no JavaScript and no selectors for a specific framework. Thus a plain stylesheet is sufficient to use it from each framework. The Web Components adapter describes the shadow-DOM variant (selectors that use `:host` and `::slotted()`).

---

## 3. Errors and warnings

The parser and the compiler throw an error for each of these:

- An invalid `name`.
- A file with more than one YAML document, or with a tag.
- An object layout that has a value that is not plain data.
- A `grid` template that has a `${}` expression.
- A base step that has no `areas`.
- An unknown top-level key that is not a valid query key.
- An unknown setting in a step, or `name` or `container` in a step.
- Two query keys that give the same query (`600` and `600x`).
- An empty area map, rows of different lengths, an invalid or reserved area name, or an area that is not a rectangle.
- A track count that is not the same as the area map that the compiler checks it against.
- A malformed value: unbalanced `()` or `{}`, an empty token `{}`, or an operator at the start, at the end, or twice in a row.
- A `css` value that has `</style`. It can break out of an injected `<style>` element.

The compiler gives a warning, and does not fail, for this:

- `cqh`, `cqb`, `cqmin`, or `cqmax` with `container: inline-size`. There is no height to measure. Thus the browser uses viewport units instead.

An error has a structured location: `{ message, path, range? }`. The `path` is the key path in the document (for example `["200x200", "areas"]`).

The `range` is the start and the end of the line and column. The parser makes a document-level YAML parse. Thus ranges are available. Editor diagnostics will use them. A layout in an object has a `path` but no `range`.

---

## 4. Core API

```ts
grid`…`                                         // a static template; returns a compiled layout
grid(input: LayoutInput, options?): CompiledLayout
parseLayout(source: string, options?): Layout     // YAML text
parseLayoutObject(input: LayoutInput, options?): Layout
compileLayout(source: string | Layout, options?): { name: string; css: string; areas: string[]; warnings: Warning[] }
baseCss: string   // the shared base rules, needed once per page
```

`options`: `tokenPrefix`, `tokenVar`, `defaultName`. The tag form takes no options.

`css` is only the per-layout part. The page also needs `baseCss`. `areas` is a list of each area name. Thus generated code can give typed access.

---

## Tooling (planned)

- **JSON Schema** for the layout. It gives editor autocomplete for the settings, the query keys, and the `container` values.
- **`.grid` extension.** The content is the YAML that [Ways to write a layout](#ways-to-write-a-layout) describes. The editor extension will give syntax colors, the schema, and diagnostics. Until it exists, a `.gitattributes` line (`*.grid linguist-language=YAML`) and a Prettier override (`parser: yaml`) can give basic support. We did not test them.
- **Area colors.** Core will export `areaColor(name, index)`. It gives a perceptually even palette for light and dark themes. The editor, the debug overlay, the playground, and the CLI use it. Thus an area has the same color in each tool.
- **CLI.** `gridconfig build` writes the CSS and a typed module for each layout.
- **Runtime.** `compileLayout` stays available in the browser for the playground and the future design tool.

---

## Implementation notes

These parts are built:

- The parser and the compiler: cascade semantics, value grammar, validation, hiding, warnings, and structured errors.
- The three forms: YAML text, objects, and the `grid` function. The default `name`, the removal of shared indentation, and the checks for plain data, tags, and multiple documents.
- The Vite plugin (`packages/unplugin`). It loads `.grid` files and `.yaml?layout` imports. It replaces each static `grid` template and object with the compiled result. It only looks at files that import `grid` from `@gridconfig/core`. It reports an error when two files give the same layout name.
- The Svelte `Grid` component (`packages/svelte`). It uses the `data-grid-*` attributes.

These parts are not built yet:

1. Each `Grid` instance injects the shared base. The CSS packaging work (CLI and bundler plugin) will deliver it one time for each page.
2. Typed area access, the JSON Schema, `areaColor`, and the CLI.
3. Plugins for bundlers other than Vite.
4. The editor extension.
5. A core entry point without the YAML parser, for code that uses only objects.
6. The shadow-DOM selector strategy for Web Components.
7. Tests in a real browser. Only tests without a browser exist. No person looked at the compiled CSS in a browser.

---

## Open questions

- **Hiding (decided for v1, to revisit).** Hiding stays `display: none !important`, not in a layer. Watch for page authors who need an absent area to stay visible. If this is necessary, the candidate is a `keep: [B]` setting. The setting skips the hide rule. It also sets `grid-area: auto` for that area in the step. A possible later alternative is a style-query output profile. It uses a custom property for each area, and it does not use exclusive `not (…)` ranges. It raises the minimum browser version.
- **Layer.** Proposed, not decided: a `layer` compile option. It is off by default. When it is on, it puts everything except the hide rules in an `@layer`. The default is no layer, because a layered rule loses to a normal page reset, for example `* { padding: 0 }`. The [Tailwind note](./tailwind-plugin.md) shows the opposite problem: unlayered rules win over the layers of Tailwind. A layer also changes the hide rule, because `!important` reverses the order of layers.
- **Identifiers.** The container names and the selectors are the `name` of the layout. A name that the compiler makes (a file name or a hash) has a low risk of conflict inside one project. Do production builds add a short hash to prevent a conflict between packages?
- **Token breakpoints.** Named breakpoints (`{bp.md}`) need resolution at build time, because `var()` cannot be in a container condition. They are not in v1.
- **`css` escape hatch.** Raw declarations do not work in the same way in the shadow-DOM output. Decide if the shadow-DOM output permits them.
