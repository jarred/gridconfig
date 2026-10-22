// The parts of core that need no YAML parser, safe to ship to the browser.
export { BREAKPOINT_PROPERTY, attributes } from './attributes.ts';
export { baseCss, baseCssFor } from './base.ts';
export { DEFAULT_LAYER } from './layer.ts';
export { DEBUG_PROPERTY } from './debug.ts';
export { conditionCss, matches, samplePoints } from './query.ts';
export type { Bound, Clause, Condition, RatioBound, RatioValue } from './query.ts';
