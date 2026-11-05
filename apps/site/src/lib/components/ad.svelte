<script lang="ts" module>
	import Logo from './logo.svelte';

	/** Common ad and social media sizes in px. Pass a key as `size`, or set `width` and `height`. */
	export const adSizes = {
		// IAB display
		mpu: [300, 250],
		'large-rectangle': [336, 280],
		square: [250, 250],
		'half-page': [300, 600],
		'wide-skyscraper': [160, 600],
		skyscraper: [120, 600],
		billboard: [970, 250],
		leaderboard: [728, 90],
		'super-leaderboard': [970, 90],
		banner: [468, 60],
		'mobile-banner': [320, 50],
		'large-mobile-banner': [320, 100],
		// Social
		'square-post': [1080, 1080],
		'portrait-post': [1080, 1350],
		story: [1080, 1920],
		'link-post': [1200, 628],
		video: [1280, 720],
		'x-header': [1500, 500],
		'linkedin-banner': [1584, 396]
	} as const satisfies Record<string, readonly [number, number]>;

	export type AdSize = keyof typeof adSizes;
</script>

<script lang="ts">
	import { Grid } from '@gridconfig/svelte';
	import layout from './ad.grid';

	let {
		size = 'mpu',
		width,
		height,
		logoText = 'gridconfig',
		headline = 'Dynamic Layouts',
		copy = 'Harness the power of CSS Grids and container queries.',
		cta = 'Learn more',
		href = 'https://gridconfig.dev',
		image,
		alt = ''
	}: {
		size?: AdSize;
		/** Overrides the width of `size`. */
		width?: number;
		/** Overrides the height of `size`. */
		height?: number;
		logo?: string;
		headline?: string;
		copy?: string;
		cta?: string;
		href?: string;
		image?: string;
		alt?: string;
	} = $props();

	const w = $derived(width ?? adSizes[size][0]);
	const h = $derived(height ?? adSizes[size][1]);
</script>

<a class="ad" {href} style:width="{w}px" style:height="{h}px" aria-label="{headline}. {cta}">
	<Grid {layout} debug={false}>
		<div data-grid-area="I" class="image">
			<Logo />
		</div>
		<h2 data-grid-area="H">{headline}</h2>
		<div data-grid-area="C" class="copy"><p>{copy}</p></div>
		<div data-grid-area="B"><span class="cta">{cta}</span></div>
	</Grid>
</a>

<style>
	.ad {
		display: block;
		flex: none;
		overflow: hidden;
		color: #111;
		background: #f4f1ea;
		text-decoration: none;
		font-family: system-ui, sans-serif;

		/* Type scale for the base step (square formats). The steps below change only these. */
		--logo-size: clamp(9px, 5cqmin, 48px);
		--head-size: clamp(11px, 9cqmin, 96px);
		--copy-size: clamp(9px, 4.5cqmin, 40px);
		--cta-size: clamp(9px, 4.5cqmin, 40px);
	}

	h2,
	div:not(.image):not([data-grid-area='L']) {
		padding: var(--gap);
	}

	.logo {
		font-size: var(--logo-size);
		font-weight: 800;
		letter-spacing: -0.02em;
		white-space: nowrap;
	}

	h2 {
		margin: 0;
		font-size: var(--head-size);
		line-height: 1;
		letter-spacing: -0.03em;
		text-wrap: balance;
	}

	.copy p {
		margin: 0;
		font-size: var(--copy-size);
		line-height: 1.25;
		text-wrap: pretty;
	}

	.image {
		min-height: 0;
		overflow: hidden;
		background: linear-gradient(135deg, #ff5a36, #ffb347 55%, #4f7cff);
	}

	.image img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.cta {
		padding: 0.6em 1.1em;
		color: #fff;
		background: #111;
		font-size: var(--cta-size);
		font-weight: 600;
		line-height: 1;
		white-space: nowrap;
	}

	/* The cqw, cqh and cqmin units here measure the ad host, the nearest size container. */
	@container style(--grid-step: sky) {
		* {
			--logo-size: clamp(9px, 11cqw, 32px);
			--head-size: clamp(11px, 14cqw, 40px);
			--copy-size: clamp(9px, 9cqw, 20px);
			--cta-size: clamp(9px, 9cqw, 20px);
		}
	}

	@container style(--grid-step: tall) or style(--grid-step: story) {
		* {
			--logo-size: clamp(9px, 5cqw, 56px);
			--head-size: clamp(12px, 10cqw, 120px);
			--copy-size: clamp(9px, 5cqw, 48px);
			--cta-size: clamp(9px, 5cqw, 48px);
		}
	}

	@container style(--grid-step: link) {
		* {
			--head-size: clamp(11px, 11cqh, 96px);
			--copy-size: clamp(9px, 5cqh, 40px);
		}
	}

	@container style(--grid-step: banner) or style(--grid-step: mobile) {
		* {
			--logo-size: clamp(9px, 12cqh, 64px);
			--head-size: clamp(11px, 16cqh, 88px);
			--copy-size: clamp(9px, 8cqh, 36px);
			--cta-size: clamp(9px, 9cqh, 36px);
		}
	}

	@container style(--grid-step: strip) or style(--grid-step: leaderboard) {
		* {
			--logo-size: clamp(9px, 28cqh, 28px);
			--head-size: clamp(10px, 30cqh, 30px);
			--copy-size: clamp(9px, 20cqh, 18px);
			--cta-size: clamp(9px, 22cqh, 18px);
		}

		h2 {
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}
</style>
