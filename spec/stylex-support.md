# StyleX support for GridConfig

**Status: thought experiment.** This document is for review. No work is planned. Nothing here is a promise. Claims that we did not test are in the section [Not verified](#not-verified).

## Summary

StyleX is a harder fit than Tailwind. StyleX compiles styles from JavaScript objects to atomic CSS classes. It only accepts values that it can resolve at build time, in one file. It does not accept selectors for descendants.

The GridConfig output uses selectors that StyleX does not permit: `[data-grid-layout='hero'] > [data-grid-area='A']`. Thus GridConfig CSS cannot become StyleX code without a change of the output form.

Two approaches are possible:

1. **Side by side.** Use GridConfig CSS as a plain stylesheet. Use StyleX for all other styles. This works today and needs no new code.
2. **A StyleX target.** The compiler writes a StyleX module. Each element gets its own style object. This is possible but has limits. The biggest limit is the hide rule.

We recommend approach 1 for now. We recommend a small test of approach 2 before we decide more.

## Background

### What StyleX does

- A Babel plugin reads each file. It extracts the calls to `stylex.create()`.
- Each declaration becomes one atomic class. The call is replaced with class names.
- `stylex.props()` merges style objects. The last style wins for a property.
- Values must be known at build time. A value that is only known at run time becomes a CSS variable that is set in an inline style.
- Global selectors and complex selectors are not permitted.
- Tokens use `defineVars()`. The CSS variable names have a hash. Thus a file can use a token from an imported file.
- The official tools are a Babel plugin, a CLI, a PostCSS plugin, and an ESLint plugin. Community plugins exist for Vite, webpack, and unplugin.

### What GridConfig makes

The output has the shared base, one block of CSS for each layout, and the hide rules. The DOM contract uses three attributes: `data-grid-host`, `data-grid-layout`, and `data-grid-area`.

## Where the two systems meet

| Topic               | GridConfig                                       | StyleX                                          | Result                                                       |
| ------------------- | ------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------ |
| Selectors           | Child selectors with attributes                  | No descendant or global selectors               | Conflict. The output form must change for a StyleX target.   |
| Where styles attach | The parent rule places the child                 | The element carries its own class               | Each child needs its own style object.                       |
| Container queries   | `@container name (condition)`                    | At-rule keys are supported for some at-rules    | Not verified for `@container`.                               |
| Tokens              | `var(--space-2)`                                 | Variable names have a hash                      | A plain `var(--space-2)` does not find a StyleX variable.    |
| Hide rule           | `display: none !important` outside all layers    | Atomic classes with a merge order               | A StyleX target cannot make the rule absolute.               |
| Source of truth     | A YAML file                                      | JavaScript in the same file                     | A generated module is necessary.                             |
| Cascade             | The browser cascade, one property at a time      | Priority from the key order and `styleResolution` | The ordering of steps must map to the key order.           |

## Approach 1: side by side

The person generates a CSS file from the layouts. This is the same output that other users get. The person puts the file in the page. StyleX handles all other styles.

```tsx
import './gridconfig.generated.css';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
	card: { padding: 8, borderRadius: 4 }
});

export function Hero() {
	return (
		<div data-grid-host="hero">
			<div data-grid-layout="hero">
				<section data-grid-area="A" {...stylex.props(styles.card)} />
				<section data-grid-area="B" {...stylex.props(styles.card)} />
			</div>
		</div>
	);
}
```

- **Advantages.** No new code. The attributes and the classes do not conflict. The hide rule stays absolute.
- **Problems.** A person cannot use StyleX tokens inside a layout file. A StyleX style on the grid element can conflict with the GridConfig rules. The result depends on the layers that the StyleX setting uses.
- **Tokens.** The person can define the tokens twice: as StyleX variables and as plain CSS variables. This is not good, but it works. A better way is to use `--gap` and `--padding` custom properties in the layout and set them with a StyleX style on the host.

## Approach 2: a StyleX target

The compiler gets an output target `stylex`. It writes a JavaScript module. The module has one `stylex.create()` call. Each part of the layout gets one style object.

```ts
// hero.layout.stylex.ts (generated)
import * as stylex from '@stylexjs/stylex';

export const hero = stylex.create({
	host: {
		containerType: 'size',
		containerName: 'hero',
		width: '100%',
		height: '100%'
	},
	layout: {
		display: 'grid',
		width: '100%',
		height: '100%',
		gap: {
			default: 0,
			'@container hero (min-width: 100px) and (min-height: 100px)': 4
		},
		gridTemplateAreas: {
			default: "'A'",
			'@container hero (min-width: 100px) and (min-height: 100px)': "'A A' 'B B'"
		}
	},
	areaA: { gridArea: 'A' },
	areaB: { gridArea: 'B' }
});
```

The person uses the module in the component:

```tsx
import * as stylex from '@stylexjs/stylex';
import { hero } from './hero.layout.stylex';

export function Hero() {
	return (
		<div {...stylex.props(hero.host)}>
			<div {...stylex.props(hero.layout)}>
				<h1 {...stylex.props(hero.areaA)}>A</h1>
				<div {...stylex.props(hero.areaB)}>B</div>
			</div>
		</div>
	);
}
```

In this form the DOM contract changes. The elements get class names, not `data-grid-*` attributes. The adapters can set both.

### How each GridConfig feature maps

| Feature            | Mapping                                                                                         | Status      |
| ------------------ | ----------------------------------------------------------------------------------------------- | ----------- |
| Steps              | One at-rule key for each step, in the cascade order                                             | Not verified |
| Cascade            | The later key wins. This is the same as the browser cascade for one property.                    | Not verified |
| Area placement     | One style object for each area, with `gridArea`                                                  | Possible    |
| Tracks, gap, padding | Values with at-rule keys                                                                       | Possible    |
| Tokens             | Import a StyleX variable. Use the `tokenImport` option to name the module.                      | Needs design |
| `css` escape hatch | Not possible. StyleX does not accept raw CSS text.                                              | Not possible |
| Hide rule          | A `display` value with an exclusive `not (...)` key                                              | Weak. See below. |
| Validation         | Unchanged. The compiler validates before it writes the module.                                  | Possible    |

### Problem 1: static values only

`stylex.create()` accepts only values that the compiler can resolve in the same file. The generated module satisfies this rule because the compiler writes plain values. Thus the layout file is read at generation time, not by StyleX.

The generation step must run before the StyleX Babel plugin. Two ways exist:

- **CLI.** The CLI writes `*.layout.stylex.ts` files. The person commits them or adds them to the build. This is the simplest way.
- **Bundler plugin.** `@gridconfig/unplugin` turns `hero.layout.yaml?stylex` into a virtual module. It must run before the StyleX plugin, and the StyleX plugin must accept the virtual module name. We do not know if this is possible.

### Problem 2: tokens have hashed names

A token from `defineVars()` has a hashed CSS variable name. The text `var(--space-2)` does not find it.

For a StyleX target, the compiler must write an import and a property access instead of a `var()` text. The option `tokenImport` gives the module. The path `{space.2}` becomes `tokens.space2`. We must define the rules for names. Some paths cannot become a valid property name without a rule (the hyphen in `red-500`).

### Problem 3: the hide rule

The GridConfig hide rule is `display: none !important`. It is outside all layers. A StyleX style cannot do this in a safe way.

A style object for area B can use the key `'@container hero (not (...)) and (not (...))': 'none'`. This hides B in the correct range. But:

- A different style object on the same element can set `display`. The later object in `stylex.props()` wins. Thus a person can override the hide.
- The `!important` form is not typical in StyleX code. We do not know how the tools handle it.
- The rule depends on the order of the objects that the person passes.

Result: hiding is **not absolute** in the StyleX target. We must write this in the documentation. A lint rule for the ESLint plugin is a possible help, but it is a large work item.

### Problem 4: the cascade order

GridConfig sorts the steps by min-width and then by min-height. The browser cascade then picks a winner for each property. StyleX also orders at-rule keys, but the rules are not the same. For example, StyleX can sort by the type of condition and not by the order in the source.

We must test a layout with steps on two axes (`x400` with `600`). If StyleX does not keep our order, the result is wrong without an error.

### Problem 5: container queries

We do not know if StyleX accepts `@container` as a key with a name and a compound condition. We know that it accepts media queries and some other at-rules. This is a test that decides if Approach 2 is possible at all.

## Recommended path

| Phase | Work                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------ |
| 0     | Write a recipe for Approach 1. Warn about the cascade between StyleX classes and GridConfig rules.      |
| 1     | Do a test (one day of work). Write one layout by hand as a StyleX module. Run it through the Babel plugin. Check the CSS in a browser. |
| 2     | If the test passes, add the `stylex` target to the CLI only. Do not add a bundler plugin.               |
| 3     | Decide about a bundler plugin after StyleX publishes an official unplugin.                              |

If the test in Phase 1 fails at `@container`, we stop. Approach 1 stays.

## Not verified

We did not test these items. We must test each item before we publish any text about StyleX.

1. **`@container` keys.** The names, the compound conditions, and the `not (...)` form.
2. **The order of keys.** Does StyleX keep the source order of at-rule keys in the CSS output?
3. **`!important`.** Does StyleX permit it, and does a lint rule block it?
4. **Virtual modules.** Does the StyleX bundler plugin process a module that has no file on disk?
5. **`styleResolution`.** How do the layers of StyleX interact with the GridConfig rules on the same element? This affects Approach 1.
6. **Unplugin.** The status of the official unplugin. We read that it is on the roadmap.
7. **`stylex.when`.** It can observe the state of a related element. We do not know if it can help with area presence.

## Risks

- The StyleX target gives a weaker guarantee for hiding. Users can think that it is the same as in other targets.
- A second output form doubles the test work for the compiler.
- StyleX is still changing. Our target will need updates.
- The audience is small compared to Tailwind. The work can cost more than it returns.

## Questions for review

1. Is Approach 1 sufficient, and is Approach 2 a later idea?
2. Do we accept that hiding is not absolute in a StyleX target?
3. Do we want a second output form in the compiler? Each form needs its own tests.
