<script lang="ts">
	import { compileLayout } from '@gridconfig/core';
	import { Grid } from '@gridconfig/svelte';
	let layout = compileLayout(`
    name: test1
    padding: 8
    gap: 4
    rows: auto 20cqw auto 1fr 2fr 1fr 1fr auto

    areas: |
      AB.CD
      .....
      EF.GH
      .....
      IIJJJ
      ..JJJ
      ..JJJ
      KKKKK
  `);
</script>

<Grid {layout}>
	<div data-grid-area="A">Immancence</div>
	<div data-grid-area="B">1-4-1, Nakamura, Nerima-ku, Tokyo</div>
	<div data-grid-area="C">John Clayton Lee<br />Co-founder, Creative Director</div>
	<div data-grid-area="D">+91 80 7214 31561<br />hello@immanence.studio<br />Tokyo, Japan</div>
	<div data-grid-area="E">DATE<br />12.08.20202</div>
	<div data-grid-area="F">
		TO<br />Johnathan Hack<br />Executive Creative Director<br />DAZED Media
	</div>
	<div data-grid-area="G">David Wise<br /> Co-founder, Creative Director</div>
	<div data-grid-area="H">+91 80 7214 31561<br />hello@immanence.studio<br />Tokyo, Japan</div>
	<div data-grid-area="I">
		Beyond transendance, remaining within, indwellining, a plane of immanence built on
		experimentation.
	</div>
	<div data-grid-area="J">
		<p>
			Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut
			labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco
			laboris nisi ut aliquip ex ea commodo consequat.
		</p>
		<p>
			Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut
			labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco
			laboris nisi ut aliquip ex ea commodo consequat.
		</p>
		<p>
			Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut
			labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco
			laboris nisi ut aliquip ex ea commodo consequat.
		</p>
		<p>
			Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut
			labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco
			laboris nisi ut aliquip ex ea commodo consequat.
		</p>
		<p>
			Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut
			labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco
			laboris nisi ut aliquip ex ea commodo consequat.
		</p>
	</div>
	<div data-grid-area="K">https://immanence.studio</div>
</Grid>

<style>
	div {
		font-size: 11px;
	}
</style>
