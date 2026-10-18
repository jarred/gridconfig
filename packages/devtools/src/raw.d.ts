// A bundler turns `import x from './file.css?raw'` into the text of the file. Vite does this.
declare module '*?raw' {
	const content: string;
	export default content;
}
