// The inspector: one overlay for every GridConfig layout on the page. It reads only the DOM
// contract (data-grid-* attributes), computed styles and the optional `--grid-debug` data. Thus it
// works the same in each framework. It reads the page and never changes it: resizing, step
// switching and pop-out are in the pro inspector.
import { DEBUG_PROPERTY, attributes } from '@gridconfig/core/runtime';
import type { DebugInfo } from '@gridconfig/core';
import {
	areaBoxes,
	diagnose,
	expandTracks,
	parseAreas,
	parseDebug,
	parseTrackSizes,
	resolve,
	stepLabel,
	trackStarts,
	type Finding,
	type Resolved
} from './model.ts';
import STYLE from './style.css?raw';

export type Controller = {
	/** Shows the overlay. Selects `host` when it is given. */
	open(host?: Element): void;
	/** Hides the overlay. */
	close(): void;
	toggle(): void;
	select(host: Element): void;
	/** Removes the overlay. */
	destroy(): void;
};

/** How long the page must be still before the check for hosts with no size. */
const SIZE_CHECK_DELAY = 1000;

type State = {
	/** The name of the selected layout, so a host that the page replaces is selected again. */
	name?: string;
};

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className: string,
	box?: { x?: number; y?: number; w?: number; h?: number },
	text?: string
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	node.className = className;
	if (box) place(node, box);
	if (text !== undefined) node.textContent = text;
	return node;
}

function place(node: HTMLElement, b: { x?: number; y?: number; w?: number; h?: number }) {
	if (b.x !== undefined) node.style.left = `${b.x}px`;
	if (b.y !== undefined) node.style.top = `${b.y}px`;
	if (b.w !== undefined) node.style.width = `${b.w}px`;
	if (b.h !== undefined) node.style.height = `${b.h}px`;
}

const round = (n: number) => Math.round(n * 10) / 10;
const px = (n: number) => `${round(n)}px`;
/**
 * The size that container queries measure: the content box. The inspector shows this size, and
 * the checks use it.
 */
function contentSize(host: HTMLElement): { w: number; h: number } {
	const cs = getComputedStyle(host);
	const n = (v: string) => parseFloat(v) || 0;
	return {
		w: Math.max(0, host.clientWidth - n(cs.paddingLeft) - n(cs.paddingRight)),
		h: Math.max(0, host.clientHeight - n(cs.paddingTop) - n(cs.paddingBottom))
	};
}

const describe = (e: Element) =>
	`<${e.localName}${e.classList.length ? '.' + e.classList[0] : ''}>`;

export function install(): Controller | null {
	if (typeof document === 'undefined' || typeof window === 'undefined') return null;
	const g = globalThis as { __gridconfigDevtools?: Controller };
	if (g.__gridconfigDevtools) return g.__gridconfigDevtools;

	// State.
	let isOpen = false;
	let selected: Element | null = null;
	let frame = 0;
	/**
	 * The guides show only while the pointer is over a layout, so a move away gives a clean view of
	 * the design. A zone is the area of a layout and of its labels. The tag with the controls stays.
	 */
	type Zone = { left: number; top: number; right: number; bottom: number };
	let pointer: { x: number; y: number } | null = null;
	let selectedZone: Zone | null = null;
	let otherZones: { zone: Zone; group: HTMLElement }[] = [];
	const noHover = window.matchMedia('(hover: none)');

	// The state is in memory. It stays through a hot update, because the controller is global, so a
	// host that the page replaces is selected again. A reload starts clean.
	const state: State = {};
	/** True while a host has the `debug` prop. The inspector opens and closes with it. */
	let debugOn = false;

	// DOM.
	const root = document.createElement('gridconfig-devtools');
	const shadow = root.attachShadow({ mode: 'open' });
	shadow.innerHTML = `
		<style>${STYLE}</style>
		<div class="layer" popover="manual">
			<div class="decor"></div>
			<div class="chrome" hidden>
				<div class="tag interactive">
					<span class="name"></span>
					<span class="step"></span>
					<span class="count" hidden></span>
				</div>
				<div class="size guide"></div>
				<div class="below guide"><div class="info"></div><ul class="findings"></ul></div>
			</div>
			<button class="toggle interactive" aria-pressed="false" title="GridConfig inspector (Alt+Shift+G)">
				<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M1 1h10v10H1zM1 6h10M6 1v10" fill="none" stroke="currentColor"/></svg>
				grid
			</button>
		</div>`;
	const $ = <T extends Element>(s: string) => shadow.querySelector<T>(s)!;
	const layer = $<HTMLElement>('.layer');
	const decor = $<HTMLElement>('.decor');
	const chrome = $<HTMLElement>('.chrome');
	const tagName = $<HTMLElement>('.tag .name');
	const stepLabelEl = $<HTMLElement>('.tag .step');
	const tag = $<HTMLElement>('.tag');
	const sizeLabel = $<HTMLElement>('.size');
	const below = $<HTMLElement>('.below');
	const infoRow = $<HTMLElement>('.info');
	const findings = $<HTMLElement>('.findings');
	const count = $<HTMLElement>('.tag .count');
	const toggleButton = $<HTMLButtonElement>('.toggle');

	const hostsOf = () => [...document.querySelectorAll<HTMLElement>(`[${attributes.host}]`)];
	const nameOf = (host: Element) => host.getAttribute(attributes.host) ?? '';

	// Drawing.
	function schedule() {
		if (!frame) frame = requestAnimationFrame(render);
	}

	// A host with no size shows nothing, and no error says why. In development, the console says it,
	// also when the inspector is closed. The check waits until the page is still for a moment, so
	// CSS that loads late does not give a false warning.
	const warned = new WeakSet<Element>();
	let sizeTimer = 0;
	function checkSizes() {
		clearTimeout(sizeTimer);
		sizeTimer = window.setTimeout(() => {
			for (const host of hostsOf()) {
				// No boxes: the host is not rendered (display: none, a closed <details>). That is not a mistake.
				if (warned.has(host) || host.getClientRects().length === 0) continue;
				const box = contentSize(host);
				const size = getComputedStyle(host).containerType === 'size';
				const axis = box.w === 0 ? 'width' : size && box.h === 0 ? 'height' : null;
				if (!axis) continue;
				warned.add(host);
				console.warn(
					`[gridconfig] The host of layout "${nameOf(host)}" has no ${axis}, so the layout cannot show. ` +
						`Its parent needs a definite ${axis}, for example ${axis}: ${axis === 'height' ? '100dvh' : '100%'}. ` +
						'A size container cannot take its size from its content.',
					host
				);
			}
		}, SIZE_CHECK_DELAY);
	}

	function render() {
		frame = 0;
		checkSizes();
		const hosts = hostsOf();
		// The `debug` prop opens the inspector on its host. When the last `debug` goes, for example in
		// a hot update, the inspector closes.
		const debugHost = hosts.find((host) => host.hasAttribute('data-grid-debug'));
		if (debugHost && !debugOn) {
			debugOn = true;
			return open(debugHost);
		}
		if (!debugHost && debugOn) {
			debugOn = false;
			if (isOpen) return close();
		}
		// The button shows only for a page that asks for it with the `debug` prop. While the inspector
		// is open (from the keys), the button stays, so it can close it.
		toggleButton.hidden = hosts.length === 0 || !(debugHost || isOpen);
		toggleButton.setAttribute('aria-pressed', String(isOpen));
		if (!isOpen || hosts.length === 0) {
			decor.replaceChildren();
			chrome.hidden = true;
			selectedZone = null;
			otherZones = [];
			return;
		}

		if (!selected || !selected.isConnected) {
			const wanted = state.name;
			selected = hosts.find((h) => nameOf(h) === wanted) ?? hosts[0];
			watch();
		}

		const parts: HTMLElement[] = [];
		otherZones = [];
		for (const host of hosts) {
			if (host === selected) continue;
			const r = host.getBoundingClientRect();
			const group = el('div', 'group other');
			const chip = el('button', 'chip interactive', { x: r.left, y: r.top - 22 }, nameOf(host));
			chip.addEventListener('click', () => select_(host));
			group.append(el('div', 'frame dim', { x: r.left, y: r.top, w: r.width, h: r.height }), chip);
			parts.push(group);
			otherZones.push({ zone: grow(r, 16, 26), group });
		}
		const mine = el('div', 'group guide');
		mine.append(...drawSelected(selected as HTMLElement));
		parts.push(mine);
		decor.replaceChildren(...parts);

		// The zone of the selected layout: the host, its labels and its controls.
		let zone = grow((selected as HTMLElement).getBoundingClientRect(), 16, 16);
		for (const n of [tag, below, ...mine.querySelectorAll<HTMLElement>('.label')])
			zone = union(zone, n.getBoundingClientRect());
		selectedZone = zone;
		updateHover();
	}

	const grow = (r: DOMRect, side: number, top: number): Zone => ({
		left: r.left - side,
		top: r.top - top,
		right: r.right + side,
		bottom: r.bottom + side
	});
	const union = (a: Zone, b: DOMRect): Zone =>
		b.width === 0 && b.height === 0
			? a
			: {
					left: Math.min(a.left, b.left),
					top: Math.min(a.top, b.top),
					right: Math.max(a.right, b.right),
					bottom: Math.max(a.bottom, b.bottom)
				};
	const contains = (z: Zone | null) =>
		!!z &&
		!!pointer &&
		pointer.x >= z.left &&
		pointer.x <= z.right &&
		pointer.y >= z.top &&
		pointer.y <= z.bottom;

	/** Shows the guides of the layout under the pointer. It runs on each move, so it only compares rectangles. */
	function updateHover() {
		// No hover on a touch screen: show the guides there.
		const hot = noHover.matches || contains(selectedZone);
		layer.classList.toggle('hot', hot);
		for (const { zone, group } of otherZones) group.classList.toggle('on', contains(zone));
	}
	window.addEventListener(
		'pointermove',
		(e) => {
			pointer = { x: e.clientX, y: e.clientY };
			updateHover();
		},
		{ capture: true, passive: true }
	);
	document.addEventListener('pointerout', (e) => {
		// No related target: the pointer left the window.
		if (!e.relatedTarget) {
			pointer = null;
			updateHover();
		}
	});

	function drawSelected(host: HTMLElement): HTMLElement[] {
		const out: HTMLElement[] = [];
		const name = nameOf(host);
		const hr = host.getBoundingClientRect();
		const info = parseDebug(getComputedStyle(host).getPropertyValue(DEBUG_PROPERTY), name);
		const grid = host.querySelector<HTMLElement>(`:scope > [${attributes.layout}]`);
		out.push(el('div', 'frame', { x: hr.left, y: hr.top, w: hr.width, h: hr.height }));

		let resolved: Resolved | null = null;
		let mapped: string[] = [];
		const children: { label: string; area: string | null }[] = [];
		const infoItems: string[] = [];

		if (grid) {
			const gr = grid.getBoundingClientRect();
			const cs = getComputedStyle(grid);
			const num = (v: string) => parseFloat(v) || 0;
			const bl = num(cs.borderLeftWidth);
			const bt = num(cs.borderTopWidth);
			const pad = {
				t: num(cs.paddingTop),
				r: num(cs.paddingRight),
				b: num(cs.paddingBottom),
				l: num(cs.paddingLeft)
			};
			const px0 = gr.left + bl;
			const py0 = gr.top + bt;
			const pw = grid.clientWidth;
			const ph = grid.clientHeight;
			const cx = px0 + pad.l;
			const cy = py0 + pad.t;
			const colSizes = parseTrackSizes(cs.gridTemplateColumns);
			const rowSizes = parseTrackSizes(cs.gridTemplateRows);
			const colGap = num(cs.columnGap);
			const rowGap = num(cs.rowGap);
			const colAt = trackStarts(colSizes, colGap);
			const rowAt = trackStarts(rowSizes, rowGap);
			const map = parseAreas(cs.gridTemplateAreas);
			const box = contentSize(host);
			resolved = info ? resolve(info, box.w, box.h) : null;
			mapped = map ? [...new Set(map.flat())].filter((n) => n !== '.') : [];

			for (const child of grid.children)
				children.push({ label: describe(child), area: child.getAttribute(attributes.area) });
			const present = new Set(children.map((c) => c.area));

			// Padding and gaps.
			const band = (cls: string, x: number, y: number, w: number, h: number) =>
				w > 0 && h > 0 && out.push(el('div', `band ${cls}`, { x, y, w, h }));
			band('pad', px0, py0, pw, pad.t);
			band('pad', px0, py0 + ph - pad.b, pw, pad.b);
			band('pad', px0, py0 + pad.t, pad.l, ph - pad.t - pad.b);
			band('pad', px0 + pw - pad.r, py0 + pad.t, pad.r, ph - pad.t - pad.b);
			const totalH = rowSizes.length ? rowAt.at(-1)! + rowSizes.at(-1)! : 0;
			const totalW = colSizes.length ? colAt.at(-1)! + colSizes.at(-1)! : 0;
			if (colGap > 0)
				for (let i = 0; i < colSizes.length - 1; i++)
					band('gap', cx + colAt[i] + colSizes[i], cy, colGap, totalH);
			if (rowGap > 0)
				for (let i = 0; i < rowSizes.length - 1; i++)
					band('gap', cx, cy + rowAt[i] + rowSizes[i], totalW, rowGap);

			// Areas, drawn from the tracks, so that an area without an element shows too.
			if (map) {
				map.forEach((row, r) =>
					row.forEach((n, c) => {
						if (n === '.' && colSizes[c] !== undefined && rowSizes[r] !== undefined)
							out.push(
								el('div', 'empty', {
									x: cx + colAt[c],
									y: cy + rowAt[r],
									w: colSizes[c],
									h: rowSizes[r]
								})
							);
					})
				);
				for (const b of areaBoxes(map)) {
					const c1 = b.col + b.cols - 1;
					const r1 = b.row + b.rows - 1;
					if (colSizes[c1] === undefined || rowSizes[r1] === undefined) continue;
					const box = el('div', 'area', {
						x: cx + colAt[b.col],
						y: cy + rowAt[b.row],
						w: colAt[c1] + colSizes[c1] - colAt[b.col],
						h: rowAt[r1] + rowSizes[r1] - rowAt[b.row]
					});
					const label = el(
						'span',
						present.has(b.name) ? 'area-label' : 'area-label none',
						undefined,
						b.name
					);
					if (!present.has(b.name)) label.title = 'No element uses this area';
					box.append(label);
					out.push(box);
				}
			}

			// Track labels: the authored CSS, with the used size in the tooltip.
			const authored = (list: string | undefined, sizes: number[]) => {
				const terms = list ? expandTracks(list) : null;
				return terms && terms.length === sizes.length ? terms : null;
			};
			const colTerms = authored(resolved?.cols, colSizes);
			const rowTerms = authored(resolved?.rows, rowSizes);
			const inside = hr.left < 96;
			rowSizes.forEach((size, i) => {
				const text = rowTerms?.[i] ?? px(size);
				const label = el(
					'div',
					`label row${inside ? ' in' : ''}`,
					{
						x: inside ? hr.left + 6 : hr.left - 10,
						y: cy + rowAt[i] + size / 2
					},
					text
				);
				label.title = `Used: ${px(size)}`;
				out.push(label);
			});
			colSizes.forEach((size, i) => {
				const label = el(
					'div',
					'label col',
					{ x: cx + colAt[i] + size / 2, y: hr.bottom + 8 },
					colTerms?.[i] ?? px(size)
				);
				label.title = `Used: ${px(size)}`;
				out.push(label);
			});

			if (resolved?.cols && !colTerms) infoItems.push(`cols ${resolved.cols}`);
			if (resolved?.rows && !rowTerms) infoItems.push(`rows ${resolved.rows}`);
			infoItems.push(`gap ${resolved?.gap ?? px(colGap)}`);
			infoItems.push(`padding ${resolved?.padding ?? px(pad.t)}`);
			if (info) {
				const hidden = info.areas.filter((n) => !mapped.includes(n));
				if (hidden.length) infoItems.push(`hidden ${hidden.join(', ')}`);
			} else
				infoItems.push('no debug data: compile with debug: true for steps and authored values');
		}

		const list: Finding[] = diagnose({
			hostSize: contentSize(host),
			hasGrid: !!grid,
			children,
			known: info?.areas ?? null,
			mapped,
			container: info?.container ?? null,
			warnings: info?.warnings ?? []
		});

		updateChrome(host, hr, info, resolved, infoItems, list);
		return out;
	}

	function updateChrome(
		host: HTMLElement,
		hr: DOMRect,
		info: DebugInfo | null,
		resolved: Resolved | null,
		infoItems: string[],
		list: Finding[]
	) {
		chrome.hidden = false;
		const name = nameOf(host);
		tagName.textContent = info ? `${name}/` : name;
		stepLabelEl.hidden = !info;
		if (info) {
			const step = info.steps[resolved?.step ?? 0];
			stepLabelEl.textContent = step ? stepLabel(step) : '';
			stepLabelEl.title = `Steps: ${info.steps.map(stepLabel).join(', ')}`;
		}
		place(tag, { x: hr.left, y: Math.max(4, hr.top - 34) });
		const box = contentSize(host);
		sizeLabel.textContent = `${Math.round(box.w)} × ${Math.round(box.h)}`;
		place(sizeLabel, { x: hr.right, y: Math.max(4, hr.top - 28) });
		place(below, { x: hr.left, y: hr.bottom + 30 });
		infoRow.replaceChildren(...infoItems.map((t) => el('span', 'item', undefined, t)));
		findings.replaceChildren(
			...list.map((f) => el('li', `finding ${f.level}`, undefined, f.message))
		);
		// The guides can be hidden, so the tag tells you that there are problems.
		count.hidden = list.length === 0;
		count.textContent = String(list.length);
		count.className = `count ${list.some((f) => f.level === 'error') ? 'error' : list.some((f) => f.level === 'warning') ? 'warning' : 'info'}`;
		count.title = list.map((f) => f.message).join('\n');
	}

	// Observers keep the overlay on the layout while the page moves or changes.
	const resizeObserver = new ResizeObserver(schedule);
	function watch() {
		resizeObserver.disconnect();
		resizeObserver.observe(document.documentElement);
		if (selected) {
			resizeObserver.observe(selected);
			for (const c of selected.children) resizeObserver.observe(c);
		}
	}
	const mutations = new MutationObserver(schedule);
	const start = () => {
		mutations.observe(document.body, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: [
				attributes.host,
				attributes.layout,
				attributes.area,
				'data-grid-debug',
				'style',
				'class'
			]
		});
		schedule();
	};

	window.addEventListener('scroll', schedule, true);
	window.addEventListener('resize', schedule);
	window.addEventListener('keydown', (e) => {
		if (e.altKey && e.shiftKey && e.code === 'KeyG') {
			e.preventDefault();
			toggle();
		}
	});

	// Controls.
	function select_(host: Element) {
		selected = host;
		state.name = nameOf(host);
		watch();
		schedule();
	}
	function open(host?: Element) {
		isOpen = true;
		if (host) select_(host);
		else schedule();
		watch();
	}
	function close() {
		isOpen = false;
		schedule();
	}
	function toggle() {
		if (isOpen) close();
		else open();
	}
	toggleButton.addEventListener('click', toggle);

	const controller: Controller = {
		open,
		close,
		toggle,
		select: select_,
		destroy() {
			clearTimeout(sizeTimer);
			close();
			resizeObserver.disconnect();
			mutations.disconnect();
			root.remove();
			delete g.__gridconfigDevtools;
		}
	};
	g.__gridconfigDevtools = controller;

	const mount = () => {
		document.documentElement.append(root);
		try {
			layer.showPopover();
		} catch {
			/* An old browser: the layer is position: fixed with a high z-index. */
		}
		start();
	};
	if (document.readyState === 'loading')
		document.addEventListener('DOMContentLoaded', mount, { once: true });
	else mount();
	return controller;
}
