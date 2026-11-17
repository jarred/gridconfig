# @gridconfig/core

The parser and the compiler of [GridConfig](https://github.com/jarred/gridconfig). A layout is a small YAML description of a CSS grid that changes shape with the size of its container. The compiler turns it into static CSS container queries. There is no layout JavaScript at runtime.

```sh
npm install @gridconfig/core
```

Most projects also use [@gridconfig/vite](https://www.npmjs.com/package/@gridconfig/vite), which compiles layouts at build time, and [@gridconfig/svelte](https://www.npmjs.com/package/@gridconfig/svelte) or [@gridconfig/react](https://www.npmjs.com/package/@gridconfig/react) for the `Grid` component.

```ts
import { grid } from '@gridconfig/core';

const card = grid`
  areas: |
    image
    text
  500:
    cols: 200 1fr
    areas: image text
`;

card.css; // the CSS of the layout
```

## Entries

| Import                         | What it has                                                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@gridconfig/core`             | `grid`, `createGrid`, `compileLayout`, `parseLayout`, `baseCssFor`, and the types.                                                                                          |
| `@gridconfig/core/object`      | The same, without the YAML parser, for code that writes layouts as objects.                                                                                                 |
| `@gridconfig/core/runtime`     | The small parts for the browser: attribute names, base rules, `onStepChange`, `readStep`.                                                                                   |
| `@gridconfig/core/schema.json` | The JSON Schema for `.grid` files, for editor completion. Refer to [Editor support](https://github.com/jarred/gridconfig/blob/main/docs/getting-started.md#editor-support). |

## Documentation

- [The guide](https://github.com/jarred/gridconfig/blob/main/docs/README.md): how to use GridConfig, with examples.
- [The language on one page](https://github.com/jarred/gridconfig/blob/main/docs/language.md).
- [The spec](https://github.com/jarred/gridconfig/blob/main/spec/spec.md): the exact rules, and what each 1.x release keeps stable.

MIT
