// The stylesheets of layouts that compile when the code runs. An adapter uses this module to
// put them on the page: one <style> element for each layout, however many times the page uses
// the layout. This module has no YAML parser.
import { baseCssFor } from './base.ts';
import type { CompiledLayout } from './types.ts';

/** The attribute of each <style> element that `mountStyles` makes. Its value is the sheet id. */
export const STYLE_ATTRIBUTE = 'data-gridconfig';

export type Sheet = {
	/** `base:<layer>` for the shared base rules, or `layout:<name>` for the CSS of a layout. */
	id: string;
	css: string;
};

type Styled = Pick<CompiledLayout, 'name' | 'css' | 'layer' | 'bundled'>;

/**
 * The stylesheets that a layout needs on the page: the shared base in its layer, and its own
 * CSS. A layout from a build plugin needs none, because the bundler delivers its CSS.
 */
export function sheetsOf(layout: Styled): Sheet[] {
	if (layout.bundled) return [];
	return [
		{ id: `base:${layout.layer ?? '-'}`, css: baseCssFor(layout.layer) },
		{ id: `layout:${layout.name}`, css: layout.css }
	];
}

type Entry = { element: HTMLStyleElement; css: string; count: number };

const registries = new WeakMap<Document, Map<string, Entry>>();

/**
 * Puts the stylesheets of a layout in the head of the document, and returns a function that
 * releases them. Call it when a grid with the layout goes on the page, and call the result when
 * the grid goes away.
 *
 * - Each sheet is on the page one time, for all the grids that use it.
 * - The sheet of a layout goes away with the last grid that uses it. The base stays.
 * - Two layouts on one page cannot have the same name. Thus, if a layout comes with a name that
 *   is on the page and with different CSS, the layout changed: its CSS replaces the old CSS.
 */
export function mountStyles(layout: Styled, doc: Document = document): () => void {
	let registry = registries.get(doc);
	if (!registry) registries.set(doc, (registry = new Map()));
	const entries = registry;
	const sheets = sheetsOf(layout);

	for (const { id, css } of sheets) {
		let entry = entries.get(id);
		if (!entry) {
			const element = doc.createElement('style');
			element.setAttribute(STYLE_ATTRIBUTE, id);
			entry = { element, css: '', count: 0 };
			entries.set(id, entry);
		}
		if (entry.css !== css) {
			entry.element.textContent = css;
			entry.css = css;
		}
		// The page can replace its head, for example in a hot update.
		if (!entry.element.isConnected) doc.head.append(entry.element);
		entry.count++;
	}

	let released = false;
	return () => {
		if (released) return;
		released = true;
		for (const { id } of sheets) {
			const entry = entries.get(id);
			if (!entry || --entry.count > 0 || id.startsWith('base:')) continue;
			entry.element.remove();
			entries.delete(id);
		}
	};
}
