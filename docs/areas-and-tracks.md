# Areas, tracks and values

## The area map

`areas` draws the grid as text. Each line is a row.

```yaml
areas: |
  header header
  nav    main
  footer footer
```

- Spaces separate the cells. You can line up the columns with extra spaces.
- Cells with the same name make one area. An area must be a filled rectangle.
- `.` is an empty cell. `...` is also one empty cell, so you can line it up with longer names.
- All rows need the same number of cells.

One column needs no spaces:

```yaml
areas: |
  image
  title
  text
```

### Character maps

When a map has only capital letters and dots, and no spaces, each character is a cell. This is good for a large map where an area covers a part of a canvas:

```yaml
container: size
areas: |
  BBBB..AA
  CCC...AA
  ........
  ....DDDD
  ....DDDD
```

This map has 8 columns and 5 rows. Each column is `1fr` unless you set `cols`.

## Hidden areas

An element whose area is not in the active map is hidden. Use this to show content only at some sizes:

```yaml
areas: |
  title
  text

800:
  cols: 1fr 300
  areas: |
    title aside
    text  aside
```

`aside` is hidden under 800 px and shows from 800 px. The element stays in the DOM. GridConfig sets `display: none` on it, with `!important`, so that the CSS of the page cannot show it by accident.

## Columns and rows

Without `cols` or `rows`, each track is `1fr`, and the area map gives the count. Set them when you need other sizes:

```yaml
cols: 200 1fr
rows: auto 1fr auto
areas: |
  logo header
  nav  main
  nav  footer
```

| You write                | CSS                             |
| ------------------------ | ------------------------------- |
| `200`                    | `200px`                         |
| `200 1fr`                | `200px 1fr`                     |
| `1fr*3`                  | `repeat(3, 1fr)`                |
| `auto 1fr*2 auto`        | `auto repeat(2, 1fr) auto`      |
| `minmax(200px, 1fr)*3`   | `repeat(3, minmax(200px, 1fr))` |
| `20cqw 1fr`, `minmax(…)` | no change                       |

The number of tracks must match the area map. The compiler checks this, also across steps.

A step that sets `areas` and not `cols` gets `1fr` columns for its new map. Columns from a smaller step do not carry over to a map of a different size. A step that sets only `cols` keeps the map that is active.

## Gap and padding

```yaml
gap: 8
padding: 16 24
areas: A B
```

A bare number is px. `16 24` is two values, as in CSS. Each layout starts at `0` for both, and a nested layout does not get the values of its parent.

The grid element also has `--gap` and `--padding` as custom properties, so the content can use them:

```css
.card-body {
	padding: var(--gap);
}
```

## Values, variables and tokens

`gap`, `padding` and track sizes share one value syntax.

| You write                     | CSS                                |
| ----------------------------- | ---------------------------------- |
| `8`                           | `8px`                              |
| `--space`                     | `var(--space)`                     |
| `'{space.2}'`                 | `var(--space-2)`                   |
| `--gap * 2`                   | `calc(var(--gap) * 2)`             |
| `'{space.2} + 4'`             | `calc(var(--space-2) + 4px)`       |
| `clamp(4px, {space.2}, 16px)` | `clamp(4px, var(--space-2), 16px)` |
| `4cqw`, `1rem`                | no change                          |

Inside a CSS function such as `clamp()` or `minmax()`, write the units. Only a bare number on its own becomes px.

- `{space.2}` is a **design token**. It becomes the CSS variable `--space-2`. The compiler never uses the value of the token, so a theme can change it at runtime. The `tokenPrefix` option adds a prefix: with `tokenPrefix: 'ds'`, `{space.2}` is `var(--ds-space-2)`.
- In YAML, a value that starts with `{` needs quotes: `gap: '{space.2}'`.
- An operator (`+ - * /`) needs a space on each side. Then the whole value is one `calc()`.

Container units (`cqw`, `cqh`, `cqmin`) measure the container. `cqh` and `cqmin` need `container: size`, because otherwise there is no height to measure.

Next: [Flow](./flow.md).
