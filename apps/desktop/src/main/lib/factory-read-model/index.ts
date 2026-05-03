import { existsSync, statSync, watch, type FSWatcher } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
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
	"projects",
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

export interface FactoryDocument {
	content: string;
	source_path: string;
	source_relative_path: string;
	modified_at: string | null;
	bytes: number;
	truncated: boolean;
}

export interface FactoryDocumentReference {
	title: string;
	source_path: string;
	source_relative_path: string;
	modified_at: string | null;
}

export interface PendingFactoryApproval {
	id: string;
	work_order_id: string;
	title: string;
	gate: string;
	run_id: string;
	run_relative_path: string;
	packet: FactoryDocument;
	evidence_files: FactoryDocumentReference[];
}

export interface ManualMockupSlot {
	id: string;
	title: string;
	purpose: string;
	prompt_path: string;
	png_path: string;
	evidence_path: string;
	comments_path: string;
	prompt_hash: string;
	prompt_content: string;
	complete: boolean;
	has_png: boolean;
	has_evidence: boolean;
	has_comments: boolean;
}

export interface ManualMockupManifest {
	run_id: string;
	work_order_id: string;
	source_path: string;
	source_relative_path: string;
	awaiting_packet_path: string | null;
	slots: ManualMockupSlot[];
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
	projects: [],
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

function isInsidePath(parent: string, candidate: string): boolean {
	const relative = path.relative(parent, candidate);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveInsideFactoryRoot(root: string, relativeOrAbsolutePath: string): string {
	const resolved = path.resolve(root, relativeOrAbsolutePath);
	if (!isInsidePath(root, resolved)) {
		throw new Error(`Factory path must stay inside repo: ${relativeOrAbsolutePath}`);
	}
	return resolved;
}

function resolveParentFoundationFallback(root: string, requestedPath: string): string | null {
	const requestedRelative = relativePath(root, requestedPath);
	const match = /^projects\/([^/]+)\/([^/]+)\/foundations\/([^/]+\.md)$/.exec(
		requestedRelative,
	);
	if (!match) return null;
	const [, topLevelProject, , fileName] = match;
	const fallbackPath = path.join(
		root,
		"projects",
		topLevelProject || "",
		"foundations",
		fileName || "",
	);
	return existsSync(fallbackPath) ? fallbackPath : null;
}

function resolveInsideRuns(root: string, relativeOrAbsolutePath: string): string {
	const runsRoot = path.join(root, "runs");
	const resolved = resolveInsideFactoryRoot(root, relativeOrAbsolutePath);
	if (!isInsidePath(runsRoot, resolved)) {
		throw new Error(`Factory write path must stay inside runs/: ${relativeOrAbsolutePath}`);
	}
	return resolved;
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

interface ProjectHierarchyNode {
	id: string;
	label?: string;
	node_type?: string;
	project_id?: string;
	parent_id?: string;
	status?: string;
	sort_order?: string;
	summary?: string;
	source_path?: string;
}

interface ProjectInfo {
	projectId: string;
	pipelinePath: string;
	modifiedAt: string | null;
	parsed: Record<string, string>;
	identityPath: string | null;
	identitySummary: string | null;
}

function parseProjectHierarchy(raw: string): ProjectHierarchyNode[] {
	const nodes: ProjectHierarchyNode[] = [];
	let current: ProjectHierarchyNode | null = null;

	for (const line of raw.split(/\r?\n/)) {
		const item = /^\s*-\s+id:\s*(.*)$/.exec(line);
		if (item) {
			current = { id: stripYamlScalar(item[1] || "") };
			if (current.id) nodes.push(current);
			continue;
		}

		const property = /^\s+([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
		if (!current || !property) continue;
		const [, key, value] = property;
		if (!key) continue;
		current[key as keyof ProjectHierarchyNode] = stripYamlScalar(value || "");
	}

	return nodes.filter((node) => node.id);
}

function getHierarchyPath(
	node: ProjectHierarchyNode,
	byId: Map<string, ProjectHierarchyNode>,
	visiting = new Set<string>(),
): string[] {
	if (visiting.has(node.id)) return [node.id];
	visiting.add(node.id);
	const parentId = node.parent_id || "";
	if (!parentId) return [node.id];
	const parent = byId.get(parentId);
	if (!parent) return [node.id];
	return [...getHierarchyPath(parent, byId, visiting), node.id];
}

async function readProjectInfo(
	root: string,
	pipelinePath: string,
	projectIdFallback: string,
): Promise<ProjectInfo | null> {
	if (!existsSync(pipelinePath)) return null;
	const modifiedAt = await fileModifiedAt(pipelinePath);
	const raw = await readTextFile(pipelinePath);
	const parsed = parseShallowYaml(raw);
	const projectId = parsed.project_id || projectIdFallback;
	const projectRoot = path.join(root, "projects", ...projectId.split("/"));
	const foundationIdentity = path.join(projectRoot, "foundations", "identity.md");
	const rootIdentity = path.join(projectRoot, "identity.md");
	const identityPath = existsSync(foundationIdentity)
		? foundationIdentity
		: existsSync(rootIdentity)
			? rootIdentity
			: null;
	let identitySummary: string | null = null;
	if (identityPath) {
		try {
			identitySummary = firstMarkdownParagraph(await readTextFile(identityPath));
		} catch {
			identitySummary = null;
		}
	}
	return {
		projectId,
		pipelinePath,
		modifiedAt,
		parsed,
		identityPath,
		identitySummary,
	};
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

function parsePipelineYuriyGateCounts(raw: string): Map<string, number> {
	const counts = new Map<string, number>();
	let currentVariant: string | null = null;
	let inYuriyGates = false;

	for (const line of raw.split(/\r?\n/)) {
		const variant = /^\s*-\s+id:\s*(.*)$/.exec(line);
		if (variant) {
			currentVariant = stripYamlScalar(variant[1] || "");
			inYuriyGates = false;
			continue;
		}

		if (!currentVariant) continue;

		const gates = /^\s{4}yuriy_gates:\s*(.*)$/.exec(line);
		if (gates) {
			const value = (gates[1] || "").trim();
			if (value.startsWith("[") && value.endsWith("]")) {
				const items = value
					.slice(1, -1)
					.split(",")
					.map((item) => stripYamlScalar(item))
					.filter(Boolean);
				counts.set(currentVariant, items.length);
				inYuriyGates = false;
			} else {
				counts.set(currentVariant, 0);
				inYuriyGates = true;
			}
			continue;
		}

		if (inYuriyGates) {
			const item = /^\s{6,}-\s+(.+)$/.exec(line);
			if (item) {
				counts.set(currentVariant, (counts.get(currentVariant) || 0) + 1);
				continue;
			}
			if (/^\s{4}[A-Za-z0-9_-]+:\s*/.test(line)) {
				inYuriyGates = false;
			}
		}
	}

	return counts;
}

function workOrderGateState(input: {
	status?: string | null;
	pipelineVariant?: string | null;
	gateCounts: Map<string, number>;
}): "Yuriy gate required" | "AUDIT-only" | "shipped" {
	const status = (input.status || "").toLowerCase();
	if (
		status === "shipped" ||
		status === "complete" ||
		status === "completed" ||
		status === "done"
	) {
		return "shipped";
	}
	const gateCount = input.pipelineVariant
		? input.gateCounts.get(input.pipelineVariant)
		: undefined;
	return gateCount && gateCount > 0 ? "Yuriy gate required" : "AUDIT-only";
}

async function parseWorkOrderRow(
	root: string,
	filePath: string,
	fallbackId: string,
	gateCounts: Map<string, number>,
): Promise<FactoryRow> {
	const row = await parseYamlRow(root, filePath, fallbackId);
	let originatingRole: string | null = null;
	try {
		const raw = await readTextFile(filePath);
		originatingRole =
			raw.match(/^\s*-\s+role:\s*([A-Za-z0-9_/-]+)/m)?.[1] ||
			raw.match(/^role:\s*([A-Za-z0-9_/-]+)/m)?.[1] ||
			null;
	} catch {
		originatingRole = null;
	}
	const pipelineVariant =
		typeof row.data.pipeline_variant === "string" ? row.data.pipeline_variant : null;
	const yuriyGateCount = pipelineVariant ? gateCounts.get(pipelineVariant) : undefined;
	row.data = {
		...row.data,
		gate_state: workOrderGateState({
			status: row.status,
			pipelineVariant,
			gateCounts,
		}),
		yuriy_gate_count: yuriyGateCount ?? 0,
		pipeline_variant_known: pipelineVariant ? gateCounts.has(pipelineVariant) : false,
		originating_role: originatingRole,
	};
	return row;
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

function firstMarkdownParagraph(raw: string): string {
	const lines = raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(
			(line) =>
				line &&
				!line.startsWith("#") &&
				!line.toLowerCase().startsWith("status:"),
		);
	return lines[0] || "";
}

async function parseDecisionMarkdownRow(
	root: string,
	filePath: string,
	fallbackId: string,
): Promise<FactoryRow> {
	const modifiedAt = await fileModifiedAt(filePath);
	try {
		const raw = await readTextFile(filePath);
		const status = raw.match(/^Status:\s*(.+)$/im)?.[1]?.trim() || "accepted";
		const projectMatch = normalizeSlashes(filePath).match(/\/projects\/([^/]+)\//);
		return createRow({
			root,
			filePath,
			id: fallbackId,
			title: parseMarkdownTitle(raw, fallbackId),
			status,
			modifiedAt,
			data: {
				project_id: projectMatch?.[1] || "shared",
				summary: firstMarkdownParagraph(raw) || null,
				source_type: "decision_file",
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
	const pipelinePath = path.join(root, "projects", "software-factory", "project-pipeline.yml");
	const gateCounts = existsSync(pipelinePath)
		? parsePipelineYuriyGateCounts(await readTextFile(pipelinePath))
		: new Map<string, number>();
	return Promise.all(
		files.map((filePath) =>
			parseWorkOrderRow(
				root,
				filePath,
				path.basename(filePath, path.extname(filePath)),
				gateCounts,
			),
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

function isWorktreeRelativePath(relative: string): boolean {
	const normalized = normalizeSlashes(relative);
	return normalized.includes("/worktree/") || normalized.includes("-worktree/");
}

function deriveRunDir(root: string, filePath: string): string {
	const relative = relativePath(root, filePath);
	const parts = relative.split("/");
	if (parts[0] === "runs" && parts[1]) {
		return path.join(root, "runs", parts[1]);
	}
	return path.dirname(filePath);
}

function deriveGateName(awaitingPath: string): string {
	let name = path.basename(awaitingPath, path.extname(awaitingPath)).toLowerCase();
	name = name
		.replace(/^awaiting-yuriy-review-?/, "")
		.replace(/^awaiting-review-?/, "")
		.replace(/^awaiting-?/, "");
	const normalized = name
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized || "approval";
}

function approvalFileExistsForGate(runDir: string, gate: string): boolean {
	const safeGate = gate.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
	const candidates = [
		`approval-${safeGate}.yml`,
		`approval-${safeGate}.yaml`,
	];
	if (safeGate === "approval") {
		candidates.push("approval.yml", "approval.yaml");
	}
	return candidates.some((candidate) => existsSync(path.join(runDir, candidate)));
}

function titleFromAwaitingName(filePath: string): string {
	const gate = deriveGateName(filePath);
	return gate
		.split("-")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function yamlBlock(value: string): string {
	const text = value.trimEnd();
	if (!text) return "''";
	return `|-\n${text
		.split(/\r?\n/)
		.map((line) => `  ${line}`)
		.join("\n")}`;
}

function isPngBuffer(buffer: Buffer): boolean {
	return (
		buffer.length >= 8 &&
		buffer[0] === 0x89 &&
		buffer[1] === 0x50 &&
		buffer[2] === 0x4e &&
		buffer[3] === 0x47 &&
		buffer[4] === 0x0d &&
		buffer[5] === 0x0a &&
		buffer[6] === 0x1a &&
		buffer[7] === 0x0a
	);
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
	const decisionFiles = await Promise.all(
		files.map((filePath) =>
			parseDecisionMarkdownRow(
				root,
				filePath,
				relativePath(root, filePath).replace(/\.md$/, ""),
			),
		),
	);
	const proposalRows = await collectDecisionProposals(root);
	return [...decisionFiles, ...proposalRows];
}

async function collectDecisionProposals(root: string): Promise<FactoryRow[]> {
	const files = await walkFiles(root, "work-orders", [".yml", ".yaml"]);
	const rows: FactoryRow[] = [];
	for (const filePath of files) {
		const raw = await readTextFile(filePath);
		if (!raw.includes("decisions_proposed")) continue;
		const parsed = parseShallowYaml(raw);
		const modifiedAt = await fileModifiedAt(filePath);
		const workOrderId = parsed.id || path.basename(filePath, path.extname(filePath));
		const decisionBlocks = raw.split(/\n\s*-\s+id:\s*/).slice(1);
		for (const block of decisionBlocks) {
			const id = block.split(/\r?\n/, 1)[0]?.trim();
			if (!id || !block.includes("summary:")) continue;
			const summary = block.match(/^\s*summary:\s*(.+)$/m)?.[1]?.trim() || "";
			rows.push(
				createRow({
					root,
					filePath,
					id,
					title: id,
					status: "proposed",
					modifiedAt,
					data: {
						project_id: parsed.project_id || "shared",
						work_order_id: workOrderId,
						summary,
						source_type: "work_order_decision_contract",
					},
				}),
			);
		}
	}
	return rows;
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
					purpose: parsed.purpose || null,
					what_it_owns: parsed.what_it_owns || null,
					must_verify: parsed.must_verify || null,
					sends_back_when: parsed.sends_back_when || null,
					escalates_when: parsed.escalates_when || null,
					activation_contexts: parsed.activation_contexts || null,
					allowed_tools: parsed.allowed_tools || null,
					prompt_path:
						parsed.prompt_path ||
						(existsSync(
							path.join(
								root,
								"templates",
								"role-prompts",
								`${stripYamlScalar(id)}.md`,
							),
						)
							? `templates/role-prompts/${stripYamlScalar(id)}.md`
							: null),
				},
			}),
		);
	}
	return rows;
}

async function collectProjects(root: string): Promise<FactoryRow[]> {
	const projectsRoot = path.join(root, "projects");
	if (!existsSync(projectsRoot)) return [];
	const projectInfos = new Map<string, ProjectInfo>();
	const pipelinePaths = (await walkFiles(root, "projects", [".yml", ".yaml"]))
		.filter((filePath) => filePath.replace(/\\/g, "/").endsWith("/project-pipeline.yml"));
	for (const pipelinePath of pipelinePaths) {
		const projectDir = path.dirname(pipelinePath);
		const fallbackProjectId = relativePath(root, projectDir).replace(
			/^projects\//,
			"",
		);
		if (!fallbackProjectId || fallbackProjectId.startsWith("_shared")) continue;
		const projectInfo = await readProjectInfo(root, pipelinePath, fallbackProjectId);
		if (projectInfo) projectInfos.set(projectInfo.projectId, projectInfo);
	}

	const hierarchyPath = path.join(projectsRoot, "project-hierarchy.yml");
	const hierarchyNodes = existsSync(hierarchyPath)
		? parseProjectHierarchy(await readTextFile(hierarchyPath))
		: [];
	const hierarchyById = new Map(hierarchyNodes.map((node) => [node.id, node]));
	const hierarchyByProjectId = new Map(
		hierarchyNodes
			.filter((node) => node.project_id)
			.map((node) => [node.project_id || "", node]),
	);
	const rows: FactoryRow[] = [];
	const usedProjectIds = new Set<string>();

	for (const node of hierarchyNodes) {
		const projectInfo =
			(node.project_id ? projectInfos.get(node.project_id) : undefined) ||
			(node.source_path
				? await readProjectInfo(
						root,
						path.join(root, node.source_path),
						node.project_id || node.id,
					)
				: null) ||
			undefined;
		const hierarchyParts = getHierarchyPath(node, hierarchyById);
		const sourcePath = projectInfo
			? projectInfo.pipelinePath
			: node.source_path
				? path.join(root, node.source_path)
				: hierarchyPath;
		const filePath = existsSync(sourcePath) ? sourcePath : hierarchyPath;
		if (projectInfo?.projectId) usedProjectIds.add(projectInfo.projectId);

		rows.push(
			createRow({
				root,
				filePath,
				id: node.id,
				title: node.label || projectInfo?.parsed.name || node.id,
				status: node.status || projectInfo?.parsed.status || "active",
				modifiedAt: projectInfo?.modifiedAt || (await fileModifiedAt(filePath)),
				data: {
					project_id: projectInfo?.projectId || node.project_id || null,
					primary_owner: projectInfo?.parsed.primary_owner || null,
					identity_summary: projectInfo?.identitySummary || node.summary || null,
					identity_path: projectInfo?.identityPath
						? relativePath(root, projectInfo.identityPath)
						: null,
					node_type: node.node_type || projectInfo?.parsed.hierarchy_node_type || "project",
					parent_id: node.parent_id || null,
					tree_depth: Math.max(0, hierarchyParts.length - 1),
					tree_path: hierarchyParts.join("/"),
					display_order: Number(node.sort_order || "1000"),
					summary: node.summary || null,
					hierarchy_source_path: relativePath(root, hierarchyPath),
					hierarchy_mode: "canonical",
				},
			}),
		);
	}

	for (const projectInfo of projectInfos.values()) {
		if (usedProjectIds.has(projectInfo.projectId)) continue;
		const node = hierarchyByProjectId.get(projectInfo.projectId);
		const parentId = projectInfo.parsed.hierarchy_parent_id || node?.parent_id || "";
		rows.push(
			createRow({
				root,
				filePath: projectInfo.pipelinePath,
				id: projectInfo.parsed.hierarchy_node_id || projectInfo.projectId,
				title: projectInfo.parsed.name || projectInfo.projectId,
				status: projectInfo.parsed.status || "active",
				modifiedAt: projectInfo.modifiedAt,
				data: {
					project_id: projectInfo.projectId,
					primary_owner: projectInfo.parsed.primary_owner || null,
					identity_summary: projectInfo.identitySummary,
					identity_path: projectInfo.identityPath
						? relativePath(root, projectInfo.identityPath)
						: null,
					node_type: projectInfo.parsed.hierarchy_node_type || "project",
					parent_id: parentId || null,
					tree_depth: projectInfo.parsed.hierarchy_tree_path
						? projectInfo.parsed.hierarchy_tree_path.split("/").length - 1
						: 0,
					tree_path:
						projectInfo.parsed.hierarchy_tree_path ||
						projectInfo.parsed.hierarchy_node_id ||
						projectInfo.projectId,
					display_order: Number(
						projectInfo.parsed.hierarchy_display_order || "1000",
					),
					summary: null,
					hierarchy_source_path: existsSync(hierarchyPath)
						? relativePath(root, hierarchyPath)
						: null,
					hierarchy_mode: existsSync(hierarchyPath)
						? "canonical_unlisted_project"
						: "pipeline_fallback",
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

	async readDocument(
		relativeOrAbsolutePath: string,
		maxBytes = 750_000,
	): Promise<FactoryDocument> {
		let filePath = resolveInsideFactoryRoot(this.root, relativeOrAbsolutePath);
		if (!existsSync(filePath)) {
			filePath = resolveParentFoundationFallback(this.root, filePath) || filePath;
		}
		const modifiedAt = await fileModifiedAt(filePath);
		const buffer = await readFile(filePath);
		const truncated = buffer.length > maxBytes;
		const content = buffer.subarray(0, maxBytes).toString("utf8");
		return {
			content,
			source_path: filePath,
			source_relative_path: relativePath(this.root, filePath),
			modified_at: modifiedAt,
			bytes: buffer.length,
			truncated,
		};
	}

	async listPendingApprovals(): Promise<PendingFactoryApproval[]> {
		const files = (await walkFiles(this.root, "runs", [".md"]))
			.filter((filePath) => path.basename(filePath).startsWith("awaiting"))
			.filter((filePath) => path.basename(filePath) !== "awaiting-manual-mockups.md")
			.filter((filePath) => !isWorktreeRelativePath(relativePath(this.root, filePath)));
		const rows: PendingFactoryApproval[] = [];
		for (const filePath of files.sort()) {
			const runDir = deriveRunDir(this.root, filePath);
			const gate = deriveGateName(filePath);
			if (approvalFileExistsForGate(runDir, gate)) continue;
			const packet = await this.readDocument(filePath);
			const evidenceFiles = await this.listRunEvidenceFiles(runDir);
			const runRelativePath = relativePath(this.root, runDir);
			const runId = runRelativePath.split("/").slice(-1)[0] || path.basename(runDir);
			const matchingWorkOrder = (await this.getDataset("runs")).find(
				(row) => row.id === runRelativePath,
			);
			const workOrderId =
				typeof matchingWorkOrder?.data.work_order_id === "string"
					? matchingWorkOrder.data.work_order_id
					: runId;
			rows.push({
				id: `${runRelativePath}:${gate}`,
				work_order_id: workOrderId,
				title: titleFromAwaitingName(filePath),
				gate,
				run_id: runId,
				run_relative_path: runRelativePath,
				packet,
				evidence_files: evidenceFiles,
			});
		}
		return rows;
	}

	async writeApproval({
		runRelativePath,
		gate,
		status,
		notes,
		approvedBy = "Yuriy",
	}: {
		runRelativePath: string;
		gate: string;
		status: "approved" | "revision_requested";
		notes: string;
		approvedBy?: string;
	}): Promise<FactoryDocumentReference> {
		const safeGate =
			gate.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") ||
			"approval";
		const runDir = resolveInsideRuns(this.root, runRelativePath);
		await mkdir(runDir, { recursive: true });
		const filePath = path.join(runDir, `approval-${safeGate}.yml`);
		const createdAt = new Date().toISOString();
		const content = [
			`status: ${status}`,
			`approved_by: ${approvedBy}`,
			`gate: ${safeGate}`,
			"source: superset-cockpit",
			`created_at: ${createdAt}`,
			`notes: ${yamlBlock(notes)}`,
			"",
		].join("\n");
		await writeFile(filePath, content, "utf8");
		await this.refresh();
		return {
			title: path.basename(filePath),
			source_path: filePath,
			source_relative_path: relativePath(this.root, filePath),
			modified_at: await fileModifiedAt(filePath),
		};
	}

	async listRunEvidence(runRelativePath: string): Promise<FactoryDocumentReference[]> {
		const runDir = resolveInsideRuns(this.root, runRelativePath);
		return this.listRunEvidenceFiles(runDir);
	}

	async listManualMockupManifests(
		workOrderId?: string,
	): Promise<ManualMockupManifest[]> {
		const files = (await walkFiles(this.root, "runs", [".json"]))
			.filter((filePath) => path.basename(filePath) === "manual-mockup-manifest.json")
			.filter((filePath) => !isWorktreeRelativePath(relativePath(this.root, filePath)));
		const manifests: ManualMockupManifest[] = [];
		for (const filePath of files.sort()) {
			try {
				const raw = await readTextFile(filePath);
				const parsed = JSON.parse(raw);
				const runId = String(parsed.run_id || path.basename(path.dirname(path.dirname(filePath))));
				const manifestWorkOrderId = String(parsed.work_order_id || runId);
				if (workOrderId && manifestWorkOrderId !== workOrderId && runId !== workOrderId) {
					continue;
				}
				const views = Array.isArray(parsed.views) ? parsed.views : [];
				const slots: ManualMockupSlot[] = [];
				for (const view of views) {
					const id = String(view.id || "");
					if (!id) continue;
					const promptPath = String(view.prompt_path || "");
					const pngPath = String(view.png_path || `runs/${runId}/mockups/${id}.png`);
					const evidencePath = String(
						view.evidence_path || `runs/${runId}/mockups/${id}-evidence.json`,
					);
					const commentsPath = String(
						view.comments_path || `runs/${runId}/mockups/${id}-comments.md`,
					);
					const promptFile = promptPath ? resolveInsideFactoryRoot(this.root, promptPath) : "";
					const promptContent =
						promptFile && existsSync(promptFile) ? await readTextFile(promptFile) : "";
					const hasPng = existsSync(resolveInsideFactoryRoot(this.root, pngPath));
					const hasEvidence = existsSync(resolveInsideFactoryRoot(this.root, evidencePath));
					const hasComments = existsSync(resolveInsideFactoryRoot(this.root, commentsPath));
					slots.push({
						id,
						title: String(view.title || id),
						purpose: String(view.purpose || ""),
						prompt_path: promptPath,
						png_path: pngPath,
						evidence_path: evidencePath,
						comments_path: commentsPath,
						prompt_hash: String(view.prompt_hash || ""),
						prompt_content: promptContent,
						complete: hasPng && hasEvidence && hasComments,
						has_png: hasPng,
						has_evidence: hasEvidence,
						has_comments: hasComments,
					});
				}
				const mockupDir = path.dirname(filePath);
				const awaitingPath = path.join(mockupDir, "awaiting-manual-mockups.md");
				manifests.push({
					run_id: runId,
					work_order_id: manifestWorkOrderId,
					source_path: filePath,
					source_relative_path: relativePath(this.root, filePath),
					awaiting_packet_path: existsSync(awaitingPath)
						? relativePath(this.root, awaitingPath)
						: null,
					slots,
				});
			} catch {
				continue;
			}
		}
		return manifests;
	}

	async saveManualMockupAttachment({
		runId,
		viewId,
		pngBase64,
		fileName,
		comments,
		sourceText,
	}: {
		runId: string;
		viewId: string;
		pngBase64: string;
		fileName: string;
		comments: string;
		sourceText?: string;
	}): Promise<ManualMockupSlot> {
		const manifests = await this.listManualMockupManifests();
		const manifest = manifests.find((candidate) => candidate.run_id === runId);
		if (!manifest) throw new Error(`No manual mockup manifest found for ${runId}.`);
		const slot = manifest.slots.find((candidate) => candidate.id === viewId);
		if (!slot) throw new Error(`No manual mockup slot found for ${runId}/${viewId}.`);
		const pngBuffer = Buffer.from(pngBase64, "base64");
		if (!isPngBuffer(pngBuffer)) {
			throw new Error("Attachment must be a valid PNG.");
		}
		const pngPath = resolveInsideRuns(this.root, slot.png_path);
		const commentsPath = resolveInsideRuns(this.root, slot.comments_path);
		const evidencePath = resolveInsideRuns(this.root, slot.evidence_path);
		await mkdir(path.dirname(pngPath), { recursive: true });
		await writeFile(pngPath, pngBuffer);
		await writeFile(commentsPath, `${comments.trimEnd()}\n`, "utf8");
		await writeFile(
			evidencePath,
			`${JSON.stringify(
				{
					model: "gpt-image-2",
					session_id: "manual-cockpit-attachment",
					timestamp: new Date().toISOString(),
					prompt_hash: slot.prompt_hash,
					source_text:
						sourceText?.trim() ||
						comments.trim() ||
						"Uploaded through the Software Factory cockpit AttachmentSurface.",
					manual_mode: true,
					uploaded_filename: fileName,
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
		await this.refresh();
		return {
			...slot,
			complete: true,
			has_png: true,
			has_evidence: true,
			has_comments: true,
		};
	}

	private async listRunEvidenceFiles(
		runDir: string,
	): Promise<FactoryDocumentReference[]> {
		const runRelative = relativePath(this.root, runDir);
		const files = (await walkFiles(this.root, runRelative, [
			".md",
			".json",
			".jsonl",
			".yml",
			".yaml",
			".png",
		]))
			.filter((filePath) => !isWorktreeRelativePath(relativePath(this.root, filePath)))
			.filter((filePath) => {
				const name = path.basename(filePath);
				return !name.startsWith("awaiting") && !name.startsWith("approval");
			})
			.slice(0, 80);
		return Promise.all(
			files.map(async (filePath) => ({
				title: relativePath(runDir, filePath) || path.basename(filePath),
				source_path: filePath,
				source_relative_path: relativePath(this.root, filePath),
				modified_at: await fileModifiedAt(filePath),
			})),
		);
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
			next.projects,
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
			collectProjects(this.root),
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
