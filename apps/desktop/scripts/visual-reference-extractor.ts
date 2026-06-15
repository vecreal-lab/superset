import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import electronPath from "electron";

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

interface CaptureTarget {
	file: string;
	selector: string;
	output: string;
	label: string;
	description: string;
	height?: number;
	width?: number;
	xPad?: number;
	yPad?: number;
	isolate?: boolean;
}

const BOOT_TIMEOUT_MS = 45_000;
const DEBUG_PORT = Number(process.env.PILL_REFERENCE_DEBUG_PORT ?? "39329");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
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

	throw new Error("Could not resolve Software Factory root.");
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
		await delay(250);
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
			if (pageTargets[0]) return pageTargets[0];
		} catch {
			// Target list is still booting.
		}
		await delay(250);
	}

	throw new Error("Timed out waiting for Electron page target.");
}

class CdpSession {
	private nextId = 1;
	private pending = new Map<
		number,
		{ resolve: (value: any) => void; reject: (error: Error) => void }
	>();

	private constructor(private readonly ws: WebSocket) {
		this.ws.addEventListener("message", (event) => {
			const message = JSON.parse(String(event.data)) as CdpMessage;
			if (!message.id || !this.pending.has(message.id)) return;

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

	send(method: string, params?: Record<string, unknown>): Promise<any> {
		const id = this.nextId++;
		this.ws.send(JSON.stringify({ id, method, params }));
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Timed out waiting for CDP command ${method}.`));
			}, 45_000);
			this.pending.set(id, { resolve, reject });
			this.pending.set(id, {
				resolve: (value) => {
					clearTimeout(timer);
					resolve(value);
				},
				reject: (error) => {
					clearTimeout(timer);
					reject(error);
				},
			});
		});
	}

	close(): void {
		this.ws.close();
	}
}

async function writeElectronMain(entryPath: string): Promise<void> {
	const source = `
const { app, BrowserWindow } = require("electron");
app.commandLine.appendSwitch("disable-gpu");
app.whenReady().then(async () => {
	const win = new BrowserWindow({
		width: 1680,
		height: 1100,
		show: false,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	await win.loadURL("about:blank");
});
app.on("window-all-closed", () => app.quit());
`;
	await writeFile(entryPath, source, "utf8");
}

async function captureTarget(
	session: CdpSession,
	factoryRoot: string,
	target: CaptureTarget,
	needsNavigate: boolean,
): Promise<Record<string, unknown>> {
	const filePath = path.join(factoryRoot, target.file);
	await session.send("Emulation.setDeviceMetricsOverride", {
		width: 1680,
		height: 1100,
		deviceScaleFactor: 1,
		mobile: false,
	});
	if (needsNavigate) {
		await session.send("Page.navigate", { url: pathToFileURL(filePath).href });
		await delay(900);
	}
	await session.send("Runtime.evaluate", {
		expression: `document.querySelector(${JSON.stringify(target.selector)})?.scrollIntoView({ block: "start" })`,
		awaitPromise: false,
	});
	await delay(300);
	if (target.isolate) {
		await session.send("Runtime.evaluate", {
			expression: `(() => {
				const el = document.querySelector(${JSON.stringify(target.selector)});
				if (!el) return false;
				document.body.innerHTML = '<div class="container">' + el.outerHTML + '</div>';
				window.scrollTo(0, 0);
				return true;
			})()`,
			returnByValue: true,
		});
		await delay(300);
	}

	const rectResult = await session.send("Runtime.evaluate", {
		expression: `(() => {
			const el = document.querySelector(${JSON.stringify(target.selector)});
			if (!el) return null;
			const r = el.getBoundingClientRect();
			return {
				x: Math.max(0, r.left + window.scrollX),
				y: Math.max(0, r.top + window.scrollY),
				width: Math.min(document.documentElement.clientWidth, r.width),
				height: r.height,
				scrollX: window.scrollX,
				scrollY: window.scrollY
			};
		})()`,
		returnByValue: true,
	});
	const rect = rectResult.result?.value;
	if (!rect) throw new Error(`Selector not found: ${target.selector}`);

	const result = await session.send("Page.captureScreenshot", {
		format: "png",
		captureBeyondViewport: false,
	});
	const outputPath = path.join(factoryRoot, target.output);
	await mkdir(path.dirname(outputPath), { recursive: true });
	await writeFile(outputPath, Buffer.from(result.data, "base64"));

	return {
		label: target.label,
		description: target.description,
		source_file: target.file,
		selector: target.selector,
		output: target.output.replace(/\\/g, "/"),
		viewport: { width: 1680, height: 1100 },
		source_rect: rect,
	};
}

async function main(): Promise<void> {
	const factoryRoot = findFactoryRoot();
	const outputDir = path.join(factoryRoot, "runs", "wo-pills");
	const tmpDir = await mkdtemp(path.join(tmpdir(), "wo-pills-electron-"));
	const mainPath = path.join(tmpDir, "main.cjs");
	await mkdir(outputDir, { recursive: true });
	await writeElectronMain(mainPath);

	const designFile = "projects/vecreal/drafts/brand-atoms/reference-design-system.html";
	const mockupsFile = "projects/vecreal/drafts/brand-atoms/reference-visual-mockups.html";
	const coreTargets: CaptureTarget[] = [
		{
			file: designFile,
			selector: "#buttons-expanded",
			output: "runs/wo-pills/visual-reference/status-badge-section-24-buttons.png",
			label: "StatusBadge / Chip button rhythm",
			description: "Section 24 button and inline-chip rhythm cited by StatusBadge and Chip briefs.",
			height: 900,
		},
		{
			file: designFile,
			selector: "#live-expanded",
			output: "runs/wo-pills/visual-reference/status-badge-section-26-live-state.png",
			label: "StatusBadge live states",
			description: "Section 26 live-state cues for running, pending, done, and active status rhythm.",
			height: 1000,
		},
		{
			file: designFile,
			selector: "#avatars-chips",
			output: "runs/wo-pills/visual-reference/chip-authorchip-section-33-avatars-chips.png",
			label: "Chip / AuthorChip",
			description: "Section 33 avatars and chips, including opaque backgrounds, initials, outlined filter pills, and avatar-chip sizing.",
			height: 980,
		},
		{
			file: designFile,
			selector: "#notifications",
			output: "runs/wo-pills/visual-reference/attention-pill-section-39-notifications.png",
			label: "AttentionPill / notification badge",
			description: "Section 39 notification count badge, clay tint, ring visibility, unread emphasis, and count cap behavior.",
			height: 980,
		},
		{
			file: designFile,
			selector: "#cross-cutting",
			output: "runs/wo-pills/visual-reference/pill-family-section-48-accessibility.png",
			label: "Pill family accessibility",
			description: "Section 48 focus, keyboard, screen-reader, and contrast baseline for the pill family.",
			height: 900,
		},
	];
	const mockupTargets: CaptureTarget[] = [
		{
			file: mockupsFile,
			selector: ".ds-section",
			output: "runs/wo-pills/visual-reference/cockpit-context/reference-visual-mockups-playground-pill-context.png",
			label: "Reference visual mockups / current playground",
			description: "Current mockups playground visible region; includes locked-token pill examples but no cockpit proposal sections in this file.",
			height: 900,
			isolate: true,
		},
	];
	const targets =
		process.env.PILL_REFERENCE_MOCKUPS_ONLY === "true"
			? mockupTargets
			: coreTargets;

	const appProcess = spawn(
		String(electronPath),
		[
			`--remote-debugging-port=${DEBUG_PORT}`,
			`--user-data-dir=${path.join(tmpDir, "user-data")}`,
			mainPath,
		],
		{
			cwd: appRoot,
			env: {
				...process.env,
				ELECTRON_ENABLE_LOGGING: "false",
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	appProcess.stdout.resume();
	appProcess.stderr.resume();

	let session: CdpSession | undefined;
	const captures: Record<string, unknown>[] = [];
	try {
		await waitForDebugEndpoint(DEBUG_PORT, appProcess);
		const pageTarget = await waitForPageTarget(DEBUG_PORT);
		session = await CdpSession.connect(pageTarget.webSocketDebuggerUrl ?? "");
		await session.send("Page.enable");
		await session.send("Runtime.enable");

		let loadedFile = "";
		for (const target of targets) {
			captures.push(await captureTarget(session, factoryRoot, target, loadedFile !== target.file));
			loadedFile = target.file;
			console.log(`[visual-reference-extractor] captured ${target.output}`);
		}

		await writeFile(
			path.join(outputDir, "visual-reference", "extraction-summary.json"),
			`${JSON.stringify({ status: "pass", captures }, null, 2)}\n`,
			"utf8",
		);
		console.log("[visual-reference-extractor] PASS");
	} finally {
		session?.close();
		if (appProcess.exitCode === null) appProcess.kill();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
