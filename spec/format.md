# The layout format

Part of the [GridConfig spec](./spec.md). This part is normative. It describes the data that a person writes, the rules of the compiler, and its errors. The [compiled output](./output.md) describes the CSS and the DOM.

## Ways to write a layout

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

A build plugin does not change text in a comment or in a string. If a file gives the name `grid` to a different variable or parameter, the plugin cannot know which calls use the import. Then the plugin does not compile the calls in that file, and they compile when the code runs. Use an alias for the import to prevent this.

An area map is a multi-line string in all three forms. A list of rows is not permitted.

## Top level

The top level is the **base step**. It also has these keys.

| Key           | Required | Description                                                                                                                                  |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | no       | An identifier (`[A-Za-z_][\w-]*`). It is the name of the container and a part of the `data-grid-layout` selector. See below for the default. |
| `container`   | no       | `inline-size` (default) or `size`. Use `size` for a box with a fixed height, and to use height, ratio, or orientation keys.                  |
| `breakpoints` | no       | Named queries. Refer to [Named breakpoints](#named-breakpoints).                                                                             |

The default `name` has two sources, in this order:

1. The file name without its extension. A tool gives it to the compiler as `defaultName`. The compiler changes each character that is not valid to `-`. If the result starts with a digit, the compiler adds `_` at the start. Thus `1-hero.card.grid` becomes `_1-hero-card`.
2. A hash of the content, written `gc-` and seven characters. The same content always gets the same name, in each of the three forms.

A name must not be a word that CSS reserves for container names: `none`, `and`, `or`, `not`, `default`, `inherit`, `initial`, `unset`, `revert`, or `revert-layer`. A `name` that is one of these words is an error. If a file name gives one of these words, the compiler adds `_` at the start. Thus `none.grid` becomes `_none`.

Two layouts on one page must not have the same name. A tool must report an error or add a hash when two file names are the same.

Each other key is a step setting (below) or a query key. The base step must set `areas`. Thus there is always an active area map.

## Steps and query keys

The top-level settings are the base step. The base step matches each container size. Each query key defines one more step.

A query key is a list of **terms**. A query key cannot use a variable or a token, because CSS does not permit `var()` in a container condition. All sizes are in px.

### Size terms

A size term gives a width range, a height range, or both. An `x` separates the width from the height. A range has a minimum, a maximum, or both. Two dots separate the minimum from the maximum.

| Key              | Compiles to                                        |
| ---------------- | -------------------------------------------------- |
| `600`            | `(min-width: 600px)`                               |
| `600x`, `600..`  | same as `600`                                      |
| `x400`           | `(min-height: 400px)`                              |
| `600x400`        | `(min-width: 600px) and (min-height: 400px)`       |
| `..600`          | `(width < 600px)`                                  |
| `600..900`       | `(600px <= width < 900px)`                         |
| `x..400`         | `(height < 400px)`                                 |
| `600..900x400..` | `(600px <= width < 900px) and (min-height: 400px)` |

A minimum is inclusive. A maximum is exclusive. Thus two ranges that meet at one value do not overlap, and they leave no gap. At a width of exactly 600 px, `..600` does not match and `600..900` matches.

### Ratio and orientation terms

| Key         | Compiles to                    |
| ----------- | ------------------------------ |
| `16/9`      | `(aspect-ratio >= 16/9)`       |
| `..4/3`     | `(aspect-ratio < 4/3)`         |
| `4/3..16/9` | `(4/3 <= aspect-ratio < 16/9)` |
| `landscape` | `(orientation: landscape)`     |
| `portrait`  | `(orientation: portrait)`      |

A ratio is width to height. A ratio alone is a minimum, the same as a size alone. A container is `portrait` when its height is equal to its width or more than its width. Thus a square container is `portrait`.

A height, a ratio, and an orientation need the height of the container. Thus a key that has one of these terms needs `container: size`. Without it, the key is an error. The error tells you to set `container: size`.

With `container: size`, the host does not get its height from its content. The host must get a definite height from the page, for example from a parent with a height, or the host is 0 px high. With `inline-size`, the host gets its height from its content, as a normal block does.

### Combined terms

- A space between terms means AND. `600.. landscape` matches when the width is 600 px or more and the container is landscape.
- A comma between parts means OR. `..400, x..300` matches when the width is less than 400 px or the height is less than 300 px.

A part can have only one width term, one height term, one ratio term, and one orientation term. To give a width a minimum and a maximum, write one range: `600..900`, not `600 ..900`.

Note about YAML: a key with a comma does not need quotes in a block mapping. A key that starts with `{`, `[`, or `,` needs quotes.

### Named breakpoints

The top-level key `breakpoints` gives a name to a query. A key can use the name as a term.

```yaml
container: size
breakpoints:
  md: 600..
  short: x..500

areas: A

md:
  gap: 8

md short:
  gap: 4
```

- A name obeys the identifier rule (`[A-Za-z_][\w-]*`).
- A name must not be a query term (for example `x400` or `portrait`), `base`, or a top-level key.
- The value of a name is a query. It can have AND and OR. It cannot use another name.
- A name with OR changes into one part for each alternative. Thus `compact landscape`, with `compact: '..400, x..300'`, is `..400 landscape, x..300 landscape`.

The compiler option `breakpoints` gives names to all layouts. A tool can read them from the configuration of a project. A layout must not give a new value to a name from the option. Names are resolved at build time. Thus a layout that compiles when the code runs must get the same option.

### The step order

A step is a region of container sizes. Step A is **inside** step B when each size that matches A also matches B. For example, `600x400` is inside `600` and inside `x400`.

The compiler puts the steps in this order:

1. The base step is first, because each step is inside it.
2. A step comes after each step that it is inside. Thus the more specific step wins.
3. The compiler puts other steps in order of their smallest width, then their smallest height, then the order in the source.

The order in the source has no effect on which step wins a property. Thus the YAML form and the object form give the same result. This is important for the object form, because JavaScript puts number keys (`600`) before other keys.

The compiler finds these errors:

- Two keys that match the same sizes, for example `600` and `600..`.
- A key that matches no size, for example `..600x700.. landscape`.
- A key that matches each size, for example `0`. Put its settings at the top level.

## Settings

All settings are optional in a query step.

| Key       | Description                                                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `areas`   | The area map (below).                                                                                                                                |
| `cols`    | The column tracks (below).                                                                                                                           |
| `rows`    | The row tracks (below).                                                                                                                              |
| `gap`     | A [value](#values). It sets `--grid-gap` on the grid element. The grid applies `--grid-gap` as `gap`.                                                |
| `padding` | A [value](#values). It sets `--grid-padding` on the grid element. The grid applies `--grid-padding` as `padding`.                                    |
| `css`     | Raw declarations, as a string. The compiler adds them to the grid element in this step. It does not parse or change them. Refer to the limits below. |
| `flow`    | The layout inside each area. A map from an area name to a flow. Refer to [Flow](#flow).                                                              |

`--grid-gap` and `--grid-padding` are custom properties on the grid element. Thus children can use them (`padding: var(--grid-gap)`). Each layout sets both to `0` on its grid element. Thus a nested layout does not get the values of its parent.

`gap` cannot use `--grid-gap`, and `padding` cannot use `--grid-padding`. The layout sets the property from the value. Thus the value would refer to itself, and CSS makes such a value invalid. This is an error.

The compiler does not parse `css`, but the declarations must stay in the rule of the grid element. Thus each `{`, each string, and each comment in `css` must be closed, and a `}` must have a `{` before it.

## Area map

The area map is a multi-line string. Each line is a row.

- `.` is an empty cell. A series of only dots counts as one empty cell.
- A map is a **character map** when each line has only capital letters and dots, and no spaces. Then each character is a cell (`AAB`). Each other map is a **word map**: spaces separate the cells, and a name can have more than one character (`hdr hdr nav`).
- Thus a word map can have one column (`image`, `title`, `text` on three lines). A column of names in capitals (`HEADER`, `MAIN`) is a character map. The error for it says how the compiler read the map.
- A name matches `[A-Za-z_][\w-]*`. A name must not be `auto`, `span`, `default`, `inherit`, `initial`, `unset`, `revert`, or `revert-layer`.
- All rows must have the same number of cells.
- Each named area must make a filled rectangle.

## Tracks

`cols` and `rows` accept a track list. Spaces separate the tracks.

| Input         | Output                                 |
| ------------- | -------------------------------------- |
| `100 1fr`     | `100px 1fr`                            |
| `200`         | `200px`                                |
| `1fr*3`       | `repeat(3, 1fr)`                       |
| anything else | no change, after the value rules apply |

- A bare number is px, as in each other value. The area map gives the number of tracks. Thus a layout does not give a track count.
- In the shorthand `SIZE*N`, `N` is a positive integer, and `SIZE` obeys the [value grammar](#values). But `SIZE` cannot have spaces or operators. For more columns of a minimum size, write `minmax(200px, 1fr)*3`.
- `NxSIZE` (for example `3x200px`) is an error. `x` is only for the query keys.
- Spaces in `()`, `{}`, or `[]` do not split tokens. Thus `minmax(100px, 1fr)` is one track, and `[main-start content-start]` is one set of line names. Line names are not tracks, and the compiler does not count them.
- A track list cannot have operators. Use `calc()` for one track.
- A step can set `areas` and not set `cols` or `rows`. Then the compiler calculates the missing item from the area map, and writes it in the output of that step:
  - The columns are `repeat(N, 1fr)`.
  - With `container: size`, the rows are `repeat(N, 1fr)`. The container has a height, and the rows are equal parts of it.
  - With `container: inline-size`, the rows are `repeat(N, auto)`. The height comes from the content, and each row gets the height of its content. A `1fr` row in a grid with no definite height gets the height of the highest row. Thus `1fr` would make all the rows as high as the highest one.
- If the compiler knows the number of tracks, the number must be the same as in the area map. The compiler does not count `auto-fill` and `auto-fit`. Thus it does not check them.

## Values

The settings `gap` and `padding`, and the track sizes in `cols` and `rows`, use the same grammar.

A value is a list of **terms**. Whitespace separates the terms. Whitespace in `()`, `{}`, or `[]` does not separate terms.

A term goes into the CSS with no change, or with the changes in the table. Thus a term cannot have a character that can end its declaration or start a string or a comment: `;`, `{`, `}`, `<`, `>`, `"`, `'`, `\`, or `/*`. The compiler checks each term after it replaces the tokens. Thus the result of `tokenVar` obeys the same rule.

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
| `--space`                 | `var(--space)`                       |
| `{space.2}`               | `var(--space-2)`                     |
| `{space.2} 16`            | `var(--space-2) 16px`                |
| `--space * 2`             | `calc(var(--space) * 2)`             |
| `{space.2} + 4`           | `calc(var(--space-2) + 4px)`         |
| `var(--x, 8px)`           | `var(--x, 8px)`                      |
| `clamp(4, {space.2}, 16)` | no change, but the token is replaced |

Note about YAML: a value that starts with `{` must have quotes (`'{space.2}'`). If not, YAML reads it as a mapping.

## Cascade semantics

Each step is a **patch on the base**. A step writes only the values that it sets. If more than one step matches, the cascade of the browser decides. The later step in [the step order](#the-step-order) wins, one property at a time. A step does not inherit from the previous step. A step never depends on the match of another step.

- Only the steps that set `gap`, `padding`, `areas`, `cols`, `rows`, `css`, or a `flow` entry write them.
- A step can set `areas` and not set `cols` or `rows`. Then the step writes calculated tracks for the missing axis (refer to [Tracks](#tracks)). These tracks replace the tracks of earlier steps. Thus old tracks cannot conflict with an area map of a different size.
- A step can set `cols` or `rows` and not set `areas`. Then the step writes only the tracks.
- The **active area map** at a container size is the map of the last matching step that sets `areas`.

**One winner.** At each size, each property must have one clear winner. The winner is the matching step that is inside all the other matching steps that set the property. If two steps set the same property, both match at one size, and neither step is inside the other, the compiler gives an error. The error gives the first size where both steps match. It also gives two fixes:

- Add a step for the sizes where both steps match. This step is inside both steps, so it wins there.
- Change one step so that the two steps do not overlap, for example with a maximum.

```yaml
container: size
areas: A

x400:
  gap: 4

600:
  gap: 8 # Error: "x400" and "600" both set `gap`, and both match at 600 × 400.

600x400:
  gap: 12 # This step fixes the error. It is inside x400 and inside 600.
```

Steps that set different properties can overlap with no error. In the example, `x400` can set `areas` and `600` can set `gap`. Each property comes from the last matching step that sets it.

The compiler cannot parse `css`. Thus two `css` values that overlap give a warning, not an error. The step order decides each declaration.

`--grid-step` is not a part of this rule. If two steps overlap and neither is inside the other, the later step in the order is the active step. Refer to [Active step](./output.md#active-step).

**A step with no effect.** A step has no effect when other steps set all of its properties at each size where it matches, and the step is never the active step. The compiler gives a warning for this step.

**Validation.** The compiler examines each region of sizes. At each region, the track count of the winning `cols` and `rows` must be the same as the winning area map. Only a mismatch that the compiler can prove is an error.

**Method.** The edges of all the regions are lines: a width, a height, or a ratio. The compiler examines one size in each area between the lines, one size on each line, and each corner. Each step gives the same result at all the sizes of one area. Thus these sizes are sufficient, and the result is exact.

## Hidden areas

The layout hides an item when its `data-grid-area` is not in the active area map.

Take each step that sets `areas`. The layout uses some area names that are not in the map of this step. The layout hides these areas when this step matches and no later step with `areas` matches. "Later" means later in [the step order](#the-step-order). A later step cannot cancel `display: none`. Thus the compiler writes the rule as an exclusive range. The range uses `not (…)` conditions.

An omitted area is always hidden. This is absolute in v1. You cannot keep an absent area visible. The hide rule is `display: none !important`.

The compiler never puts the hide rule in a cascade layer. Thus it wins against the normal CSS of the page, for example a `display: flex` on the item. The layers of the page cannot change this. Only an `!important` rule can override it. That rule must have a higher specificity, or be in a cascade layer. Refer to [Decisions](./decisions.md) for what can change this.

## Flow

`flow` sets how the direct children of an area are arranged. The area becomes a flex container. The value is a map. Each key is an area name. Each value is a flow string, a flow object, or `none`.

```yaml
name: card
areas: |
  A
  B
flow:
  B: column center start

600x:
  areas: A B
  flow:
    B: row between center gap {space.2}
```

A style query on `--grid-step` can also change the CSS of an area at a step. But a style query matches the active step only. Thus the author must write a value again for each later step. `flow` obeys the cascade of the steps, the same as the other settings.

### The flow string

```
[direction] [main] [cross] [gap <term>] [wrap]
```

- All parts are optional.
- `direction`, `main`, and `cross` must be in this order.
- `gap` and `wrap` come after them, in any order.
- Spaces separate the words. Spaces in `()` or `{}` do not separate words.

The compiler finds the role of each word as follows:

1. If the first word is a direction, it is the direction. If not, the direction is the default.
2. The next alignment word is `main`.
3. The alignment word after `main` is `cross`.

Thus `center` in the `main` position sets `justify-content`, and `center` in the `cross` position sets `align-items`. To set only `cross`, write `main` also. For example, write `row start center`.

The main axis follows the direction. With `row`, the main axis is the inline axis. With `column`, the main axis is the block axis. All directions and alignments are logical. Thus they are correct in a right-to-left page.

| Role      | Words                                                   | CSS property      | Default   |
| --------- | ------------------------------------------------------- | ----------------- | --------- |
| direction | `row`, `column`                                         | `flex-direction`  | `row`     |
| main      | `start`, `center`, `end`, `between`, `around`, `evenly` | `justify-content` | `start`   |
| cross     | `start`, `center`, `end`, `stretch`, `baseline`         | `align-items`     | `stretch` |
| gap       | `gap` and one term                                      | `gap`             | `normal`  |
| wrap      | `wrap`                                                  | `flex-wrap`       | `nowrap`  |

`start` becomes `flex-start`, `end` becomes `flex-end`, `between` becomes `space-between`, `around` becomes `space-around`, and `evenly` becomes `space-evenly`. Each other word has the same name as its CSS value.

**Gap.** The word `gap` takes exactly one term. The term obeys the [value rules](#values). A term in `()` can have spaces, for example `calc(var(--a) * 2)`. An operator term or a second term is an error. For an expression or a list, use the flow object.

Each area inherits `--grid-gap` from its grid element. Thus `gap --grid-gap` gives the area the same gap as the grid.

A flow string starts with a word, not with `{`. Thus YAML does not need quotes, also when the string has a token (`column gap {space.2}`).

| Flow string            | Result                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `column`               | The children are in a column, from the start. The children fill the width.                                    |
| `column center start`  | The children are in a column. The group is in the vertical center. The children are at the start of the line. |
| `row between center`   | The children are in a row, with the space between them. The children are in the vertical center.              |
| `column gap {space.2}` | The children are in a column. The gap is the token `space.2`.                                                 |
| `row wrap gap 8`       | The children are in a row that wraps. The gap is 8 px.                                                        |
| `none`                 | No flow. Refer to [Flow output](./output.md#flow-output).                                                     |

### The flow object

A flow object has named keys. It is easier to make in code. The object and the string give the same data.

```yaml
flow:
  B:
    direction: column
    main: center
    cross: start
    gap: '{space.2} + 4'
    wrap: false
```

| Key         | Value                                                     |
| ----------- | --------------------------------------------------------- |
| `direction` | `row` or `column`                                         |
| `main`      | a main word                                               |
| `cross`     | a cross word                                              |
| `gap`       | a [value](#values). An expression or a list is permitted. |
| `wrap`      | `true` or `false`                                         |

All keys are optional. A key that is absent gets its default. The parser changes each string into an object before other work.

### Flow in steps

A flow entry is complete. It does not merge with an entry from an earlier step. Example: the base step has `B: column center start`, and a step has `B: row`. At that step, the result is `row start stretch`, not `row center start`.

A step that sets an entry writes all the properties of that entry. The compiler does not compare the entry with other steps, because more than one step can match at the same time. Example:

```yaml
flow:
  B: column center start
x400:
  flow:
    B: row end
600x400:
  flow:
    B: column center
```

`600x400` is inside `x400`. At 600 × 400, both steps match, and `600x400` wins in full. The result is `column center stretch`. If `600x400` wrote only the values that are different from the base, the result would be `row end stretch`.

Each entry is a separate property for the [one-winner rule](#cascade-semantics). Thus two overlapping steps can set flow for different areas.

The hide rule wins over flow. Thus flow on a hidden area has no effect, and the compiler gives no warning. When the area shows again, the flow that is active at that size applies.

A flow key must be an area name that is in an area map of the layout.

### Scope of flow

Flow sets properties of the area only. It does not set properties of the children: `flex-grow`, `flex-basis`, `order`, `align-self`, and margins are not in the format. Use normal CSS for the children. If flow includes them, the format becomes a second layout language.

Flow applies to the direct children of an area. A child can be a `data-grid-host` with its own layout. If the area element is itself a host, flow has almost no effect, because the host has one child.

## Errors and warnings

The parser and the compiler throw an error for each of these:

- An invalid `name`, or a `name` that CSS reserves for container names.
- A file with more than one YAML document, or with a tag.
- An object layout that has a value that is not plain data.
- A `grid` template that has a `${}` expression.
- A base step that has no `areas`.
- An unknown top-level key that is not a valid query key, or an unknown term in a query key.
- An unknown setting in a step, or `name` or `container` in a step.
- A range or a ratio range with a minimum that is not less than the maximum (`900..600`), or a ratio that is not two positive numbers.
- A part of a key with two terms for the same dimension (`600 ..900`), or an empty part (`600,`).
- Two query keys that match the same sizes (`600` and `600..`), a key that matches no size, or a key that matches each size.
- A height, a ratio, or an orientation term without `container: size`.
- An invalid breakpoint name, a breakpoint that uses another name, or a name in a layout that is also in the `breakpoints` option.
- Two steps that set the same property, match at the same size, and are not inside each other. Refer to [Cascade semantics](#cascade-semantics).
- An empty area map, rows of different lengths, an invalid or reserved area name, or an area that is not a rectangle.
- A track count that is not the same as the area map that the compiler checks it against.
- A track in the form `NxSIZE`, for example `3x200px`. The error gives the `minmax()` replacement.
- A malformed value: unbalanced `()`, `{}`, or `[]`, an empty token `{}`, or an operator at the start, at the end, or twice in a row.
- A value with a character that is not permitted (`;`, `{`, `}`, `<`, `>`, a quote, `\`, or `/*`).
- A `gap` that uses `--grid-gap`, or a `padding` that uses `--grid-padding`.
- A `css` value that is not a string, or that has `</style`. It can break out of an injected `<style>` element.
- A `css` value with a `{`, a string, or a comment that is not closed, or with a `}` that has no `{` before it.
- A `flow` value that is not a map, or a flow key that is not an area name in an area map.
- A flow string with an unknown word, a word in the wrong role, more than one main or cross word, or a direction that is not the first word. The error lists the words that are valid in that position.
- A flow string with `gap` or `wrap` two times, `gap` with no term, or `gap` with more than one term or an operator.
- A flow object with an unknown key, an invalid word, or a `wrap` that is not `true` or `false`.

The compiler gives a warning, and does not fail, for this:

- `cqh`, `cqb`, `cqmin`, or `cqmax` without `container: size`. There is no height to measure. Thus the browser uses viewport units instead.
- Two `css` values that overlap with no winner.
- A step with no effect.

An error has a structured location: `{ message, path, range? }`. The `path` is the key path in the document (for example `["200x200", "areas"]`).

The `range` is the start and the end of the line and column. The parser makes a document-level YAML parse. Thus ranges are available. Editor diagnostics will use them. A layout in an object has a `path` but no `range`.
