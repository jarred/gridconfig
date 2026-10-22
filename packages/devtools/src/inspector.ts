// The inspector: one overlay for every GridConfig layout on the page. It reads only the DOM
// contract (data-grid-* attributes), computed styles and the optional `--gc-debug` data. Thus it
// works the same in each framework.
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
	sizeForStep,
	snap,
	stepLabel,
	thresholds,
	trackStarts,
	type Finding,
	type Resolved
} from './model.ts';
import STYLE from './style.css?raw';

export type Controller = {
	/** Shows the overlay. Selects `host` when it is given. */
	open(host?: Element): void;
	/** Hides the overlay and gives every host back its natural size. */
	close(): void;
	toggle(): void;
	select(host: Element): void;
	/** Gives a host back its natural size. */
	reset(host: Element): void;
	/** Removes the overlay. */
	destroy(): void;
};

const KEY = 'gridconfig-devtools';
const SNAP = 6;
const MIN_SIZE = 16;
/** How long the page must be still before the check for hosts with no size. */
const SIZE_CHECK_DELAY = 1000;
const OVERRIDDEN = [
	'box-sizing',
	'width',
	'height',
	'flex',
	'max-width',
	'max-height',
	'min-width',
	'min-height'
];

type Saved = Map<string, [string, string]>;
type Size = { w: number; h: number };
type Stored = {
	open?: boolean;
	name?: string;
	/** Sizes the person set, by page path and layout name: "/promo|hero". */
	sizes?: Record<string, Size>;
	/** The layout that is popped out, the page it is on, and the size it has there. */
	popped?: Size & { name: string; path?: string };
};

/**
 * A popover gets styles from the browser: a border, padding, a background and `overflow: auto`. A
 * popped host keeps the values it has in the page, so the layout inside it does not change.
 */
const KEPT = [
	'padding-top',
	'padding-right',
	'padding-bottom',
	'padding-left',
	'border-top-width',
	'border-right-width',
	'border-bottom-width',
	'border-left-width',
	'border-top-style',
	'border-right-style',
	'border-bottom-style',
	'border-left-style',
	'background-color',
	'color',
	'overflow-x',
	'overflow-y'
];
/** The first background colour that is not transparent, from the element up. */
function backdropOf(element: Element): string {
	for (let e: Element | null = element; e; e = e.parentElement) {
		const color = getComputedStyle(e).backgroundColor;
		if (!/^(transparent|rgba?\(.*,\s*0\))$/.test(color)) return color;
	}
	return 'Canvas';
}

/** The room that a popped host leaves around it, for the labels of the inspector. */
const POP_MARGIN = 160;
const POP_DEFAULT: Size = { w: 480, h: 360 };

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
 * The size that container queries measure: the content box. The inspector uses it for every size
 * it shows or sets, so a host with padding or a border does not jump when a drag starts.
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
	const overrides = new WeakMap<Element, Saved>();
	const touched = new Set<Element>();
	/** The drag in progress. It keeps its own host and pointer, so nothing else can redirect it. */
	let drag: {
		host: HTMLElement;
		handle: HTMLElement;
		pointerId: number;
		x: number;
		y: number;
		w: number;
		h: number;
		axis: 'x' | 'y' | 'both';
		last?: Size;
	} | null = null;
	let optionsKey = '';
	/**
	 * The guides show only while the pointer is over a layout, so a move away gives a clean view of
	 * the design. A zone is the area of a layout and of its labels. The tag with the controls stays.
	 */
	type Zone = { left: number; top: number; right: number; bottom: number };
	let pointer: { x: number; y: number } | null = null;
	let selectedZone: Zone | null = null;
	let otherZones: { zone: Zone; group: HTMLElement }[] = [];
	const noHover = window.matchMedia('(hover: none)');
	/** The host that is popped out, with the inline styles that it had before. */
	let popped: HTMLElement | null = null;
	let poppedSaved: Saved = new Map();
	let poppedHadSize = false;

	// Storage can fail (private windows, blocked cookies). The inspector works without it.
	const read = (): Stored => {
		try {
			return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Stored;
		} catch {
			return {};
		}
	};
	const write = (patch: (s: Stored) => void) => {
		try {
			const s = read();
			patch(s);
			sessionStorage.setItem(KEY, JSON.stringify(s));
		} catch {
			/* no storage */
		}
	};

	// DOM.
	const root = document.createElement('gridconfig-devtools');
	const shadow = root.attachShadow({ mode: 'open' });
	shadow.innerHTML = `
		<style>${STYLE}</style>
		<div class="scrim" popover="manual" hidden></div>
		<div class="layer" popover="manual">
			<div class="decor"></div>
			<div class="chrome" hidden>
				<div class="tag interactive">
					<span class="name"></span>
					<select aria-label="Step"></select>
					<button class="reset" title="Back to the natural size" aria-label="Reset the size">↺</button>
					<button class="popout" aria-pressed="false" title="Pop out to the centre of the screen" aria-label="Pop out">
						<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M1 4.5V1h3.5M7.5 1H11v3.5M11 7.5V11H7.5M4.5 11H1V7.5" fill="none" stroke="currentColor"/></svg>
					</button>
					<span class="count" hidden></span>
				</div>
				<div class="size guide"></div>
				<div class="handle edge x interactive guide" data-axis="x"></div>
				<div class="handle edge y interactive guide" data-axis="y"></div>
				<div class="handle dot interactive guide" data-axis="both"></div>
				<div class="below guide"><div class="info"></div><ul class="findings"></ul></div>
			</div>
			<button class="toggle interactive" aria-pressed="false" title="GridConfig inspector (Alt+Shift+G)">
				<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M1 1h10v10H1zM1 6h10M6 1v10" fill="none" stroke="currentColor"/></svg>
				grid
			</button>
		</div>`;
	const $ = <T extends Element>(s: string) => shadow.querySelector<T>(s)!;
	const layer = $<HTMLElement>('.layer');
	const scrim = $<HTMLElement>('.scrim');
	const decor = $<HTMLElement>('.decor');
	const chrome = $<HTMLElement>('.chrome');
	const tagName = $<HTMLElement>('.tag .name');
	const select = $<HTMLSelectElement>('.tag select');
	const resetButton = $<HTMLButtonElement>('.tag .reset');
	const popoutButton = $<HTMLButtonElement>('.tag .popout');
	const tag = $<HTMLElement>('.tag');
	const sizeLabel = $<HTMLElement>('.size');
	const below = $<HTMLElement>('.below');
	const infoRow = $<HTMLElement>('.info');
	const findings = $<HTMLElement>('.findings');
	const count = $<HTMLElement>('.tag .count');
	const toggleButton = $<HTMLButtonElement>('.toggle');
	const handles = shadow.querySelectorAll<HTMLElement>('.handle');

	const hostsOf = () => [...document.querySelectorAll<HTMLElement>(`[${attributes.host}]`)];
	const nameOf = (host: Element) => host.getAttribute(attributes.host) ?? '';
	// A size belongs to one page. The same layout on another page, or nested in another layout,
	// must not get it.
	const sizeKey = (host: Element) => `${location.pathname}|${nameOf(host)}`;

	/**
	 * A layout inside a host that changes size must follow its cell, as it does when the page
	 * changes size. Thus an inline size on a nested host goes when its ancestor gets a new size.
	 */
	function releaseInside(host: Element) {
		for (const inner of [...touched])
			if (inner !== host && host.contains(inner) && inner !== popped) {
				restore(inner);
				write((s) => s.sizes && delete s.sizes[sizeKey(inner)]);
			}
	}

	// Sizes: the real host gets an inline size. The page around it reflows, and the cascade does the rest.
	function setSize(
		host: HTMLElement,
		w: number,
		h: number,
		{ persist = true, release = true }: { persist?: boolean; release?: boolean } = {}
	) {
		if (release) releaseInside(host);
		if (!overrides.has(host)) {
			const saved: Saved = new Map();
			for (const p of OVERRIDDEN)
				saved.set(p, [host.style.getPropertyValue(p), host.style.getPropertyPriority(p)]);
			overrides.set(host, saved);
			touched.add(host);
		}
		const set = (p: string, v: string) => host.style.setProperty(p, v, 'important');
		set('box-sizing', 'content-box');
		set('width', `${Math.round(w)}px`);
		set('height', `${Math.round(h)}px`);
		set('flex', 'none');
		set('max-width', 'none');
		set('max-height', 'none');
		set('min-width', '0');
		set('min-height', '0');
		const size = { w: Math.round(w), h: Math.round(h) };
		if (!persist) return;
		if (host === popped)
			write((s) => (s.popped = { name: nameOf(host), path: location.pathname, ...size }));
		else write((s) => ((s.sizes ??= {})[sizeKey(host)] = size));
	}

	/** The largest size that fits in the viewport while a host is popped out. */
	const fit = (w: number, h: number): Size => ({
		w: Math.max(MIN_SIZE, Math.min(w, window.innerWidth - POP_MARGIN)),
		h: Math.max(MIN_SIZE, Math.min(h, window.innerHeight - POP_MARGIN))
	});

	// Pop out: the real host goes to the top layer, in the middle of the screen. It stays at the
	// same place in the DOM, so the CSS that depends on its ancestors still applies.
	function popOut(host: HTMLElement, size?: Size) {
		if (popped === host) return;
		if (popped) popIn();
		const style = getComputedStyle(host);
		const pins: [string, string][] = KEPT.map((p) => [p, style.getPropertyValue(p)]);
		// Without a background, the page behind the scrim would show through the layout.
		const background = pins.find(([p]) => p === 'background-color')!;
		if (/^(transparent|rgba?\(.*,\s*0\))$/.test(background[1])) background[1] = backdropOf(host);
		pins.push(['position', 'fixed'], ['inset', '0'], ['margin', 'auto'], ['z-index', '2147483646']);
		poppedSaved = new Map(
			pins.map(([p]) => [p, [host.style.getPropertyValue(p), host.style.getPropertyPriority(p)]])
		);
		poppedHadSize = overrides.has(host);
		popped = host;
		selected = host;
		optionsKey = '';
		write((s) => (s.name = nameOf(host)));

		const now = contentSize(host);
		const start = size ?? (now.w > 0 && now.h > 0 ? now : POP_DEFAULT);
		const { w, h } = fit(start.w, start.h);
		setSize(host, w, h);
		for (const [p, v] of pins) host.style.setProperty(p, v, 'important');
		host.setAttribute('popover', 'manual');
		scrim.hidden = false;
		try {
			scrim.showPopover();
			host.showPopover();
			// The layer of the inspector must be above the host.
			layer.hidePopover();
			layer.showPopover();
		} catch {
			/* An old browser: the pins make the host position: fixed, with a high z-index. */
		}
		watch();
		schedule();
	}

	/** Puts the host back where it was, with its own styles. */
	function popIn() {
		const host = popped;
		if (!host) return;
		endDrag();
		popped = null;
		scrim.hidden = true;
		try {
			scrim.hidePopover();
			host.hidePopover();
		} catch {
			/* Not shown, or an old browser. */
		}
		host.removeAttribute('popover');
		for (const [p, [value, priority]] of poppedSaved)
			if (value) host.style.setProperty(p, value, priority);
			else host.style.removeProperty(p);
		poppedSaved = new Map();
		if (!poppedHadSize) restore(host);
		write((s) => delete s.popped);
		schedule();
	}

	function restore(host: Element) {
		const saved = overrides.get(host);
		if (!saved || !(host instanceof HTMLElement)) return;
		for (const [p, [value, priority]] of saved)
			if (value) host.style.setProperty(p, value, priority);
			else host.style.removeProperty(p);
		overrides.delete(host);
		touched.delete(host);
	}

	function reset(host: Element) {
		restore(host);
		write((s) => s.sizes && delete s.sizes[sizeKey(host)]);
		schedule();
	}

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
		toggleButton.hidden = hosts.length === 0;
		toggleButton.setAttribute('aria-pressed', String(isOpen));
		if (!isOpen || hosts.length === 0) {
			decor.replaceChildren();
			chrome.hidden = true;
			selectedZone = null;
			otherZones = [];
			return;
		}

		// The page can replace the popped host, for example when a file changes and the dev server
		// updates the page. Then the new host with the same name pops out.
		if (popped && !popped.isConnected) {
			popped = null;
			poppedSaved = new Map();
			scrim.hidden = true;
			try {
				scrim.hidePopover();
			} catch {
				/* Not shown. */
			}
		}
		const stored = read();
		if (
			!popped &&
			stored.popped &&
			(stored.popped.path ?? location.pathname) === location.pathname
		) {
			const again = hosts.find((h) => nameOf(h) === stored.popped!.name);
			if (again) popOut(again, stored.popped);
		}

		if (!selected || !selected.isConnected) {
			const wanted = read().name;
			selected = hosts.find((h) => nameOf(h) === wanted) ?? hosts[0];
			watch();
		}

		// Sizes from an earlier visit come back, for example after a reload. Only for the selected
		// host and the hosts around it: a nested layout follows its cell. The hosts are in document
		// order, so an outer host gets its size before an inner one.
		const sizes = stored.sizes ?? {};
		for (const host of hosts) {
			const s = sizes[sizeKey(host)];
			if (s && !overrides.has(host) && !drag && host !== popped && host.contains(selected))
				setSize(host, s.w, s.h, { persist: false, release: false });
		}

		const parts: HTMLElement[] = [];
		otherZones = [];
		for (const host of hosts) {
			// Behind the scrim, the other layouts are not in view.
			if (host === selected || popped) continue;
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
		// No hover on a touch screen, and a drag can go outside the zone: show the guides then.
		const hot = noHover.matches || !!drag || contains(selectedZone);
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
		select.hidden = !info;
		if (info) {
			const key = `${name}|${info.steps.map(stepLabel).join(',')}`;
			if (key !== optionsKey) {
				optionsKey = key;
				select.replaceChildren(
					...info.steps.map((s, i) => {
						const o = document.createElement('option');
						o.value = String(i);
						o.textContent = stepLabel(s);
						return o;
					})
				);
			}
			const value = String(resolved?.step ?? 0);
			if (select.value !== value) select.value = value;
		}
		layer.classList.toggle('popped', host === popped);
		resetButton.hidden = !overrides.has(host) || host === popped;
		popoutButton.setAttribute('aria-pressed', String(host === popped));
		popoutButton.title =
			host === popped ? 'Back into the page (Esc)' : 'Pop out to the centre of the screen';
		place(tag, { x: hr.left, y: Math.max(4, hr.top - 34) });
		const box = contentSize(host);
		sizeLabel.textContent = `${Math.round(box.w)} × ${Math.round(box.h)}`;
		place(sizeLabel, { x: hr.right, y: Math.max(4, hr.top - 28) });
		place(below, { x: hr.left, y: hr.bottom + 30 });
		const dim = (n: HTMLElement, b: { x: number; y: number; w?: number; h?: number }) =>
			place(n, b);
		const [hx, hy, hc] = handles;
		dim(hx, { x: hr.right - 4, y: hr.top + 12, w: 8, h: Math.max(0, hr.height - 24) });
		dim(hy, { x: hr.left + 12, y: hr.bottom - 4, w: Math.max(0, hr.width - 24), h: 8 });
		dim(hc, { x: hr.right - 6, y: hr.bottom - 6 });
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
			attributeFilter: [attributes.host, attributes.layout, attributes.area, 'style', 'class']
		});
		const debugHost = document.querySelector(`[${attributes.host}][data-grid-debug]`);
		if (debugHost) open(debugHost);
		else if (read().open) open();
		else schedule();
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
		if (popped && popped !== host) popIn();
		if (drag && drag.host !== host) endDrag();
		selected = host;
		optionsKey = '';
		write((s) => (s.name = nameOf(host)));
		watch();
		schedule();
	}
	function open(host?: Element) {
		isOpen = true;
		write((s) => (s.open = true));
		if (host) select_(host);
		else schedule();
		watch();
	}
	function close() {
		isOpen = false;
		write((s) => (s.open = false));
		endDrag();
		popIn();
		for (const host of [...touched]) restore(host);
		schedule();
	}
	function toggle() {
		if (isOpen) close();
		else open();
	}
	toggleButton.addEventListener('click', toggle);
	resetButton.addEventListener('click', () => selected && reset(selected));
	popoutButton.addEventListener('click', () => {
		if (!selected) return;
		if (popped) popIn();
		else popOut(selected as HTMLElement);
	});
	window.addEventListener(
		'keydown',
		(e) => {
			if (e.key === 'Escape' && popped) {
				e.preventDefault();
				e.stopPropagation();
				popIn();
			}
		},
		true
	);
	select.addEventListener('change', () => {
		const host = selected as HTMLElement | null;
		const info =
			host && parseDebug(getComputedStyle(host).getPropertyValue(DEBUG_PROPERTY), nameOf(host));
		if (!host || !info) return;
		endDrag();
		const size = sizeForStep(info, Number(select.value), contentSize(host));
		const to = host === popped ? fit(size.w, size.h) : size;
		setSize(host, to.w, to.h);
		schedule();
	});

	// Resize. A drag must end in every case, also when the browser never sends pointerup: the
	// window loses focus, a context menu opens, the element loses pointer capture, or the inspector
	// changes state. Else the next move over the handle resizes the host with no button down.
	function endDrag() {
		const d = drag;
		if (!d) return;
		drag = null;
		try {
			if (d.handle.hasPointerCapture(d.pointerId)) d.handle.releasePointerCapture(d.pointerId);
		} catch {
			/* The pointer is gone. */
		}
		// Store the size once, at the end, not on every move.
		if (d.last && d.host.isConnected) setSize(d.host, d.last.w, d.last.h);
		schedule();
	}

	for (const handle of handles) {
		handle.addEventListener('pointerdown', (e) => {
			// Only the primary button of the primary pointer starts a drag.
			if (!selected || e.button !== 0 || !e.isPrimary) return;
			e.preventDefault();
			endDrag();
			const host = selected as HTMLElement;
			const start = contentSize(host);
			drag = {
				host,
				handle,
				pointerId: e.pointerId,
				x: e.clientX,
				y: e.clientY,
				w: start.w,
				h: start.h,
				axis: handle.dataset.axis as 'x' | 'y' | 'both'
			};
			try {
				handle.setPointerCapture(e.pointerId);
			} catch {
				/* Not an active pointer. */
			}
		});
		handle.addEventListener('pointermove', (e) => {
			if (!drag || e.pointerId !== drag.pointerId) return;
			// No primary button down: the pointerup went somewhere else.
			if ((e.buttons & 1) === 0 || !drag.host.isConnected) return endDrag();
			const { host } = drag;
			let w = drag.axis === 'y' ? drag.w : drag.w + (e.clientX - drag.x);
			let h = drag.axis === 'x' ? drag.h : drag.h + (e.clientY - drag.y);
			const info = parseDebug(
				getComputedStyle(host).getPropertyValue(DEBUG_PROPERTY),
				nameOf(host)
			);
			if (info && !e.altKey) {
				const t = thresholds(info);
				w = snap(w, t.w, SNAP);
				h = snap(h, t.h, SNAP);
			}
			const to =
				host === popped ? fit(w, h) : { w: Math.max(MIN_SIZE, w), h: Math.max(MIN_SIZE, h) };
			drag.last = to;
			setSize(host, to.w, to.h, { persist: false });
			schedule();
		});
		const end = (e: PointerEvent) => {
			if (drag && e.pointerId === drag.pointerId) endDrag();
		};
		handle.addEventListener('pointerup', end);
		handle.addEventListener('pointercancel', end);
		handle.addEventListener('lostpointercapture', end);
	}
	window.addEventListener('blur', endDrag);
	window.addEventListener('contextmenu', endDrag, true);
	document.addEventListener('visibilitychange', () => document.hidden && endDrag());

	const controller: Controller = {
		open,
		close,
		toggle,
		select: select_,
		reset,
		destroy() {
			clearTimeout(sizeTimer);
			endDrag();
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
