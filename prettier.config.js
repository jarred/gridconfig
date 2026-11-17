/** @type {import("prettier").Config} */
const config = {
	useTabs: true,
	singleQuote: true,
	trailingComma: 'none',
	printWidth: 100,
	plugins: ['prettier-plugin-svelte'],
	overrides: [
		{ files: '*.svelte', options: { parser: 'svelte' } },
		{ files: '*.grid', options: { parser: 'yaml', useTabs: false } },
		// Code in the READMEs and the guide reads better with two spaces than with tabs.
		{ files: ['README.md', 'docs/**/*.md'], options: { useTabs: false, tabWidth: 2 } }
	]
};

export default config;
