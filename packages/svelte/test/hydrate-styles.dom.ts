// The hydration test again, with `GridStyles` around the grids. The server then writes the CSS of
// a layout one time, and the browser side must give the same result.
process.env.GRID_STYLES = '1';
await import('./hydrate.dom.ts');
