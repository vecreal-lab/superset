import { existsSync, statSync, watch, type FSWatcher } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export const FACTORY_DATASETS = [
	"work_orders",
	"runs",
	"foundations",
	"decisions",
	"missions",
	"roles",
	"prompts",
	"approvals",
	"lessons",
] as const;

export type FactoryDataset = (typeof FACTORY_DATASETS)[number];

export interface FactoryRow {
	id: string;
	title: string;
	status: string | null;
	source_path: string;
	source_relative_path: string;
	modified_at: string | null;
	parse_status: "ok" | "missing" | "error";
	quality_flags: string[];
	data: Record<string, string | number | boolean | null>;
}

export type FactoryIndex = Record<FactoryDataset, FactoryRow[]>;

const EMPTY_INDEX: FactoryIndex = {
	work_orders: [],
	runs: [],
	foundations: [],
	decisions: [],
	missions: [],
	roles: [],
	prompts: [],
	approvals: [],
	lessons: [],
};

const WATCH_RELATIVE_PATHS = [
	"work-orders",
	"runs",
	"projects",
	"decisions",
	"missions",
	"templates",
];

function cloneEmptyIndex(): FactoryIndex {
	const index = {} as FactoryIndex;
	for (const dataset of FACTORY_DATASETS) {
		index[dataset] = [];
	}
	return index;
}

function normalizeSlashes(value: string): string {
	return value.replace(/\\/g, "/");
}

function relativePath(root: string, absolutePath: string): string {
	return normalizeSlashes(path.relative(root, absolutePath));
}

function stripYamlScalar(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed.replace(/\s+#.*$/, "").trim();
}

function parseShallowYaml(raw: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const line of raw.split(/\r?\n/)) {
		if (!line.trim() || line.trimStart().startsWith("#")) continue;
		const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
		if (!match) continue;
		const [, key, value] = match;
		if (!key) continue;
		if (value === ">" || value === "|" || value === ">-" || value === "|-") {
			result[key] = "";
		} else {
			result[key] = stripYamlScalar(value ?? "");
		}
	}
	return result;
}

function parseMarkdownTitle(raw: string, fallback: string): string {
	const heading = raw.match(/^#\s+(.+)$/m)?.[1]?.trim();
	return heading || fallback;
}

async function readTextFile(filePath: string): Promise<string> {
	return readFile(filePath, "utf8");
}

async function fileModifiedAt(filePath: string): Promise<string | null> {
	try {
		return (await stat(filePath)).mtime.toISOString();
	} catch {
		return null;
	}
}

async function walkFiles(
	root: string,
	relativeDir: string,
	extensions: string[],
	depth = 0,
): Promise<string[]> {
	if (depth > 8) return [];
	const absoluteDir = path.join(root, relativeDir);
	if (!existsSync(absoluteDir)) return [];

	const entries = await readdir(absoluteDir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const entryRelative = path.join(relativeDir, entry.name);
		if (
			entry.name === ".git" ||
			entry.name === "node_modules" ||
			entry.name === "worktree"
		) {
			continue;
		}
		if (entry.isDirectory()) {
			files.push(...(await walkFiles(root, entryRelative, extensions, depth + 1)));
		} else if (
			entry.isFile() &&
			extensions.some((extension) => entry.name.endsWith(extension))
		) {
			files.push(path.join(root, entryRelative));
		}
	}
	return files;
}

function findFactoryRoot(): string {
	const explicit =
		process.env.SOFTWARE_FACTORY_ROOT || process.env.FACTORY_ROOT || "";
	const startCandidates = [
		explicit,
		process.cwd(),
		path.resolve(process.cwd(), ".."),
		path.resolve(process.cwd(), "..", ".."),
	].filter(Boolean);

	for (const start of startCandidates) {
		let current = path.resolve(start);
		while (true) {
			if (
				existsSync(path.join(current, "work-orders")) &&
				existsSync(path.join(current, "tools", "factory-runner"))
			) {
				return current;
			}
			const next = path.dirname(current);
			if (next === current) break;
			current = next;
		}
	}

	return path.resolve(process.cwd(), "..", "..");
}

function createRow({
	root,
	filePath,
	id,
	title,
	status,
	parseStatus = "ok",
	qualityFlags = [],
	data = {},
	modifiedAt,
}: {
	root: string;
	filePath: string;
	id: string;
	title: string;
	status?: string | null;
	parseStatus?: FactoryRow["parse_status"];
	qualityFlags?: string[];
	data?: FactoryRow["data"];
	modifiedAt: string | null;
}): FactoryRow {
	return {
		id,
		title,
		status: status ?? null,
		source_path: filePath,
		source_relative_path: relativePath(root, filePath),
		modified_at: modifiedAt,
		parse_status: parseStatus,
		quality_flags: qualityFlags,
		data,
	};
}

async function parseYamlRow(
	root: string,
	filePath: string,
	fallbackId: string,
): Promise<FactoryRow> {
	const modifiedAt = await fileModifiedAt(filePath);
	try {
		const raw = await readTextFile(filePath);
		const parsed = parseShallowYaml(raw);
		const id = parsed.id || fallbackId;
		return createRow({
			root,
			filePath,
			id,
			title: parsed.title || parsed.name || id,
			status: parsed.status || null,
			modifiedAt,
			data: {
				project_id: parsed.project_id || null,
				pipeline_variant: parsed.pipeline_variant || null,
				tier: parsed.tier || null,
				owner: parsed.owner || null,
			},
		});
	} catch (error) {
		return createRow({
			root,
			filePath,
			id: fallbackId,
			title: fallbackId,
			status: null,
			parseStatus: "error",
			qualityFlags: [error instanceof Error ? error.message : String(error)],
			modifiedAt,
		});
	}
}

async function parseMarkdownRow(
	root: string,
	filePath: string,
	fallbackId: string,
): Promise<FactoryRow> {
	const modifiedAt = await fileModifiedAt(filePath);
	try {
		const raw = await readTextFile(filePath);
		return createRow({
			root,
			filePath,
			id: fallbackId,
			title: parseMarkdownTitle(raw, fallbackId),
			status: null,
			modifiedAt,
			data: {
				bytes: raw.length,
			},
		});
	} catch (error) {
		return createRow({
			root,
			filePath,
			id: fallbackId,
			title: fallbackId,
			status: null,
			parseStatus: "error",
			qualityFlags: [error instanceof Error ? error.message : String(error)],
			modifiedAt,
		});
	}
}

async function collectWorkOrders(root: string): Promise<FactoryRow[]> {
	const files = await walkFiles(root, "work-orders", [".yml", ".yaml"]);
	return Promise.all(
		files.map((filePath) =>
			parseYamlRow(root, filePath, path.basename(filePath, path.extname(filePath))),
		),
	);
}

async function collectMissions(root: string): Promise<FactoryRow[]> {
	const files = await walkFiles(root, "missions", [".yml", ".yaml"]);
	return Promise.all(
		files.map((filePath) =>
			parseYamlRow(root, filePath, path.basename(filePath, path.extname(filePath))),
		),
	);
}

async function collectApprovals(root: string): Promise<FactoryRow[]> {
	const files = (await walkFiles(root, "runs", [".yml", ".yaml"])).filter(
		(filePath) => path.basename(filePath).startsWith("approval"),
	);
	return Promise.all(
		files.map((filePath) =>
			parseYamlRow(root, filePath, path.basename(filePath, path.extname(filePath))),
		),
	);
}

async function collectRuns(root: string): Promise<FactoryRow[]> {
	const rows: FactoryRow[] = [];
	const runsRoot = path.join(root, "runs");
	if (!existsSync(runsRoot)) return rows;

	const runJsonDirs = new Set(
		(await walkFiles(root, "runs", [".json"]))
			.filter((filePath) => path.basename(filePath) === "run.json")
			.map((filePath) => path.dirname(filePath)),
	);
	const topLevelRunDirs = await readdir(runsRoot, { withFileTypes: true });
	for (const entry of topLevelRunDirs) {
		if (!entry.isDirectory() || entry.name === "worktree" || entry.name.startsWith(".")) {
			continue;
		}
		runJsonDirs.add(path.join(runsRoot, entry.name));
	}

	for (const runDir of [...runJsonDirs].sort()) {
		const runName = relativePath(root, runDir);
		const runJson = path.join(runDir, "run.json");
		const modifiedAt = await fileModifiedAt(existsSync(runJson) ? runJson : runDir);
		const qualityFlags: string[] = [];
		let status: string | null = null;
		let workOrderId: string | null = null;
		let parseStatus: FactoryRow["parse_status"] = "ok";
		const runEntries = await safeReadDir(runDir);
		const awaiting = runEntries.filter((name) => name.startsWith("awaiting"));
		if (existsSync(runJson)) {
			try {
				const parsed = JSON.parse(await readTextFile(runJson));
				const parsedStatus = typeof parsed.status === "string" ? parsed.status : null;
				status =
					awaiting.length && !existsSync(path.join(runDir, "approval.yml"))
						? "awaiting_approval"
						: parsedStatus;
				workOrderId =
					typeof parsed.work_order_id === "string" ? parsed.work_order_id : null;
			} catch (error) {
				parseStatus = "error";
				qualityFlags.push(error instanceof Error ? error.message : String(error));
			}
		} else {
			status = awaiting.length ? "awaiting_approval" : "no_run_json";
			if (!awaiting.length) qualityFlags.push("run.json missing");
		}
		rows.push(
			createRow({
				root,
				filePath: existsSync(runJson) ? runJson : runDir,
				id: runName,
				title: workOrderId || runName,
				status,
				parseStatus,
				qualityFlags,
				modifiedAt,
				data: {
					work_order_id: workOrderId,
					has_approval: existsSync(path.join(runDir, "approval.yml")),
					has_approval_substage_3: existsSync(
						path.join(runDir, "approval-substage-3.yml"),
					),
					has_awaiting_review: awaiting.length > 0,
				},
			}),
		);
	}
	return rows;
}

async function safeReadDir(dirPath: string): Promise<string[]> {
	try {
		return await readdir(dirPath);
	} catch {
		return [];
	}
}

async function collectFoundations(root: string): Promise<FactoryRow[]> {
	const shared = await walkFiles(root, "projects/_shared/foundations", [".md"]);
	const projectFiles = (await walkFiles(root, "projects", [".md"])).filter(
		(filePath) => normalizeSlashes(filePath).includes("/foundations/"),
	);
	const files = [...new Set([...shared, ...projectFiles])];
	return Promise.all(
		files.map((filePath) =>
			parseMarkdownRow(
				root,
				filePath,
				relativePath(root, filePath).replace(/\.md$/, ""),
			),
		),
	);
}

async function collectDecisions(root: string): Promise<FactoryRow[]> {
	const rootDecisions = await walkFiles(root, "decisions", [".md"]);
	const projectDecisions = (await walkFiles(root, "projects", [".md"])).filter(
		(filePath) => normalizeSlashes(filePath).includes("/decisions/"),
	);
	const files = [...new Set([...rootDecisions, ...projectDecisions])];
	return Promise.all(
		files.map((filePath) =>
			parseMarkdownRow(
				root,
				filePath,
				relativePath(root, filePath).replace(/\.md$/, ""),
			),
		),
	);
}

async function collectLessons(root: string): Promise<FactoryRow[]> {
	const files = (await walkFiles(root, "runs", [".md"])).filter(
		(filePath) => path.basename(filePath) === "lessons-pending.md",
	);
	return Promise.all(
		files.map((filePath) =>
			parseMarkdownRow(
				root,
				filePath,
				relativePath(root, filePath).replace(/\.md$/, ""),
			),
		),
	);
}

async function collectPrompts(root: string): Promise<FactoryRow[]> {
	const files = await walkFiles(root, "templates/role-prompts", [".md"]);
	return Promise.all(
		files.map((filePath) =>
			parseMarkdownRow(root, filePath, path.basename(filePath, ".md")),
		),
	);
}

async function collectRoles(root: string): Promise<FactoryRow[]> {
	const registryPath = path.join(root, "templates", "agent-role-registry-template.yml");
	if (!existsSync(registryPath)) return [];
	const modifiedAt = await fileModifiedAt(registryPath);
	const raw = await readTextFile(registryPath);
	const rows: FactoryRow[] = [];
	const blocks = raw.split(/\n(?=\s+-\s+id:\s*)/g);
	for (const block of blocks) {
		const id = block.match(/^\s*-\s+id:\s*(.+)$/m)?.[1]?.trim();
		if (!id) continue;
		const parsed = parseShallowYaml(
			block
				.split(/\r?\n/)
				.map((line) => line.replace(/^\s{4}/, ""))
				.join("\n"),
		);
		rows.push(
			createRow({
				root,
				filePath: registryPath,
				id: stripYamlScalar(id),
				title: parsed.name || stripYamlScalar(id),
				status: parsed.provider || null,
				modifiedAt,
				data: {
					provider: parsed.provider || null,
					model: parsed.model || null,
					runtime: parsed.runtime || null,
					reasoning_level: parsed.reasoning_level || null,
				},
			}),
		);
	}
	return rows;
}

export class FactoryReadModel {
	private readonly root: string;
	private index: FactoryIndex = EMPTY_INDEX;
	private lastIndexedAt: string | null = null;
	private refreshPromise: Promise<FactoryIndex> | null = null;
	private watchers: FSWatcher[] = [];
	private debounceTimer: NodeJS.Timeout | null = null;

	constructor(root = findFactoryRoot()) {
		this.root = root;
	}

	getRoot(): string {
		return this.root;
	}

	startWatching(): void {
		if (this.watchers.length > 0) return;
		for (const relative of WATCH_RELATIVE_PATHS) {
			const absolute = path.join(this.root, relative);
			if (!existsSync(absolute)) continue;
			try {
				const watcher = watch(
					absolute,
					{ recursive: true },
					() => this.scheduleRefresh(),
				);
				this.watchers.push(watcher);
			} catch (error) {
				console.warn("[factory-read-model] watcher failed", {
					relative,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	stopWatching(): void {
		for (const watcher of this.watchers) watcher.close();
		this.watchers = [];
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = null;
	}

	private scheduleRefresh(): void {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => {
			this.refresh().catch((error) => {
				console.warn("[factory-read-model] refresh failed", error);
			});
		}, 350);
	}

	async refresh(): Promise<FactoryIndex> {
		if (this.refreshPromise) return this.refreshPromise;
		this.refreshPromise = this.buildIndex().finally(() => {
			this.refreshPromise = null;
		});
		return this.refreshPromise;
	}

	async getIndex(): Promise<FactoryIndex> {
		this.startWatching();
		if (!this.lastIndexedAt) await this.refresh();
		return this.index;
	}

	async getDataset(dataset: FactoryDataset): Promise<FactoryRow[]> {
		const index = await this.getIndex();
		return index[dataset] ?? [];
	}

	async summary(): Promise<{
		root: string;
		last_indexed_at: string | null;
		watcher_count: number;
		counts: Record<FactoryDataset, number>;
	}> {
		const index = await this.getIndex();
		return {
			root: this.root,
			last_indexed_at: this.lastIndexedAt,
			watcher_count: this.watchers.length,
			counts: Object.fromEntries(
				FACTORY_DATASETS.map((dataset) => [dataset, index[dataset].length]),
			) as Record<FactoryDataset, number>,
		};
	}

	private async buildIndex(): Promise<FactoryIndex> {
		if (!existsSync(this.root) || !statSync(this.root).isDirectory()) {
			this.index = cloneEmptyIndex();
			this.lastIndexedAt = new Date().toISOString();
			return this.index;
		}

		const next: FactoryIndex = cloneEmptyIndex();
		[
			next.work_orders,
			next.runs,
			next.foundations,
			next.decisions,
			next.missions,
			next.roles,
			next.prompts,
			next.approvals,
			next.lessons,
		] = await Promise.all([
			collectWorkOrders(this.root),
			collectRuns(this.root),
			collectFoundations(this.root),
			collectDecisions(this.root),
			collectMissions(this.root),
			collectRoles(this.root),
			collectPrompts(this.root),
			collectApprovals(this.root),
			collectLessons(this.root),
		]);
		this.index = next;
		this.lastIndexedAt = new Date().toISOString();
		return next;
	}
}

let singleton: FactoryReadModel | null = null;

export function getFactoryReadModel(): FactoryReadModel {
	singleton ??= new FactoryReadModel();
	return singleton;
}
