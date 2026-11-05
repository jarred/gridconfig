# @gridconfig/devtools

The package `@gridconfig/devtools` is an overlay for the browser. It works in each framework, because it uses only the DOM contract, the computed styles, and the debug data. It shows these items for a layout:

- The area names, drawn from the tracks. An area with no element shows as empty.
- The track values as the author wrote them (`1fr`, `50cqw`). The tooltip of a label gives the used size.
- The gap and the padding.
- The active step, and the areas that the step hides.
- Problems in the markup: a child with no `data-grid-area`, an area name that the layout does not have, and a host with no height.

The guides show only when the pointer is on the layout or its labels. Move the pointer away to see the design without them. The tag with the controls stays, and it shows the number of problems. On a touch screen, and during a resize, the guides stay.

The overlay is in the top layer of the browser (a `popover`). Thus an ancestor with `overflow: hidden` cannot clip it. It has a shadow root. Thus the CSS of the page cannot change it.

**Resize.** The select and the handle set an inline `width` and `height` on the real host element. The compiler does not move the element. The page around it will reflow.

The select sets the host to the nearest size where the step is the active step. The handle snaps to the edge of a step when it is within 6 px. Hold Alt to turn this off. Close the overlay, or press the reset button, to give the natural size back. A size stays when the page replaces the host, for example in a hot update. A reload gives each host its natural size, and nothing that the overlay did stays.

**Pop out.** The pop-out button moves the layout to the centre of the screen. A dim scrim covers the page. The real host element goes to the top layer of the browser (a `popover`). It does not move in the DOM. Thus the CSS that depends on its ancestors still applies.

The host keeps the padding, border, color, and overflow that the page gives it. A host with no background gets the background behind it. A host that has no size gets 480 by 360. A resize stays inside the viewport, and it does not reflow the page.

Esc or the button puts the host back. A click on the scrim does nothing, so a click cannot close the view by accident. If the page replaces the host, for example after a file change, the new host with the same name pops out again.

**Debug data.** With `debug: true`, the compiler puts the steps in `CompiledLayout.debug`. The format has version 2. Each query step has a `when`: a list of alternatives, each with the ranges of the step. Core exports `matches` and `samplePoints` from `@gridconfig/core/runtime` to use it. A step that sets flow has a `flow` map, with each entry as a flow object or `"none"`. The compiler also writes the steps in the custom property `--gc-debug` on the host. The value is a CSS string that holds JSON. Thus the data goes with the CSS in each route, also in a plain stylesheet.

Without the data, the overlay still draws from the computed styles. It then shows used sizes and no steps. The Vite plugin sets `debug: true` when the dev server runs.

**Console warning.** A host with no height or no width shows nothing. Thus the package also writes a warning in the console, also when the overlay is closed. The warning gives the name of the layout and a fix. The check waits until the page does not change for 1 second, because some CSS loads late in development. It does not warn for a host that the page does not render.

**Start.** Import `@gridconfig/devtools/auto` to install the overlay. The Svelte and React `Grid` components do this in development. The `debug` prop of `Grid` opens the overlay on that grid. When the last grid with `debug` goes, for example in a hot update, the overlay closes and the hosts get their natural size back. The button that shows and hides the overlay is only on a page with a `debug` grid. The keys Alt+Shift+G show and hide it on each page.
