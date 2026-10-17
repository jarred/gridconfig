declare module '*.yaml?layout' {
	import type { CompiledLayout } from '@gridconfig/core';
	const layout: CompiledLayout;
	export default layout;
}
