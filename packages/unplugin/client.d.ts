declare module '*.grid' {
	import type { CompiledLayout } from '@gridconfig/core';
	const layout: CompiledLayout;
	export default layout;
}

declare module '*.yaml?grid' {
	import type { CompiledLayout } from '@gridconfig/core';
	const layout: CompiledLayout;
	export default layout;
}

declare module '*.yml?grid' {
	import type { CompiledLayout } from '@gridconfig/core';
	const layout: CompiledLayout;
	export default layout;
}
