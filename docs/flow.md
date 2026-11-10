# Flow

An area is often a group: a title and a date, a row of buttons, a logo and a link. `flow` arranges the children of an area with flexbox, and it can change with the steps.

```yaml
areas: |
  title
  actions

flow:
  actions: row end center gap 8

600:
  areas: title actions
  flow:
    actions: column start stretch gap 4
```

The area element becomes a flex container. Its children follow the flow.

## The flow string

```
[direction] [main] [cross] [gap <value>] [wrap]
```

Each part is optional. `direction`, `main` and `cross` come in this order.

| Part      | Words                                                   | Default   |
| --------- | ------------------------------------------------------- | --------- |
| direction | `row`, `column`                                         | `row`     |
| main      | `start`, `center`, `end`, `between`, `around`, `evenly` | `start`   |
| cross     | `start`, `center`, `end`, `stretch`, `baseline`         | `stretch` |
| gap       | `gap` and one value                                     | none      |
| wrap      | `wrap`                                                  | no wrap   |

**Main** is along the direction (`justify-content`). **Cross** is across it (`align-items`). The first alignment word is always main. To set only cross, write main too: `row start center`.

| Flow                   | Result                                                      |
| ---------------------- | ----------------------------------------------------------- |
| `column`               | A column from the top. The children fill the width.         |
| `row between center`   | A row with space between the children, centred vertically.  |
| `column center start`  | A column, centred vertically. The children are on the left. |
| `row wrap gap 8`       | A row that wraps, with an 8 px gap.                         |
| `column gap {space.2}` | A column with the gap of a token. No quotes are necessary.  |
| `row gap --grid-gap`   | The same gap as the grid.                                   |

Start and end follow the writing direction, so a flow is correct in a right-to-left page too.

## The flow object

In code, an object can be easier:

```ts
grid({
	areas: 'title actions',
	flow: { actions: { direction: 'row', main: 'end', gap: '{space.2} + 4' } }
});
```

The object can do one thing that the string cannot: a gap that is an expression or a list.

## Flow in steps

Each step writes the complete flow of an area. It does not merge with the flow of a smaller step:

```yaml
areas: A B
flow:
  B: column center start

600:
  flow:
    B: row
```

From 600 px, `B` is `row start stretch`: the defaults, not `row center start`. Write every part that you want in each step.

`none` removes the flow of the layout at that step. The area then has the display that the CSS of your page gives it.

## What flow does not do

Flow only sets the area. For the children (`flex-grow`, `order`, `align-self`, margins), use normal CSS. A child can also be a `Grid` with its own layout.

Next: [Styling and CSS](./styling.md).
