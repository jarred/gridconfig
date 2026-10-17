# Tailwind support for GridConfig

**Status: thought experiment.** This document is for review. No work is planned. Nothing here is a promise. Claims that we did not test are in the section [Not verified](#not-verified).

## Summary

Tailwind CSS v4 and GridConfig can work together. The first step needs no new code. A person imports the compiled CSS of GridConfig in the Tailwind stylesheet. First, we must solve one problem: cascade layers.

Tailwind puts its CSS in cascade layers. The GridConfig CSS has no layer. Unlayered CSS wins over layered CSS. Thus a Tailwind utility such as `gap-4` on a grid element has no effect. We must give the GridConfig CSS a layer option before we publish. The `layer` option is already an open question in the [layout spec](./spec.md).

A Tailwind plugin is possible. It gives a small benefit over the plain import. We recommend the plain import first, then the plugin only if people ask for it.

## Background

### What GridConfig makes

GridConfig compiles a layout file to CSS. The output has:

- A shared base (`baseCss`) with zero-specificity rules.
- One block of CSS for each layout, with `@container` rules.
- Hide rules with `display: none !important`.

The DOM uses three attributes: `data-grid-host`, `data-grid-layout`, and `data-grid-area`. The DOM does not use class names.

### What Tailwind v4 provides

- **CSS-first setup.** A person writes `@import 'tailwindcss'` in a CSS file.
- **Cascade layers.** The layers are `theme`, `base`, `components`, and `utilities`, in this order.
- **Plugins.** The `@plugin` directive loads a JavaScript plugin. A plugin can add base styles, components, utilities, and variants. Plugin code runs at build time.
- **CSS-first extension.** `@utility` and `@custom-variant` define utilities and variants in CSS.
- **Container queries.** The built-in variants such as `@md:` query the nearest ancestor container.

## Where the two systems meet

| Topic            | GridConfig                                    | Tailwind v4                                       | Result                                            |
| ---------------- | --------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| Selectors        | Attributes                                    | Class names                                       | No conflict. Tailwind does not scan attributes.   |
| Cascade layers   | None                                          | `theme`, `base`, `components`, `utilities`        | Problem. See below.                               |
| Container        | The host is a named container                 | Utilities query the nearest container             | Possible confusion. See below.                    |
| Tokens           | `{space.2}` gives `var(--space-2)`            | Theme variables such as `--spacing` and `--color-*` | The `tokenVar` option can map the names.        |
| Reset styles     | `:where()` rules with zero specificity        | The preflight reset is in the `base` layer        | No conflict.                                      |
| Build step       | Vite plugin, CLI, or the runtime                | PostCSS or the Vite plugin                        | Both can run in the same build.                   |

### Problem 1: cascade layers

For normal declarations, unlayered CSS wins over layered CSS. This is true even when the layered rule has higher specificity.

Example: a person writes `<div data-grid-layout="hero" class="gap-4">`. The utility `gap-4` is in the `utilities` layer. The GridConfig rule `gap: var(--gap)` has no layer. The GridConfig rule wins. The utility has no effect and gives no error.

The fix is the `layer` compile option. When it is on, the compiler puts the base and the per-layout CSS in a named layer. The name is `components` for Tailwind users. Then utilities win, as people expect.

The hide rule is different. Layers reverse the order for `!important` declarations. An unlayered `!important` rule has the lowest priority of all `!important` rules. A layered `!important` rule wins over it. 

Thus the hide rule must stay unlayered in v1. Then only an `!important` utility such as `flex!` can show a hidden area. This is a small change from "absolute". We must write it in the spec.

### Problem 2: the nearest container

A Tailwind variant such as `@md:` queries the nearest ancestor with a container type. In a GridConfig layout, the nearest container of a grid child is the host. A grid cell is not a container.

Thus `@md:flex` on a grid child tests the size of the whole host. It does not test the size of the cell. A person can expect the cell size. We must write this in the documentation. A person can make the cell a container with the `@container` class on the child.

### Problem 3: files that Tailwind does not watch

Tailwind scans source files for class names. It does not know about layout files. If the plugin reads `*.yaml` files, the Tailwind watcher does not see a change in them. The result is a stale style until the person restarts the dev server. Tailwind v4 must give a way to register a file dependency. We must test this (refer to [Not verified](#not-verified)).

## Options

### Option A: plain import (recommended first step)

The person uses the existing GridConfig tools to make a CSS file. The Tailwind stylesheet imports it.

```css
@import 'tailwindcss';
@import './gridconfig.generated.css' layer(components);
```

The `layer()` function of `@import` puts the whole file in the `components` layer. This works with no new code in GridConfig. The `layer` compile option is not necessary for this form.

- **Advantages.** No new package. No plugin API risk. It works in Tailwind v3 and v4.
- **Problems.** The hide rule is also in the layer. Thus the hide rule loses to unlayered page CSS. This breaks the "absolute" rule. The CLI must write the hide rules to a second file or section that is not in the layer.
- **Work.** The CLI (planned) must write two outputs: `layered` and `unlayered`. This is a small task.

### Option B: a Tailwind plugin

The package `@gridconfig/tailwind` is a Tailwind plugin. A person loads it in CSS.

```css
@import 'tailwindcss';
@plugin '@gridconfig/tailwind' {
	layouts: './src/layouts/*.yaml';
	tokens: tailwind;
}
```

The plugin does these tasks at build time:

1. Find the layout files.
2. Call `compileLayout` for each file.
3. Add `baseCss` and the layout CSS in the `components` layer.
4. Add the hide rules without a layer.
5. Map `{spacing.4}` to a Tailwind theme variable (the `tokens: tailwind` option).

A sketch of the plugin:

```js
import plugin from 'tailwindcss/plugin';
import { parse } from 'postcss-js';
import { compileLayout, baseCss } from '@gridconfig/core';

export default plugin.withOptions((options) => ({ addBase, addComponents }) => {
	const layouts = loadLayouts(options.layouts);
	addComponents(parse(baseCss));
	for (const layout of layouts) {
		addComponents(parse(compileLayout(layout.source, layout.options).css));
	}
});
```

The plugin API takes JavaScript objects, not CSS text. Thus the plugin must convert the CSS text with `postcss-js`.

- **Advantages.** One line of setup. The token mapping is automatic. The layer is correct.
- **Problems.** Problem 3 (watch). The hide rule cannot go in a plugin API call without a layer, unless the plugin uses a special call. The `@container` at-rules in the object form need a test. We add a package that we must maintain for each Tailwind release.
- **Benefit compared to Option A.** Small. Option A with the CLI gives almost the same result.

### Option C: Tailwind variants from query keys

The plugin adds one variant for each step of a layout. A person writes `hero-lg:p-4`. This means "apply `p-4` when the `hero` container matches the step `lg`".

- **Advantages.** A person can use any Tailwind utility inside a step. The utility is generated only when used.
- **Problems.** It is a second way to write the same thing. The layout file is not the only source of truth. The area map and the tracks stay in YAML, but padding and gap move to the markup. The cascade rules of GridConfig (one property at a time, later step wins) do not match the order of Tailwind variants. A validation of the area map is not possible for utilities.
- **Decision.** We do not recommend this option. It breaks the idea of one layout file.

## Recommended path

| Phase | Work                                                                                      | Needed from core                                  |
| ----- | ----------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 0     | Write a recipe (Option A) in the docs. Warn about layers.                                  | Nothing                                           |
| 1     | Add the `layer` compile option. Add the layered and unlayered outputs to the CLI.          | `layer` option, split output                      |
| 2     | Add `@gridconfig/tailwind` only if people ask. Start with the `tokens: tailwind` mapping. | A stable `tokenVar` option                        |
| 3     | Do not build Option C unless a clear need appears.                                        | None                                              |

## Token mapping

Tailwind v4 theme variables are not the same as the GridConfig token paths. The `tokenVar` option can bridge them.

| Layout value       | Output with the default mapping | Output with the `tailwind` mapping |
| ------------------ | ------------------------------- | ---------------------------------- |
| `{spacing.4}`      | `var(--spacing-4)`              | `calc(var(--spacing) * 4)`         |
| `{color.red-500}`  | `var(--color-red-500)`          | `var(--color-red-500)`             |

Tailwind v4 uses one base variable `--spacing` for all spacing utilities. Thus `{spacing.4}` needs the `calc()` form. The mapping for spacing is the only special case that we know.

## Not verified

We did not test these items. We must test each item before we publish any text about Tailwind.

1. **Plugin options in CSS.** The block form of `@plugin` with options. We think that Tailwind v4 supports it.
2. **`@container` in plugin objects.** We do not know if `addComponents` accepts an `@container` at-rule with a name and a `not (...)` condition.
3. **File dependencies.** We do not know how a plugin tells Tailwind to watch a file that is not a source file.
4. **The `layer()` import.** We do not know if `@import ... layer(components)` and the Tailwind layer order work together in each bundler.
5. **Named size containers.** We do not know if a Tailwind class can set `container-type: size`. Not needed for the plain import.
6. **Tailwind v3.** This document is about v4 only. The `@plugin` directive and the layer behavior differ in v3.

## Risks

- A person does not see why `gap-4` has no effect. This is the highest risk. The `layer` option fixes it.
- Tailwind changes the plugin API. A package for the plugin needs a maintenance plan.
- The hide rule and `!important` utilities do not interact as people expect.

## Questions for review

1. Is Option A with a CLI sufficient for v1?
2. Do we accept that `flex!` can show a hidden area?
3. Does a plugin give enough benefit to justify a new package?
