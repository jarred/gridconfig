// Prints the server render of the app as JSON. The hydration test runs this file in a process
// of its own, because the server and the browser need different export conditions.
import { render } from 'svelte/server';
import { build, card } from './app.ts';

const { default: App } = await import(build('server'));
const { head, body } = render(App, { props: { layouts: [card, card, card] } });
console.log(JSON.stringify({ head, body }));
