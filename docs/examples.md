# Examples

## A page

A page in one column on a phone, with a sidebar on a tablet, and with a second sidebar on a wide screen.

```yaml
# page.grid
gap: 16
padding: 16
rows: auto 1fr auto
areas: |
  header
  main
  footer

700:
  cols: 220 1fr
  rows: auto 1fr auto
  areas: |
    header header
    nav    main
    footer footer

1200:
  gap: 24
  cols: 220 1fr 280
  areas: |
    header header header
    nav    main   aside
    footer footer footer
```

`nav` shows from 700 px, and `aside` from 1200 px. Under 700 px they are hidden. The base sets `rows`, and `700` sets it again: a step with a new map does not keep the tracks of a smaller step.

## A card that fills its box

A card in a dashboard, where the user can resize each panel. `container: size` lets the card change with its height as well as its width.

```yaml
# panel.grid
container: size
padding: 12
gap: 8
rows: auto 1fr
areas: |
  title
  chart

x300:
  rows: auto 1fr auto
  areas: |
    title
    chart
    legend

500x300:
  cols: 1fr 180
  rows: auto 1fr
  areas: |
    title title
    chart legend
```

| Panel size        | Result                           |
| ----------------- | -------------------------------- |
| low               | title and chart                  |
| 300 px high       | the legend shows under the chart |
| 500 × 300 or more | the legend is next to the chart  |

`500x300` is inside `x300`, so it wins where both match.

## One ad for every ad format

Ad and social formats come in many sizes, but in a few shapes. The ratio of the container picks the shape. Each band of ratios is a named breakpoint, and the bands meet with no gap.

```yaml
# ad.grid
container: size

breakpoints:
  tall: ..2/3
  wide: 3/2..5/1
  strip: 5/1..

gap: 3cqmin
rows: 1fr auto auto
flow:
  logo: row start end
  cta: row end end
areas: |
  image image
  title title
  logo  cta

tall:
  rows: 4fr auto auto auto
  areas: |
    image
    title
    copy
    cta

wide:
  cols: 2fr 1fr 1fr
  rows: 1fr auto auto
  areas: |
    image title title
    image copy  copy
    image logo  cta

strip:
  cols: 1fr auto
  rows: 1fr
  flow:
    cta: row center center
  areas: title cta
```

| Format                        | Ratio | Shape   |
| ----------------------------- | ----- | ------- |
| 300 × 600 half page, story    | ≤ 2:3 | `tall`  |
| 300 × 250 MPU, square post    | ~1:1  | base    |
| 1200 × 628 link post, video   | ~2:1  | `wide`  |
| 728 × 90 leaderboard, banners | ≥ 5:1 | `strip` |

`copy` and `logo` show only where they fit. Container units (`3cqmin`) scale the gap with the ad. The [site](../apps/site/src/lib/components/ad.grid) has the full version, with more bands and safe zones for stories.

## A logo made of layouts

The [logo on the site](../apps/site/src/lib/components/logo.svelte) is three nested layouts. Each step sets custom properties with `css`, and the CSS of the component uses them for colours and shapes. It shows how far `css` and `--grid-step` can go without JavaScript.
