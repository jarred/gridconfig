declare module '*.grid' {
	import type { CompiledLayout } from '@gridconfig/core';
	const layout: CompiledLayout;
	export default layout;
}

declare module '*.yaml?layout' {
	import type { CompiledLayout } from '@gridconfig/core';
	const layout: CompiledLayout;
	export default layout;
}

declare module '*.yml?layout' {
	import type { CompiledLayout } from '@gridconfig/core';
	const layout: CompiledLayout;
	export default layout;
}
