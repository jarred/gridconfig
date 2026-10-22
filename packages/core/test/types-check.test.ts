// Type tests for the object form. `tsc` checks this file; the functions never run.
import { grid } from '../src/index.ts';

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
}
