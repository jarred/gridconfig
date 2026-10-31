# The whole language on one page

```yaml
name: card # optional; defaults to the file name
container: size # optional; inline-size (default) or size
breakpoints: # optional; names for keys
  wide: 900..

# The base: applies at every size. It must set `areas`.
gap: 8
padding: 16
cols: 200 1fr
rows: auto 1fr
areas: |
  image title
  image text
flow:
  title: row between center

# A step: a key, and the settings that change from that size.
600x400:
  gap: 12
  areas: |
    image title
    image text
    image actions
  css: |
    --accent: var(--blue);
```

## Keys

| Key               | Matches                      | Needs `container: size` |
| ----------------- | ---------------------------- | ----------------------- |
| `600`             | width ≥ 600                  |                         |
| `..600`           | width < 600                  |                         |
| `600..900`        | 600 ≤ width < 900            |                         |
| `x400`            | height ≥ 400                 | yes                     |
| `600x400`         | width ≥ 600 and height ≥ 400 | yes                     |
| `600x..400`       | width ≥ 600 and height < 400 | yes                     |
| `16/9`            | ratio ≥ 16:9                 | yes                     |
| `4/3..16/9`       | 4:3 ≤ ratio < 16:9           | yes                     |
| `landscape`       | wider than high              | yes                     |
| `portrait`        | as high as wide, or higher   | yes                     |
| `600 landscape`   | both (a space is AND)        | yes                     |
| `'..400, x..300'` | either (a comma is OR)       | yes                     |
| `wide`            | a name from `breakpoints`    |                         |

A minimum is included; a maximum is not. At each size, each setting comes from the most specific matching step. Two steps that can tie on a setting are an error that says how to fix it. Refer to [Steps](./steps.md).

## Settings

| Setting   | Value                                 | Example                     |
| --------- | ------------------------------------- | --------------------------- |
| `areas`   | the area map                          | `A B` / `header header`     |
| `cols`    | tracks                                | `200 1fr`, `1fr*3`          |
| `rows`    | tracks                                | `auto 1fr auto`             |
| `gap`     | a value                               | `8`, `'{space.2}'`          |
| `padding` | a value                               | `16 24`                     |
| `flow`    | a map from an area to a flow          | `title: row between center` |
| `css`     | raw declarations for the grid element | `--accent: red;`            |

## Area maps

- Spaces separate the cells: `nav main main`. `.` is an empty cell.
- With only capitals and dots, and no spaces, each character is a cell: `AAB`.
- An area must be a rectangle. An area that is not in the active map is hidden.

## Values

| You write     | CSS                       |
| ------------- | ------------------------- |
| `8`           | `8px`                     |
| `--x`         | `var(--x)`                |
| `'{a.b}'`     | `var(--a-b)`              |
| `--x * 2`     | `calc(var(--x) * 2)`      |
| `1fr*3`       | `repeat(3, 1fr)` (tracks) |
| anything else | no change                 |

## Flow

`[row|column] [main] [cross] [gap <value>] [wrap]`, or `none`.

- main: `start center end between around evenly`
- cross: `start center end stretch baseline`

## In CSS

| Use                                   | For                                    |
| ------------------------------------- | -------------------------------------- |
| `@container style(--grid-step: wide)` | style content for the active step      |
| `var(--gap)`, `var(--padding)`        | the gap and padding of the layout      |
| `cqw`, `cqh`, `cqmin`                 | sizes relative to the container        |
| `@layer …, gridconfig, …;`            | the place of the layout in your layers |

## Markup

```html
<div data-grid-host="card">
	<!-- the container: Grid makes it -->
	<div data-grid-layout="card">
		<!-- the grid -->
		<img data-grid-area="image" />
		<!-- each direct child names its area -->
	</div>
</div>
```
