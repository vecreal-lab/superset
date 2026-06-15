import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import electronPath from "electron";

interface RouteSmokeResult {
	route: string;
	status: "pass" | "fail";
	textLength: number;
	childCount: number;
	width: number;
	height: number;
	activePath: string;
	routeErrorBoundary: boolean;
	viewportOverflowChecks: ViewportOverflowCheck[];
	consoleErrors: string[];
	fileProtocolMessages: string[];
	screenshotPath: string;
	error?: string;
}

interface ViewportOverflowCheck {
	width: number;
	height: number;
	innerWidth: number;
	scrollWidth: number;
	overflow: boolean;
	layoutOverflow: boolean;
	offenders: Array<{
		tag: string;
		id: string;
		className: string;
		left: number;
		right: number;
		width: number;
		scrollWidth: number;
		clientWidth: number;
		text: string;
	}>;
	layoutOverflowElements: Array<{
		tag: string;
		id: string;
		className: string;
		left: number;
		right: number;
		width: number;
		height: number;
		scrollWidth: number;
		clientWidth: number;
		overflowX: string;
		text: string;
	}>;
}

interface SmokeSummary {
	status: "pass" | "fail";
	startedAt: string;
	completedAt: string;
	factoryRoot: string;
	appRoot: string;
	routeCount: number;
	passCount: number;
	failCount: number;
	fileProtocolMessageCount: number;
	horizontalOverflowCount: number;
	results: RouteSmokeResult[];
}

interface CdpTarget {
	type: string;
	url: string;
	webSocketDebuggerUrl?: string;
}

interface CdpMessage {
	id?: number;
	method?: string;
	params?: any;
	result?: any;
	error?: { message?: string; data?: string };
}

const FILE_SCHEME = "file" + "://";
const NOT_ALLOWED_LOCAL_RESOURCE = "Not allowed to load local resource";
const ROUTE_WAIT_MS = Number(process.env.COCKPIT_BOOT_ROUTE_WAIT_MS ?? "1200");
const ROUTE_READY_TIMEOUT_MS = Number(
	process.env.COCKPIT_BOOT_ROUTE_READY_TIMEOUT_MS ?? "8000",
);
const BOOT_TIMEOUT_MS = Number(
	process.env.COCKPIT_BOOT_TIMEOUT_MS ?? "60_000".replace("_", ""),
);
const DEBUG_PORT = Number(process.env.COCKPIT_BOOT_DEBUG_PORT ?? "39313");
const SUPPORTED_VIEWPORTS = [
	{ width: 1280, height: 720 },
	{ width: 1366, height: 768 },
	{ width: 1440, height: 900 },
	{ width: 1536, height: 864 },
	{ width: 1600, height: 900 },
	{ width: 1920, height: 1080 },
] as const;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");

function resolveOutputDir(factoryRoot: string): string {
	return process.env.COCKPIT_BOOT_OUTPUT_DIR
		? path.resolve(process.env.COCKPIT_BOOT_OUTPUT_DIR)
		: path.join(factoryRoot, "runs", "wo-cs", "cockpit-boot-smoke");
}

function findFactoryRoot(): string {
	const explicit = process.env.SOFTWARE_FACTORY_ROOT || process.env.FACTORY_ROOT;
	if (explicit && existsSync(path.join(explicit, "work-orders"))) {
		return path.resolve(explicit);
	}

	let current = appRoot;
	while (true) {
		if (
			existsSync(path.join(current, "work-orders")) &&
			existsSync(path.join(current, "tools", "factory-runner"))
		) {
			return current;
		}
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}

	throw new Error("Could not resolve Software Factory root for cockpit smoke run.");
}

function normalizeRoute(route: string): string {
	const trimmed = route.trim();
	if (!trimmed || trimmed === "/") return "/";
	return trimmed.replace(/\/+$/, "");
}

function routeSlug(route: string): string {
	return (
		normalizeRoute(route)
			.replace(/^\//, "root-")
			.replace(/[^a-zA-Z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.toLowerCase() || "root"
	);
}

function stripSearch(pathname: string): string {
	return pathname.split("?")[0] ?? pathname;
}

function expectedActivePath(route: string): string {
	const aliases = new Map([
		["/", "/factory"],
		["/automations", "/v2-workspaces"],
		["/factory/dialogues", "/factory/synthesis-receipts"],
		["/factory/projects/software-factory", "/factory"],
		["/settings", "/settings/appearance"],
		["/settings/presets", "/settings/terminal"],
		["/workspace", "/welcome"],
	]);
	return aliases.get(route) ?? route;
}

async function registeredRoutes(): Promise<string[]> {
	const routeTreePath = path.join(appRoot, "src", "renderer", "routeTree.gen.ts");
	const raw = await readFile(routeTreePath, "utf8");
	const fullPathMatches = [...raw.matchAll(/fullPath:\s*["']([^"']+)["']/g)].map(
		(match) => match[1] ?? "",
	);
	const staticAuthenticatedRoutes = fullPathMatches
		.filter((route) => route.startsWith("/"))
		.filter((route) => !route.includes("$"))
		.filter(
			(route) =>
				route !== "/" &&
				route !== "/sign-in/" &&
				route !== "/create-organization/",
		)
		.map(normalizeRoute);

	const representativeDynamicRoutes = [
		"/factory/projects/software-factory",
		"/factory/work-orders/WO-CS-COCKPIT-STABILITY-PERMANENT-FIX",
		"/factory/foundations/software-factory/domain-knowledge",
		"/factory/foundations/software-factory/domain-knowledge/factory-architecture",
	];

	return [...new Set([...staticAuthenticatedRoutes, ...representativeDynamicRoutes])]
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b));
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDebugEndpoint(
	port: number,
	appProcess: ChildProcessWithoutNullStreams,
): Promise<void> {
	const endpoint = `http://127.0.0.1:${port}/json/version`;
	const deadline = Date.now() + BOOT_TIMEOUT_MS;

	while (Date.now() < deadline) {
		if (appProcess.exitCode !== null) {
			throw new Error(`Electron exited before debug endpoint opened (${appProcess.exitCode}).`);
		}
		try {
			const response = await fetch(endpoint);
			if (response.ok) return;
		} catch {
			// Electron is still booting.
		}
		await delay(300);
	}

	throw new Error(`Timed out waiting for Electron debug endpoint on ${endpoint}.`);
}

async function waitForPageTarget(port: number): Promise<CdpTarget> {
	const deadline = Date.now() + BOOT_TIMEOUT_MS;

	while (Date.now() < deadline) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/json/list`);
			const targets = (await response.json()) as CdpTarget[];
			const pageTargets = targets.filter(
				(target) => target.type === "page" && target.webSocketDebuggerUrl,
			);
			const appTarget = pageTargets.find((target) =>
				target.url.includes("factory://app"),
			);
			if (appTarget) return appTarget;
			if (pageTargets[0]) return pageTargets[0];
		} catch {
			// Target list is not ready yet.
		}
		await delay(300);
	}

	throw new Error("Timed out waiting for Electron app window.");
}

class CdpSession {
	private nextId = 1;
	private pending = new Map<
		number,
		{ resolve: (value: any) => void; reject: (error: Error) => void }
	>();
	private eventHandlers = new Set<(message: CdpMessage) => void>();

	private constructor(private readonly ws: WebSocket) {
		this.ws.addEventListener("message", (event) => {
			const message = JSON.parse(String(event.data)) as CdpMessage;
			if (message.id && this.pending.has(message.id)) {
				const pending = this.pending.get(message.id);
				this.pending.delete(message.id);
				if (!pending) return;
				if (message.error) {
					pending.reject(
						new Error(
							`${message.error.message ?? "CDP command failed"}${
								message.error.data ? `: ${message.error.data}` : ""
							}`,
						),
					);
				} else {
					pending.resolve(message.result);
				}
				return;
			}

			for (const handler of this.eventHandlers) {
				handler(message);
			}
		});
		this.ws.addEventListener("close", () => {
			for (const pending of this.pending.values()) {
				pending.reject(new Error("CDP websocket closed."));
			}
			this.pending.clear();
		});
	}

	static connect(wsUrl: string): Promise<CdpSession> {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(wsUrl);
			const timer = setTimeout(() => {
				reject(new Error(`Timed out connecting to ${wsUrl}.`));
				ws.close();
			}, BOOT_TIMEOUT_MS);
			ws.addEventListener("open", () => {
				clearTimeout(timer);
				resolve(new CdpSession(ws));
			});
			ws.addEventListener("error", () => {
				clearTimeout(timer);
				reject(new Error(`Could not connect to ${wsUrl}.`));
			});
		});
	}

	onEvent(handler: (message: CdpMessage) => void): void {
		this.eventHandlers.add(handler);
	}

	send(method: string, params?: Record<string, unknown>): Promise<any> {
		const id = this.nextId++;
		this.ws.send(JSON.stringify({ id, method, params }));
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
		});
	}

	close(): void {
		this.ws.close();
	}
}

function consoleTextFromEvent(message: CdpMessage): string | undefined {
	if (message.method === "Runtime.consoleAPICalled") {
		const args = message.params?.args ?? [];
		return args
			.map((arg: any) => arg.value ?? arg.description ?? "")
			.filter(Boolean)
			.join(" ");
	}
	if (message.method === "Runtime.exceptionThrown") {
		const details = message.params?.exceptionDetails;
		return details?.exception?.description ?? details?.text;
	}
	if (message.method === "Log.entryAdded") {
		return message.params?.entry?.text;
	}
	return undefined;
}

async function inspectRoute(session: CdpSession) {
	const result = await session.send("Runtime.evaluate", {
		expression: `(() => {
			const root = document.getElementById("root") ?? document.body;
			const rect = root.getBoundingClientRect();
			return {
				activePath: window.location.hash.replace(/^#/, "") || window.location.pathname,
				textLength: document.body.innerText.trim().length,
				childCount: root.children.length,
				width: Math.round(rect.width),
				height: Math.round(rect.height),
				routeErrorBoundary: Boolean(document.querySelector("[data-route-error-boundary='true']")),
			};
		})()`,
		returnByValue: true,
		awaitPromise: true,
	});
	if (result.exceptionDetails) {
		throw new Error(result.exceptionDetails.text ?? "Route inspection failed.");
	}
	return result.result.value;
}

async function waitForRouteInspection(
	session: CdpSession,
	expectedPath?: string,
) {
	const deadline = Date.now() + ROUTE_READY_TIMEOUT_MS;
	let lastInspection = await inspectRoute(session);

	while (Date.now() < deadline) {
		const activePath = normalizeRoute(stripSearch(lastInspection.activePath));
		const expectedRouteReached = !expectedPath || activePath === expectedPath;
		if (
			lastInspection.textLength > 0 &&
			lastInspection.childCount > 0 &&
			lastInspection.width > 0 &&
			lastInspection.height > 0 &&
			expectedRouteReached
		) {
			return lastInspection;
		}
		await delay(250);
		lastInspection = await inspectRoute(session);
	}

	return lastInspection;
}

async function setViewport(
	session: CdpSession,
	viewport: { width: number; height: number },
) {
	await session.send("Emulation.setDeviceMetricsOverride", {
		width: viewport.width,
		height: viewport.height,
		deviceScaleFactor: 1,
		mobile: false,
	});
	await session.send("Runtime.evaluate", {
		expression: `window.dispatchEvent(new Event("resize"))`,
		awaitPromise: true,
	});
	await delay(150);
}

async function inspectHorizontalOverflow(
	session: CdpSession,
	viewport: { width: number; height: number },
): Promise<ViewportOverflowCheck> {
	const result = await session.send("Runtime.evaluate", {
		expression: `(() => {
			const doc = document.documentElement;
			const body = document.body;
			const innerWidth = window.innerWidth;
			const innerHeight = window.innerHeight;
			const scrollWidth = Math.max(doc.scrollWidth, body?.scrollWidth ?? 0, doc.clientWidth);
			const items = Array.from(document.body.querySelectorAll("*"))
				.map((element) => {
					const style = getComputedStyle(element);
					const rect = element.getBoundingClientRect();
					return {
						tag: element.tagName.toLowerCase(),
						id: element.id || "",
						className: String(element.getAttribute("class") || ""),
						left: Math.round(rect.left),
						right: Math.round(rect.right),
						width: Math.round(rect.width),
						height: Math.round(rect.height),
						scrollWidth: element.scrollWidth,
						clientWidth: element.clientWidth,
						overflowX: style.overflowX,
						text: String(element.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 140),
						allowedHorizontalScroll: Boolean(
							element.closest("pre, code, table, [data-allow-horizontal-scroll='true']") ||
							element.tagName.toLowerCase() === "pre" ||
							element.tagName.toLowerCase() === "code" ||
							element.tagName.toLowerCase() === "table" ||
							(
								(style.overflowX === "auto" || style.overflowX === "scroll") &&
								!String(element.getAttribute("class") || "").includes("overflow-y-auto") &&
								Boolean(element.querySelector("pre, code, table")) &&
								rect.left >= -1 &&
								rect.right <= innerWidth + 1
							)
						),
					};
				});
			const offenders = items
				.filter((item) => item.width > 0 && item.right > innerWidth + 1)
				.sort((left, right) => right.right - left.right)
				.slice(0, 12);
			const layoutOverflowElements = items
				.filter((item) => !item.allowedHorizontalScroll)
				.filter((item) => item.scrollWidth > item.clientWidth + 1)
				.filter((item) => item.width >= innerWidth * 0.72 || item.className.includes("overflow-y-auto"))
				.filter((item) => item.height >= Math.min(220, innerHeight * 0.32))
				.sort((left, right) => (right.scrollWidth - right.clientWidth) - (left.scrollWidth - left.clientWidth))
				.slice(0, 12)
				.map(({ allowedHorizontalScroll, ...item }) => item);
			const layoutOverflow = layoutOverflowElements.length > 0;
			return {
				width: ${viewport.width},
				height: ${viewport.height},
				innerWidth,
				scrollWidth,
				overflow: scrollWidth > innerWidth || layoutOverflow,
				layoutOverflow,
				offenders,
				layoutOverflowElements,
			};
		})()`,
		returnByValue: true,
		awaitPromise: true,
	});
	if (result.exceptionDetails) {
		throw new Error(result.exceptionDetails.text ?? "Horizontal overflow inspection failed.");
	}
	return result.result.value;
}

async function waitForCockpitBootNavigate(session: CdpSession): Promise<void> {
	const deadline = Date.now() + ROUTE_READY_TIMEOUT_MS;

	while (Date.now() < deadline) {
		const result = await session.send("Runtime.evaluate", {
			expression: `typeof window.__cockpitBootNavigate === "function"`,
			returnByValue: true,
		});
		if (result.result?.value === true) return;
		await delay(250);
	}

	throw new Error("Timed out waiting for cockpit boot navigation helper.");
}

async function captureScreenshot(session: CdpSession, screenshotPath: string) {
	const result = await session.send("Page.captureScreenshot", {
		format: "png",
		captureBeyondViewport: true,
	});
	await writeFile(screenshotPath, Buffer.from(result.data, "base64"));
}

async function main(): Promise<void> {
	const startedAt = new Date().toISOString();
	const factoryRoot = findFactoryRoot();
	const outputDir = resolveOutputDir(factoryRoot);
	const screenshotDir = path.join(outputDir, "screenshots");
	const supersetHomeDir = path.join(outputDir, "superset-home");
	await mkdir(screenshotDir, { recursive: true });
	await mkdir(supersetHomeDir, { recursive: true });

	const mainEntry = path.join(appRoot, "dist", "main", "index.js");
	const rendererEntry = path.join(appRoot, "dist", "renderer", "index.html");
	if (!existsSync(mainEntry) || !existsSync(rendererEntry)) {
		throw new Error(
			"Desktop app is not compiled. Run `bun run --cwd apps/desktop compile:app` first.",
		);
	}

	const routes = await registeredRoutes();
	const consoleMessages: string[] = [];
	const userDataDir = path.join(
		supersetHomeDir,
		`user-data-${DEBUG_PORT}-${process.pid}`,
	);
	await mkdir(userDataDir, { recursive: true });

	const appEnv = {
		...process.env,
		COCKPIT_BOOT_SMOKE: "true",
		FACTORY_LOCAL_ONLY: "true",
		NODE_ENV: "production",
		SKIP_ENV_VALIDATION: "true",
		SOFTWARE_FACTORY_ROOT: factoryRoot,
		SUPERSET_HOME_DIR: supersetHomeDir,
	};
	const appProcess = spawn(
		String(electronPath),
		[
			`--remote-debugging-port=${DEBUG_PORT}`,
			`--user-data-dir=${userDataDir}`,
			appRoot,
		],
		{
			cwd: appRoot,
			env: appEnv,
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	appProcess.stdout.resume();
	appProcess.stderr.resume();

	let session: CdpSession | undefined;
	try {
		await waitForDebugEndpoint(DEBUG_PORT, appProcess);
		const target = await waitForPageTarget(DEBUG_PORT);
		session = await CdpSession.connect(target.webSocketDebuggerUrl ?? "");
		await session.send("Runtime.enable");
		await session.send("Log.enable");
		await session.send("Page.enable");
		await waitForCockpitBootNavigate(session);
		session.onEvent((message) => {
			const text = consoleTextFromEvent(message);
			if (!text) return;
			const level = message.params?.type ?? message.params?.entry?.level ?? "";
			if (
				level === "error" ||
				message.method === "Runtime.exceptionThrown" ||
				text.includes(NOT_ALLOWED_LOCAL_RESOURCE)
			) {
				consoleMessages.push(text);
			}
		});
		const results: RouteSmokeResult[] = [];

		for (const route of routes) {
			consoleMessages.length = 0;
			const normalized = normalizeRoute(route);
			const screenshotPath = path.join(screenshotDir, `${routeSlug(normalized)}.png`);
			let result: RouteSmokeResult;
			try {
				const expectedPath = expectedActivePath(normalized);
				await session.send("Runtime.evaluate", {
					expression: `(async () => {
						const navigate = window.__cockpitBootNavigate;
						if (typeof navigate === "function") {
							await navigate(${JSON.stringify(normalized)});
							return;
						}
						window.location.hash = ${JSON.stringify(normalized)};
					})()`,
					awaitPromise: true,
				});
				await setViewport(session, SUPPORTED_VIEWPORTS[0]);
				await delay(ROUTE_WAIT_MS);
				await waitForRouteInspection(session, expectedPath);
				const viewportOverflowChecks: ViewportOverflowCheck[] = [];
				for (const viewport of SUPPORTED_VIEWPORTS) {
					await setViewport(session, viewport);
					await waitForRouteInspection(session, expectedPath);
					viewportOverflowChecks.push(
						await inspectHorizontalOverflow(session, viewport),
					);
				}
				await setViewport(session, SUPPORTED_VIEWPORTS[0]);
				const inspection = await waitForRouteInspection(session, expectedPath);
				await captureScreenshot(session, screenshotPath);
				const activePath = normalizeRoute(stripSearch(inspection.activePath));
				const routeMismatch = activePath !== expectedPath;
				const fileProtocolMessages = consoleMessages.filter(
					(message) =>
						message.includes(FILE_SCHEME) ||
						message.includes(NOT_ALLOWED_LOCAL_RESOURCE),
				);
				const horizontalOverflowChecks = viewportOverflowChecks.filter(
					(check) => check.overflow,
				);
				const failed =
					inspection.textLength === 0 ||
					inspection.childCount === 0 ||
					inspection.width === 0 ||
					inspection.height === 0 ||
					inspection.routeErrorBoundary ||
					routeMismatch ||
					horizontalOverflowChecks.length > 0 ||
					fileProtocolMessages.length > 0;
				result = {
					route: normalized,
					status: failed ? "fail" : "pass",
					...inspection,
					viewportOverflowChecks,
					consoleErrors: [...consoleMessages],
					fileProtocolMessages,
					screenshotPath: path.relative(factoryRoot, screenshotPath).replace(/\\/g, "/"),
					error: routeMismatch
						? `Expected active route ${expectedPath}; saw ${activePath}.`
						: horizontalOverflowChecks.length > 0
							? `Horizontal viewport overflow at ${horizontalOverflowChecks
									.map((check) =>
										check.layoutOverflow
											? `${check.width}x${check.height} (layout scroller ${check.layoutOverflowElements[0]?.scrollWidth}>${check.layoutOverflowElements[0]?.clientWidth})`
											: `${check.width}x${check.height} (${check.scrollWidth}>${check.innerWidth})`,
									)
									.join(", ")}.`
						: undefined,
				};
			} catch (error) {
				result = {
					route: normalized,
					status: "fail",
					textLength: 0,
					childCount: 0,
					width: 0,
					height: 0,
					activePath: "",
					routeErrorBoundary: false,
					viewportOverflowChecks: [],
					consoleErrors: [...consoleMessages],
					fileProtocolMessages: consoleMessages.filter(
						(message) =>
							message.includes(FILE_SCHEME) ||
							message.includes(NOT_ALLOWED_LOCAL_RESOURCE),
					),
					screenshotPath: path.relative(factoryRoot, screenshotPath).replace(/\\/g, "/"),
					error: error instanceof Error ? error.message : String(error),
				};
			}
			results.push(result);
			console.log(
				`[cockpit-boot-smoke] ${result.status.toUpperCase()} ${normalized}`,
			);
		}

		const failCount = results.filter((result) => result.status === "fail").length;
		const fileProtocolMessageCount = results.reduce(
			(total, result) => total + result.fileProtocolMessages.length,
			0,
		);
		const horizontalOverflowCount = results.filter((result) =>
			result.viewportOverflowChecks.some((check) => check.overflow),
		).length;
		const summary: SmokeSummary = {
			status: failCount === 0 ? "pass" : "fail",
			startedAt,
			completedAt: new Date().toISOString(),
			factoryRoot,
			appRoot,
			routeCount: results.length,
			passCount: results.length - failCount,
			failCount,
			fileProtocolMessageCount,
			horizontalOverflowCount,
			results,
		};
		await writeFile(
			path.join(outputDir, "results.json"),
			`${JSON.stringify(summary, null, 2)}\n`,
			"utf8",
		);

		if (summary.status === "fail") {
			console.error(
				`[cockpit-boot-smoke] FAIL ${summary.failCount}/${summary.routeCount} routes failed`,
			);
			process.exitCode = 1;
		} else {
			console.log(
				`[cockpit-boot-smoke] PASS ${summary.routeCount} routes, zero blocked local resource messages`,
			);
		}
	} finally {
		session?.close();
		if (appProcess.exitCode === null) {
			appProcess.kill();
		}
	}
}

main().catch(async (error) => {
	const factoryRoot = existsSync(path.join(appRoot, "work-orders"))
		? appRoot
		: findFactoryRoot();
	const outputDir = resolveOutputDir(factoryRoot);
	await mkdir(outputDir, { recursive: true });
	await writeFile(
		path.join(outputDir, "results.json"),
		`${JSON.stringify(
			{
				status: "fail",
				startedAt: new Date().toISOString(),
				completedAt: new Date().toISOString(),
				error: error instanceof Error ? error.message : String(error),
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
	console.error(error);
	process.exit(1);
});
