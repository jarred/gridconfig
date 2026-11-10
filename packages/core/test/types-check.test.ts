// Type tests for the object form. `tsc` checks this file; the functions never run.
import { createGrid, grid } from '../src/index.ts';

export function typed() {
	grid({
		areas: 'A',
		breakpoints: { md: '600..' },
		md: { gap: 1 },
		'md landscape': { gap: 2 },
		'..600': { gap: 3 },
		600: { gap: 4 }
	});
	// @ts-expect-error `lg` is not a breakpoint of this layout.
	grid({ areas: 'A', breakpoints: { md: '600..' }, lg: { gap: 1 } });
	// @ts-expect-error a step needs settings.
	grid({ areas: 'A', '600x400': 1 });

	// The names from the options of `createGrid` are keys of each layout.
	const mine = createGrid({ breakpoints: { md: '600..', lg: 1000 } });
	mine({ areas: 'A', md: { gap: 1 }, 'lg landscape': { gap: 2 } });
	mine({ areas: 'A', breakpoints: { huge: '1400..' }, lg: { gap: 1 }, huge: { gap: 2 } });
	// @ts-expect-error `huge` is not a breakpoint of the options or of this layout.
	mine({ areas: 'A', huge: { gap: 1 } });
}
