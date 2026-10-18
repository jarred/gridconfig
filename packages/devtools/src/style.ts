const ACCENT = '#3b5bdb';

export const STYLE = `
:host { display: contents; }
* { box-sizing: border-box; }
.layer {
	position: fixed; inset: 0; width: auto; height: auto; margin: 0; padding: 0; border: 0;
	background: none; overflow: visible; pointer-events: none; color: ${ACCENT};
	font: 12px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	z-index: 2147483647;
}
[hidden] { display: none !important; }
.interactive { pointer-events: auto; }
.decor, .chrome { position: absolute; inset: 0; pointer-events: none; }
.decor > *, .chrome > * { position: absolute; }

.frame { border: 1px solid ${ACCENT}; }
.frame.dim { border-style: dashed; opacity: 0.5; }
.chip, .tag {
	background: #fff; color: ${ACCENT}; border-radius: 6px; padding: 3px 8px;
	box-shadow: 0 0 0 1px rgba(59, 91, 219, 0.25); font: inherit; border: 0;
}
.chip { cursor: pointer; }
.tag { display: flex; align-items: center; gap: 0; padding: 3px 6px 3px 8px; }
.tag select {
	font: inherit; color: inherit; border: 0; background: transparent; padding: 0 2px 0 0; margin: 0;
	cursor: pointer; appearance: auto;
}
.tag .reset {
	font: inherit; color: inherit; border: 0; background: transparent; cursor: pointer; padding: 0 0 0 6px;
}
.size { transform: translateX(-100%); color: ${ACCENT}; background: rgba(255, 255, 255, 0.85); padding: 0 4px; border-radius: 4px; }

.area { border: 1px solid rgba(59, 91, 219, 0.55); background: rgba(59, 91, 219, 0.05); }
.area-label { position: absolute; left: 8px; top: 6px; }
.area-label.none { opacity: 0.55; }
.area-label.none::after { content: ' (empty)'; }
.empty {
	border: 1px dashed rgba(59, 91, 219, 0.3);
	background: repeating-linear-gradient(135deg, rgba(59, 91, 219, 0.1) 0 1px, transparent 1px 6px);
}
.band.pad { background: repeating-linear-gradient(45deg, rgba(59, 91, 219, 0.28) 0 1px, rgba(59, 91, 219, 0.08) 1px 5px); }
.band.gap { background: rgba(59, 91, 219, 0.16); }

.label {
	pointer-events: auto; white-space: nowrap; transform: translate(-50%, 0);
	text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff;
}
.label.row { transform: translate(-100%, -50%); }
.label.row.in { transform: translate(0, -50%); }

.handle.edge { cursor: ew-resize; }
.handle.edge.y { cursor: ns-resize; }
.handle.dot {
	width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 1.5px solid ${ACCENT};
	cursor: nwse-resize;
}

.below { display: flex; flex-direction: column; gap: 6px; max-width: min(560px, 90vw); }
.info { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.info .item { background: rgba(255, 255, 255, 0.85); padding: 0 4px; border-radius: 4px; }
.findings { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.finding { background: #fff; border-radius: 6px; padding: 4px 8px; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12); color: #343a40; }
.finding::before { content: '●'; margin-right: 6px; }
.finding.error::before { color: #c92a2a; }
.finding.warning::before { color: #e67700; }
.finding.info::before { color: #868e96; }

.toggle {
	position: fixed; right: 16px; bottom: 16px; display: flex; align-items: center; gap: 6px;
	font: inherit; background: #fff; color: ${ACCENT}; border: 0; border-radius: 999px; padding: 6px 12px;
	box-shadow: 0 0 0 1px rgba(59, 91, 219, 0.35), 0 2px 8px rgba(0, 0, 0, 0.15); cursor: pointer;
}
.toggle[aria-pressed='true'] { background: ${ACCENT}; color: #fff; }
`;
