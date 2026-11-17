// Writes schema.json, the JSON Schema that editors use for .grid files. Run `pnpm schema` after a
// change to the format. A test fails when schema.json is not the same as the output of this script.
// The patterns follow src/query.ts and src/model.ts. The compiler stays the judge: the schema only
// finds the common mistakes, and must accept each layout that the compiler accepts.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const NUM = String.raw`\d+(?:\.\d+)?`;
const RANGE = String.raw`(?:${NUM}(?:\.\.(?:${NUM})?)?|\.\.${NUM})`;
const SIZE = String.raw`(?:${RANGE}(?:x(?:${RANGE})?)?|x${RANGE})`;
const RATIO_VALUE = String.raw`${NUM}/${NUM}`;
const RATIO = String.raw`(?:${RATIO_VALUE}(?:\.\.(?:${RATIO_VALUE})?)?|\.\.${RATIO_VALUE})`;
const ORIENTATION = '(?:landscape|portrait)';
const IDENT = String.raw`[A-Za-z_][\w-]*`;

/** A query: terms with a space between them (AND), and parts with a comma between them (OR). */
function query(withNames: boolean): string {
	const term = `(?:${[SIZE, RATIO, ORIENTATION, ...(withNames ? [IDENT] : [])].join('|')})`;
	const part = `${term}(?: +${term})*`;
	return `^ *${part}(?: *, *${part})* *$`;
}

const TOP_LEVEL = [
	'name',
	'container',
	'breakpoints',
	'areas',
	'cols',
	'rows',
	'gap',
	'padding',
	'css',
	'flow'
];
const notTopLevel = `(?!(?:${[...TOP_LEVEL, 'base'].join('|')})$)`;
const RESERVED_NAMES = [
	'none',
	'and',
	'or',
	'not',
	'default',
	'inherit',
	'initial',
	'unset',
	'revert',
	'revert-layer'
];
const MAIN = ['start', 'center', 'end', 'between', 'around', 'evenly'];
const CROSS = ['start', 'center', 'end', 'stretch', 'baseline'];

const VALUE =
	"A bare number is px (8 → 8px). --name is a custom property (var(--name)). A token needs quotes: '{space.2}' → var(--space-2). Terms with an operator between them (--space * 2) become calc(). Anything else goes into the CSS with no change.";
const TRACKS =
	'Spaces separate the tracks. A bare number is px. SIZE*N repeats a track (1fr*3 → repeat(3, 1fr)). A track with spaces goes in a function: minmax(200px, 1fr). If a step sets areas and not this, the compiler gives equal tracks.';
const numberOrString = { type: ['string', 'number'] };

const flowObject = {
	type: 'object',
	additionalProperties: false,
	description: 'A flow as named keys. A key that is absent gets its default.',
	properties: {
		direction: { enum: ['row', 'column'], description: 'flex-direction. Default: row.' },
		main: {
			enum: MAIN,
			description:
				'justify-content, on the main axis. Default: start. between → space-between, around → space-around, evenly → space-evenly.'
		},
		cross: { enum: CROSS, description: 'align-items, on the cross axis. Default: stretch.' },
		gap: {
			...numberOrString,
			description: `The gap between the children. An expression or a list is permitted here. ${VALUE}`
		},
		wrap: { type: 'boolean', description: 'flex-wrap. Default: false.' }
	}
};
const flowString = {
	type: 'string',
	description:
		'[row|column] [main] [cross] [gap <term>] [wrap], or none. main: start center end between around evenly. cross: start center end stretch baseline.',
	examples: [
		'column',
		'row between center',
		'column center start',
		'row wrap gap 8',
		'column gap {space.2}',
		'none'
	]
};

const settings = {
	areas: {
		type: 'string',
		description:
			'The area map, as a multi-line string. Each line is a row. Spaces separate the cells (nav main main), or, with only capitals and dots, each character is a cell (AAB). . is an empty cell. Each area must be a rectangle. An area that is not in the active map is hidden.'
	},
	cols: {
		...numberOrString,
		description: `The column tracks. ${TRACKS}`,
		examples: ['200 1fr', '1fr*3', 'minmax(200px, 1fr)*3']
	},
	rows: {
		...numberOrString,
		description: `The row tracks. ${TRACKS}`,
		examples: ['auto 1fr auto', '50cqw 1fr']
	},
	gap: {
		...numberOrString,
		description: `Sets --grid-gap on the grid element, which the grid uses as its gap. ${VALUE}`,
		examples: [8, '{space.2}', '--space * 2']
	},
	padding: {
		...numberOrString,
		description: `Sets --grid-padding on the grid element, which the grid uses as its padding. ${VALUE}`,
		examples: [16, '16 24']
	},
	css: {
		type: 'string',
		description:
			'Raw declarations for the grid element in this step. The compiler does not change them. Each {, string and comment must be closed.'
	},
	flow: {
		type: 'object',
		description:
			'How the direct children of an area are arranged. A map from an area name to a flow. The area becomes a flex container. A flow entry in a step replaces the entry of an earlier step in full.',
		propertyNames: { pattern: `^${IDENT}$` },
		additionalProperties: { anyOf: [flowString, flowObject] }
	}
};

export const schema = {
	$schema: 'http://json-schema.org/draft-07/schema#',
	$id: 'https://unpkg.com/@gridconfig/core/schema.json',
	title: 'GridConfig layout',
	description:
		'A GridConfig layout (.grid file). The top level is the base step, which applies at every size. Each other key is a query key: a step with the settings that change from that container size.',
	type: 'object',
	definitions: {
		step: {
			type: 'object',
			description:
				'A step: the settings that change when this query key matches. A step writes only what it sets. Keys: 600 (width ≥ 600), ..600, 600..900, x400 (height), 600x400, 16/9 (ratio), landscape, portrait, or a name from breakpoints. A space is AND; a comma is OR. Height, ratio and orientation need container: size.',
			properties: settings,
			additionalProperties: false
		},
		query: {
			type: ['string', 'number'],
			pattern: query(false),
			description:
				'A query. Terms: 600 (width ≥ 600), ..600 (width < 600), 600..900, x400 (height), 600x400, 16/9 (ratio), landscape, portrait. A space is AND. A comma is OR. A minimum is included; a maximum is not.'
		}
	},
	properties: {
		name: {
			type: 'string',
			pattern: `^(?!(?:${RESERVED_NAMES.join('|')})$)${IDENT}$`,
			description:
				'The name of the layout: the container name, and a part of the data-grid-layout selector. Optional. The default is the file name, or the folder name for layout.grid, index.grid and grid.grid.'
		},
		container: {
			enum: ['inline-size', 'size'],
			description:
				'inline-size (the default) or size. Use size for a box with a fixed height, and for height, ratio and orientation keys. With size, the host must get a definite height from the page.'
		},
		breakpoints: {
			type: 'object',
			description:
				'Names for queries. A step key can use a name as a term. A name cannot use another name.',
			propertyNames: { pattern: `^${notTopLevel}${IDENT}$` },
			additionalProperties: { $ref: '#/definitions/query' }
		},
		...settings
	},
	patternProperties: { [`^${notTopLevel}${query(true).slice(1)}`]: { $ref: '#/definitions/step' } },
	additionalProperties: false,
	required: ['areas']
};

export const text = JSON.stringify(schema, null, '\t') + '\n';

// Run as a script: write the file. Imported by the test: only give the text.
if (process.argv[1] === fileURLToPath(import.meta.url))
	writeFileSync(new URL('../schema.json', import.meta.url), text);
