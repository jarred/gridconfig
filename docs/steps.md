# Steps

A layout is a base and a list of **steps**. The top level of the file is the base. It applies at every size. Each step is a size key with settings under it.

## The ladder

Most layouts are a ladder of widths:

```yaml
gap: 8
areas: |
  A
  B
  C

600:
  areas: |
    A B
    C C

1000:
  gap: 16
  areas: A B C
```

| Container width | Areas         | Gap   |
| --------------- | ------------- | ----- |
| under 600 px    | one column    | 8 px  |
| 600 to 999 px   | `A B` / `C C` | 8 px  |
| 1000 px and up  | one row       | 16 px |

A key such as `600` is a minimum: it matches 600 px and wider. At 1000 px, both `600` and `1000` match, and the larger step wins.

A step changes only what it sets. `600` does not set `gap`, so at 600 px the gap is still 8 from the base. You never repeat a value to keep it.

## Ranges

Two dots give a range. The minimum is included and the maximum is not:

| Key        | Matches                              |
| ---------- | ------------------------------------ |
| `600`      | 600 px wide and wider                |
| `..600`    | narrower than 600 px                 |
| `600..900` | from 600 px, up to but not at 900 px |

Thus `..600` and `600..900` meet at 600 with no gap and no overlap.

A range is useful when one size needs something that the next size must not get:

```yaml
areas: A B

..400:
  areas: |
    A
    B
```

## Height, ratio and orientation

With `container: size`, a key can also test the height. An `x` separates the width from the height.

| Key         | Matches                                  |
| ----------- | ---------------------------------------- |
| `x400`      | 400 px high or higher                    |
| `600x400`   | 600 px wide or wider, and 400 px or more |
| `600x..400` | 600 px wide or wider, and under 400 high |
| `16/9`      | as wide as 16:9 or wider                 |
| `..3/4`     | narrower than 3:4                        |
| `landscape` | wider than high                          |
| `portrait`  | as high as wide, or higher               |

A space means AND, and a comma means OR:

```yaml
container: size
areas: A B

600 landscape:
  gap: 8

'..400, x..300':
  areas: A
```

`600 landscape` matches when the container is 600 px wide or wider and it is landscape. `..400, x..300` matches when it is narrower than 400 px or lower than 300 px.

## Named breakpoints

Give a name to a key that you use often:

```yaml
container: size
breakpoints:
  wide: 900..
  short: x..400

areas: A

wide:
  areas: A B

wide short:
  areas: B
```

A name can be part of a key (`wide short`). The `breakpoints` option of the plugin gives names to every layout in a project:

```ts
layoutPlugin({ breakpoints: { md: '600..', lg: '1000..' } });
```

A name also makes a short value for [step styles](./styling.md#style-content-for-a-step).

## When two steps overlap

A ladder of widths never has a problem: each step is inside the steps before it, so the order is clear. Problems can come when steps test different things.

```yaml
container: size
areas: A

x400:
  gap: 4

600:
  gap: 8
```

At 600 × 400, both steps match and both set `gap`. Neither step is inside the other. You have not said which gap you want there, so the compiler stops:

> "x400" and "600" both set `gap`, and both match at 600 × 400. Add a step for the sizes where both match ("600x400"), or change one of them so that they do not overlap (for example "..600x400" in place of "x400").

Do one of the two things that the message says. A step for the overlap is inside both steps, so it wins there:

```yaml
container: size
areas: A

x400:
  gap: 4

600:
  gap: 8

600x400:
  gap: 12
```

The rule in short: **at each size, each setting has one clear winner.** The winner is the most specific matching step. If two steps can tie, the compiler tells you, with the size where they meet. Steps that set different settings can overlap with no problem.

Because of this rule, the order of the steps in the file does not matter. Write them in the order that reads best.

## What the compiler checks

These mistakes are errors, with the line of the problem:

- Two keys that match the same sizes, for example `600` and `600..`.
- A key that can never match, for example `..600x700.. landscape`.
- A step whose tracks do not fit the area map that is active with it.

A step that never wins anything is a warning: other steps set all of its settings everywhere that it matches.

Next: [Areas, tracks and values](./areas-and-tracks.md).
