import { attributes } from './attributes.ts';

/** Shared rules, needed once per page. Zero specificity so per-layout rules always win. */
export const baseCss = `:where([${attributes.host}]) { width: 100%; height: 100%; }
:where([${attributes.layout}]) {
  display: grid;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  gap: var(--gap);
  padding: var(--padding);
}`;
