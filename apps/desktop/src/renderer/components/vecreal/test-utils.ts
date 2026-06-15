import { expect } from "bun:test";
import { axe } from "jest-axe";
import { JSDOM } from "jsdom";

type GlobalWithDom = typeof globalThis & {
	window?: unknown;
	document?: unknown;
	Node?: unknown;
	Element?: unknown;
	HTMLElement?: unknown;
	SVGElement?: unknown;
	DocumentFragment?: unknown;
	MutationObserver?: unknown;
	getComputedStyle?: unknown;
	navigator?: unknown;
	requestAnimationFrame?: unknown;
	cancelAnimationFrame?: unknown;
};

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const { window } = dom;
const target = globalThis as GlobalWithDom;
const createElement = window.document.createElement.bind(window.document);

window.document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
	const element = createElement(tagName, options);
	if (!element.style) {
		Object.defineProperty(element, "style", {
			value: { cssText: "" },
			configurable: true,
			writable: true,
		});
	}
	return element;
}) as typeof window.document.createElement;

function installDomGlobals() {
	Object.defineProperties(target, {
		window: { value: window, configurable: true, writable: true },
		document: { value: window.document, configurable: true, writable: true },
		Node: { value: window.Node, configurable: true, writable: true },
		Element: { value: window.Element, configurable: true, writable: true },
		HTMLElement: { value: window.HTMLElement, configurable: true, writable: true },
		SVGElement: { value: window.SVGElement, configurable: true, writable: true },
		DocumentFragment: {
			value: window.DocumentFragment,
			configurable: true,
			writable: true,
		},
		MutationObserver: {
			value: window.MutationObserver,
			configurable: true,
			writable: true,
		},
		getComputedStyle: {
			value: window.getComputedStyle.bind(window),
			configurable: true,
			writable: true,
		},
		navigator: { value: window.navigator, configurable: true, writable: true },
		requestAnimationFrame: {
			value: (callback: FrameRequestCallback) =>
				window.setTimeout(() => callback(Date.now()), 0),
			configurable: true,
			writable: true,
		},
		cancelAnimationFrame: {
			value: (handle: number) => window.clearTimeout(handle),
			configurable: true,
			writable: true,
		},
	});
}

installDomGlobals();

export async function expectNoAxeViolations(html: string) {
	installDomGlobals();
	window.document.body.innerHTML = html;
	try {
		const results = await axe(window.document.body, {
			rules: {
				region: { enabled: false },
			},
		});
		expect(results.violations).toEqual([]);
	} finally {
		window.document.body.innerHTML = "";
	}
}
