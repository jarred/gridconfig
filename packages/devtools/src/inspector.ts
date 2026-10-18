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
import { STYLE } from './style.ts';

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
const OVERRIDDEN = [
	'width',
	'height',
	'flex',
	'max-width',
	'max-height',
	'min-width',
	'min-height'
];

type Saved = Map<string, [string, string]>;
type Stored = { open?: boolean; name?: string; sizes?: Record<string, { w: number; h: number }> };

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
	let drag: { x: number; y: number; w: number; h: number; axis: 'x' | 'y' | 'both' } | null = null;
	let optionsKey = '';

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
		<div class="layer" popover="manual">
			<div class="decor"></div>
			<div class="chrome" hidden>
				<div class="tag interactive">
					<span class="name"></span>
					<select aria-label="Step"></select>
					<button class="reset" title="Back to the natural size" aria-label="Reset the size">↺</button>
				</div>
				<div class="size"></div>
				<div class="handle edge x interactive" data-axis="x"></div>
				<div class="handle edge y interactive" data-axis="y"></div>
				<div class="handle dot interactive" data-axis="both"></div>
				<div class="below"><div class="info"></div><ul class="findings"></ul></div>
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
	const select = $<HTMLSelectElement>('.tag select');
	const resetButton = $<HTMLButtonElement>('.tag .reset');
	const tag = $<HTMLElement>('.tag');
	const sizeLabel = $<HTMLElement>('.size');
	const below = $<HTMLElement>('.below');
	const infoRow = $<HTMLElement>('.info');
	const findings = $<HTMLElement>('.findings');
	const toggleButton = $<HTMLButtonElement>('.toggle');
	const handles = shadow.querySelectorAll<HTMLElement>('.handle');

	const hostsOf = () => [...document.querySelectorAll<HTMLElement>(`[${attributes.host}]`)];
	const nameOf = (host: Element) => host.getAttribute(attributes.host) ?? '';

	// Sizes: the real host gets an inline size. The page around it reflows, and the cascade does the rest.
	function setSize(host: HTMLElement, w: number, h: number) {
		if (!overrides.has(host)) {
			const saved: Saved = new Map();
			for (const p of OVERRIDDEN)
				saved.set(p, [host.style.getPropertyValue(p), host.style.getPropertyPriority(p)]);
			overrides.set(host, saved);
			touched.add(host);
		}
		const set = (p: string, v: string) => host.style.setProperty(p, v, 'important');
		set('width', `${Math.round(w)}px`);
		set('height', `${Math.round(h)}px`);
		set('flex', 'none');
		set('max-width', 'none');
		set('max-height', 'none');
		set('min-width', '0');
		set('min-height', '0');
		write((s) => ((s.sizes ??= {})[nameOf(host)] = { w: Math.round(w), h: Math.round(h) }));
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
		write((s) => s.sizes && delete s.sizes[nameOf(host)]);
		schedule();
	}

	// Drawing.
	function schedule() {
		if (!frame) frame = requestAnimationFrame(render);
	}

	function render() {
		frame = 0;
		const hosts = hostsOf();
		toggleButton.hidden = hosts.length === 0;
		toggleButton.setAttribute('aria-pressed', String(isOpen));
		if (!isOpen || hosts.length === 0) {
			decor.replaceChildren();
			chrome.hidden = true;
			return;
		}

		// Sizes from an earlier visit come back, for example after a reload.
		const sizes = read().sizes ?? {};
		for (const host of hosts) {
			const s = sizes[nameOf(host)];
			if (s && !overrides.has(host) && !drag) setSize(host, s.w, s.h);
		}

		if (!selected || !selected.isConnected) {
			const wanted = read().name;
			selected = hosts.find((h) => nameOf(h) === wanted) ?? hosts[0];
			watch();
		}

		const parts: HTMLElement[] = [];
		for (const host of hosts) {
			if (host === selected) continue;
			const r = host.getBoundingClientRect();
			parts.push(
				el('div', 'frame dim', { x: r.left, y: r.top, w: r.width, h: r.height }),
				(() => {
					const chip = el('button', 'chip interactive', { x: r.left, y: r.top - 22 }, nameOf(host));
					chip.addEventListener('click', () => select_(host));
					return chip;
				})()
			);
		}
		parts.push(...drawSelected(selected as HTMLElement));
		decor.replaceChildren(...parts);
	}

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
			resolved = info ? resolve(info, host.clientWidth, host.clientHeight) : null;
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
			hostSize: { w: host.clientWidth, h: host.clientHeight },
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
		resetButton.hidden = !overrides.has(host);
		place(tag, { x: hr.left, y: Math.max(4, hr.top - 34) });
		sizeLabel.textContent = `${Math.round(host.clientWidth)} × ${Math.round(host.clientHeight)}`;
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
		for (const host of [...touched]) restore(host);
		schedule();
	}
	function toggle() {
		if (isOpen) close();
		else open();
	}
	toggleButton.addEventListener('click', toggle);
	resetButton.addEventListener('click', () => selected && reset(selected));
	select.addEventListener('change', () => {
		const host = selected as HTMLElement | null;
		const info =
			host && parseDebug(getComputedStyle(host).getPropertyValue(DEBUG_PROPERTY), nameOf(host));
		if (!host || !info) return;
		const size = sizeForStep(info, Number(select.value), {
			w: host.clientWidth,
			h: host.clientHeight
		});
		setSize(host, size.w, size.h);
		schedule();
	});

	for (const handle of handles) {
		handle.addEventListener('pointerdown', (e) => {
			if (!selected) return;
			e.preventDefault();
			handle.setPointerCapture(e.pointerId);
			const r = selected.getBoundingClientRect();
			drag = {
				x: e.clientX,
				y: e.clientY,
				w: r.width,
				h: r.height,
				axis: handle.dataset.axis as 'x' | 'y' | 'both'
			};
		});
		handle.addEventListener('pointermove', (e) => {
			const host = selected as HTMLElement | null;
			if (!drag || !host) return;
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
			setSize(host, Math.max(MIN_SIZE, w), Math.max(MIN_SIZE, h));
			schedule();
		});
		const end = () => (drag = null);
		handle.addEventListener('pointerup', end);
		handle.addEventListener('pointercancel', end);
	}

	const controller: Controller = {
		open,
		close,
		toggle,
		select: select_,
		reset,
		destroy() {
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
