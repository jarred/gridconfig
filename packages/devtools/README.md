# @gridconfig/devtools

The package `@gridconfig/devtools` is an overlay for the browser. It works in each framework, because it uses only the DOM contract, the computed styles, and the debug data. It shows these items for a layout:

- The area names, drawn from the tracks. An area with no element shows as empty.
- The track values as the author wrote them (`1fr`, `50cqw`). The tooltip of a label gives the used size.
- The gap and the padding.
- The active step, and the areas that the step hides.
- Problems in the markup: a child with no `data-grid-area`, an area name that the layout does not have, and a host with no height.

The guides show only when the pointer is on the layout or its labels. Move the pointer away to see the design without them. The tag stays, and it shows the name, the active step and the number of problems. On a touch screen, the guides stay.

The overlay is in the top layer of the browser (a `popover`). Thus an ancestor with `overflow: hidden` cannot clip it. It has a shadow root. Thus the CSS of the page cannot change it.

**Read only.** The overlay only reads the page. It never sets a size on the host or moves an element. To see another step, resize the browser window or the element around the host. The step in the tag follows, because the overlay reads the same size as the container queries.

**Debug data.** With `debug: true`, the compiler puts the steps in `CompiledLayout.debug`. The format has version 2. Each query step has a `when`: a list of alternatives, each with the ranges of the step. Core exports `matches` and `samplePoints` from `@gridconfig/core/runtime` to use it. A step that sets flow has a `flow` map, with each entry as a flow object or `"none"`. The compiler also writes the steps in the custom property `--grid-debug` on the host. The value is a CSS string that holds JSON. Thus the data goes with the CSS in each route, also in a plain stylesheet.

Without the data, the overlay still draws from the computed styles. It then shows used sizes and no steps. The Vite plugin sets `debug: true` when the dev server runs.

**Console warning.** A host with no height or no width shows nothing. Thus the package also writes a warning in the console, also when you close the overlay. The warning gives the name of the layout and a fix. The check waits until the page does not change for 1 second, because some CSS loads late in development. It does not warn for a host that the page does not render.

**Start.** Import `@gridconfig/devtools/auto` to install the overlay. The Svelte and React `Grid` components do this in development. The `debug` prop of `Grid` opens the overlay on that grid. When the last grid with `debug` goes, for example in a hot update, the overlay closes. The button that shows and hides the overlay is only on a page with a `debug` grid. The keys Alt+Shift+G show and hide it on each page.
