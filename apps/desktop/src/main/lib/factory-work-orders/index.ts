import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
	invokeFactoryCliRole,
	type FactoryCliProvider,
} from "main/lib/factory-cli";
import {
	buildProjectLaunchWorkOrderPrompt,
	buildWorkOrderDraftPrompt,
	type WorkOrderComposerReference,
} from "main/lib/factory-cli/intake-prompts";
import { getFactoryReadModel } from "main/lib/factory-read-model";
import {
	getFactoryRunnerBridge,
	type FactoryRunnerBridgeEvent,
	type FactoryRunnerCapacity,
	type FactoryRunnerControlResult,
	type FactoryRunnerLaunchResult,
} from "main/lib/factory-runner-bridge";
import type {
	AuthorAttribution,
	DependencyEdge,
	DependencyGraph,
	PipelineStage,
	RunStateEvent,
	StageRecord,
	WorkOrderListItem,
	WorkOrderRunState,
	WorkOrderStatus,
} from "lib/types/factory-operator-console";

type WorkOrderScope = WorkOrderListItem["scope"];

export interface WorkOrderListFilters {
	projectId?: string;
	scope?: WorkOrderScope | "all";
	state?: WorkOrderRunState | "all";
	assignedToMe?: boolean;
	search?: string;
	historyLimit?: number;
}

export interface WorkOrderProgress {
	currentStage: string;
	currentStageIndex: number;
	totalStages: number;
	elapsedMs: number | null;
	startedAt: string | null;
}

export interface WorkOrderListItemView extends WorkOrderListItem {
	sourceRelativePath: string;
	pipelineVariant: string | null;
	gateState: string | null;
	runCount: number;
	latestRunId: string | null;
	latestRunStatus: string | null;
	progress: WorkOrderProgress | null;
	dependencyEdges: DependencyEdge[];
	dialogueAttentionCount: number;
	canRun: boolean;
	createdAt: string | null;
	durationMs: number | null;
}

export interface FilterOption {
	value: string;
	label: string;
	count: number;
}

export interface FilteredWorkOrderList {
	generatedAt: string;
	filters: Required<Omit<WorkOrderListFilters, "historyLimit">> & {
		historyLimit: number;
	};
	activeProjectOwner: string;
	projectOptions: FilterOption[];
	scopeOptions: FilterOption[];
	stateOptions: FilterOption[];
	sections: {
		inFlight: WorkOrderListItemView[];
		queued: WorkOrderListItemView[];
		history: WorkOrderListItemView[];
		historyTotal: number;
		historyLimit: number;
		historyHasMore: boolean;
	};
	dependencyGraph: DependencyGraph;
	carryForwardKnownGaps: string[];
}

export type GateDecision = "approved" | "revision_requested" | "escalated";

export interface GateDecisionActor {
	user: string;
	role?: string;
	isAgent?: boolean;
	displayName: string;
}

export interface GateResponseWriteInput {
	runRelativePath: string;
	gate: string;
	gateId?: string;
	decision: GateDecision;
	notes: string;
	decidedBy?: GateDecisionActor;
	awaitingPacketPath?: string;
	expectedPacketModifiedAt?: string | null;
}

export interface MergeWorkOrderInput {
	workOrderId: string;
	branchName?: string;
	dryRun?: boolean;
}

export interface MergeWorkOrderResult {
	workOrderId: string;
	branchName: string;
	commands: Array<{
		command: string;
		status: "pass" | "fail" | "skip";
		output: string;
	}>;
	merged: boolean;
	workOrderStatusUpdated: boolean;
}

export type ActiveRunStageNodeState =
	| "completed"
	| "current"
	| "upcoming"
	| "failed"
	| "gated";

export interface ActiveRunStageNode {
	id: string;
	stageId: string;
	label: string;
	role: string;
	state: ActiveRunStageNodeState;
	stageIndex: number;
	summary: string | null;
	outputPath: string | null;
	promptPath: string | null;
	receiptPath: string | null;
	startedAt: string | null;
	completedAt: string | null;
}

export interface ActiveProjectTreeNode {
	id: string;
	label: string;
	nodeType: string;
	projectId: string | null;
	parentId: string | null;
	status: string;
	summary: string | null;
	sortOrder: number;
	sourcePath: string | null;
}

export interface ActiveRunNode {
	id: string;
	runId: string;
	runRelativePath: string;
	workOrderId: string;
	title: string;
	projectId: string;
	state: WorkOrderRunState;
	status: string | null;
	pipelineVariant: string | null;
	triggeredBy: AuthorAttribution;
	executedBy: AuthorAttribution;
	lastActivityAt: string | null;
	startedAt: string | null;
	staleStateNotice: {
		surface: string;
		changedAt: string;
		changedBy: AuthorAttribution;
		changeSummary: string;
		sourcePath: string;
	} | null;
	stages: ActiveRunStageNode[];
}

export interface ActiveRunsSnapshot {
	generatedAt: string;
	projectId: string;
	activeProjectOwner: string;
	runs: ActiveRunNode[];
	projectTree: ActiveProjectTreeNode[];
	carryForwardKnownGaps: string[];
}

export type ActiveRunsStreamEvent =
	| {
			kind: "snapshot";
			snapshot: ActiveRunsSnapshot;
	  }
	| {
			kind: "run_state";
			event: RunStateEvent;
			snapshot: ActiveRunsSnapshot;
	  };

export interface WorkOrderRunHistoryItem {
	runId: string;
	runRelativePath: string;
	status: string | null;
	startedAt: string | null;
	completedAt: string | null;
	modifiedAt: string | null;
	currentStage: string | null;
	currentStageIndex: number;
	totalStages: number;
	hasOpenGate: boolean;
}

export interface WorkOrderDetailView {
	generatedAt: string;
	item: WorkOrderListItemView;
	sourceRelativePath: string;
	raw: string;
	parsed: Record<string, string>;
	pipelineStages: PipelineStage[];
	runHistory: WorkOrderRunHistoryItem[];
	activeRun: ActiveRunNode | null;
	capacity: FactoryRunnerCapacity;
	carryForwardKnownGaps: string[];
}

export type WorkOrderRunStreamEvent =
	| {
			kind: "snapshot";
			detail: WorkOrderDetailView;
	  }
	| {
			kind: "run_state";
			event: RunStateEvent;
			detail: WorkOrderDetailView;
	  }
	| {
			kind: "runner_log";
			runId: string;
			stream: "stdout" | "stderr";
			line: string;
	  }
	| {
			kind: "capacity_changed";
			capacity: FactoryRunnerCapacity;
	  };

export type WorkOrderComposerMode = "single" | "project-launch";
export type WorkOrderComposerProvider = FactoryCliProvider | "dry-run";

export interface WorkOrderComposerActor {
	user: string;
	displayName: string;
	role?: string;
	isAgent?: boolean;
}

export interface WorkOrderComposerRequest {
	mode: WorkOrderComposerMode;
	intent: string;
	projectId: string;
	references: WorkOrderComposerReference[];
	author: WorkOrderComposerActor;
	assignedTo?: WorkOrderComposerActor;
	operatorMessage?: string;
	priorDraft?: WorkOrderDraftProposal;
	provider?: WorkOrderComposerProvider;
}

export interface WorkOrderDraftItem {
	id: string;
	title: string;
	intent: string;
	projectId: string;
	pipelineVariant: string;
	rigorTier: "T1" | "T2" | "T3";
	riskClassification: "low" | "medium" | "high";
	dependsOn: string[];
	acceptanceCriteria: string[];
	verificationCommands: string[];
	yaml: string;
}

export interface WorkOrderDraftProposal {
	draftId: string;
	mode: WorkOrderComposerMode;
	projectId: string;
	author: WorkOrderComposerActor;
	assignedTo: WorkOrderComposerActor;
	references: WorkOrderComposerReference[];
	stewardTurn: string;
	cliProvider: WorkOrderComposerProvider;
	cliInvoked: boolean;
	cliFallbackReason?: string;
	createdAt: string;
	workOrders: WorkOrderDraftItem[];
	cohorts: string[][];
}

export interface SaveWorkOrderDraftInput {
	proposal: WorkOrderDraftProposal;
	selectedIds?: string[];
}

export interface SaveWorkOrderDraftResult {
	saved: Array<{
		id: string;
		path: string;
		title: string;
	}>;
	skipped: string[];
}

interface ParsedWorkOrder {
	id: string;
	title: string;
	statusRaw: string;
	projectId: string;
	author: string;
	assignedTo: string;
	rigorTier: 1 | 2 | 3;
	riskClassification: "low" | "medium" | "high";
	pipelineVariant: string | null;
	dependsOn: string[];
	sourceRelativePath: string;
	modifiedAt: string | null;
	createdAt: string | null;
	rawSearchText: string;
	scope: WorkOrderScope;
	gateState: string | null;
}

interface RunSummary {
	runId: string;
	workOrderId: string;
	status: string | null;
	startedAt: string | null;
	completedAt: string | null;
	modifiedAt: string | null;
	currentStage: string | null;
	currentStageIndex: number;
	totalStages: number;
	hasOpenGate: boolean;
}

const WORK_ORDER_STATES: WorkOrderRunState[] = [
	"queued",
	"ready",
	"blocked",
	"running",
	"awaiting_approval",
	"completed",
	"failed",
	"canceled",
];

const WORK_ORDER_SCOPES: WorkOrderScope[] = [
	"infrastructure",
	"product",
	"brand",
	"docs",
	"cleanup",
	"dashboard",
	"other",
];

const TERMINAL_STATES = new Set<WorkOrderRunState>([
	"completed",
	"failed",
	"canceled",
]);

const GENERATED_RUN_DIR_NAMES = new Set([
	".git",
	".turbo",
	"dist",
	"dist-electron",
	"launcher-runs",
	"manual-home",
	"node_modules",
	"release",
	"superset-home",
	"user-data",
	"worktree",
]);

function shouldSkipGeneratedRunDir(name: string): boolean {
	return (
		GENERATED_RUN_DIR_NAMES.has(name) ||
		name.endsWith("-worktree") ||
		name.startsWith("superset-home-") ||
		name.startsWith("manual-home-")
	);
}

function normalizeSlashes(value: string): string {
	return value.replace(/\\/g, "/");
}

function relativePath(root: string, filePath: string): string {
	return normalizeSlashes(path.relative(root, filePath));
}

function isInsidePath(parent: string, candidate: string): boolean {
	const relative = path.relative(parent, candidate);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveFactoryPath(root: string, relativeOrAbsolutePath: string): string {
	const resolved = path.resolve(root, relativeOrAbsolutePath);
	if (!isInsidePath(root, resolved)) {
		throw new Error(`Factory path must stay inside repo: ${relativeOrAbsolutePath}`);
	}
	return resolved;
}

function resolveRunPath(root: string, relativeOrAbsolutePath: string): string {
	const resolved = resolveFactoryPath(root, relativeOrAbsolutePath);
	const runsRoot = path.join(root, "runs");
	if (!isInsidePath(runsRoot, resolved)) {
		throw new Error(`Factory write path must stay inside runs/: ${relativeOrAbsolutePath}`);
	}
	return resolved;
}

function safeSlug(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "approval";
}

function yamlBlock(value: string): string {
	const text = value.trimEnd();
	if (!text) return "''";
	return `|-\n${text
		.split(/\r?\n/)
		.map((line) => `  ${line}`)
		.join("\n")}`;
}

function yamlScalar(value: string): string {
	const text = value.trim();
	if (!text) return "''";
	if (/^[A-Za-z0-9_.\/:-]+$/.test(text)) return text;
	return JSON.stringify(text);
}

function yamlList(values: string[]): string[] {
	if (!values.length) return ["  []"];
	return values.map((value) => `  - ${yamlScalar(value)}`);
}

function titleFromIntent(intent: string, fallback: string): string {
	const firstLine = intent
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find(Boolean);
	if (!firstLine) return fallback;
	const clean = firstLine.replace(/^[-*#\d.\s]+/, "").trim();
	return clean.length > 82 ? `${clean.slice(0, 79).trim()}...` : clean;
}

function plainSummary(value: string, max = 260): string {
	const compact = value.replace(/\s+/g, " ").trim();
	if (!compact) return "Draft work order from composer intent.";
	return compact.length > max ? `${compact.slice(0, max - 3).trim()}...` : compact;
}

function safeWorkOrderFileName(id: string): string {
	return `${id.replace(/[^A-Za-z0-9_.-]+/g, "-")}.yml`;
}

function workOrderNumber(id: string): number | null {
	const match = /^WO-C(\d+)(?:[.-]|$)/i.exec(id.trim());
	if (!match?.[1]) return null;
	const parsed = Number.parseInt(match[1], 10);
	return Number.isFinite(parsed) ? parsed : null;
}

function actorForYaml(actor?: GateDecisionActor): string[] {
	const current = actor || {
		user: "Yuriy",
		displayName: "Yuriy",
		isAgent: false,
	};
	return [
		"decided_by:",
		`  user: ${current.user}`,
		current.role ? `  role: ${current.role}` : "  role: operator",
		`  is_agent: ${current.isAgent ? "true" : "false"}`,
		`  display_name: ${current.displayName}`,
	];
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
	await mkdir(path.dirname(filePath), { recursive: true });
	const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tmpPath, content, "utf8");
	await rename(tmpPath, filePath);
}

async function writeNewFile(filePath: string, content: string): Promise<void> {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, content, { encoding: "utf8", flag: "wx" });
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
		const scalar = stripYamlScalar(value || "");
		result[key] = scalar === ">" || scalar === "|" ? "" : scalar;
	}
	return result;
}

function parseYamlList(raw: string, key: string): string[] {
	const lines = raw.split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] || "";
		const match = new RegExp(`^${key}:\\s*(.*)$`).exec(line);
		if (!match) continue;
		const value = stripYamlScalar(match[1] || "");
		if (value.startsWith("[") && value.endsWith("]")) {
			return value
				.slice(1, -1)
				.split(",")
				.map((item) => stripYamlScalar(item))
				.filter(Boolean);
		}
		const items: string[] = [];
		for (let child = index + 1; child < lines.length; child += 1) {
			const childLine = lines[child] || "";
			if (/^[A-Za-z0-9_-]+:\s*/.test(childLine)) break;
			const item = /^\s*-\s*(.+)$/.exec(childLine);
			if (item) items.push(stripYamlScalar(item[1] || ""));
		}
		return items.filter(Boolean);
	}
	return [];
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
		if (shouldSkipGeneratedRunDir(entry.name)) continue;
		const entryRelative = path.join(relativeDir, entry.name);
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

async function walkRunJsonFiles(
	root: string,
	relativeDir = "runs",
	depth = 0,
): Promise<string[]> {
	if (depth > 4) return [];
	const absoluteDir = path.join(root, relativeDir);
	if (!existsSync(absoluteDir)) return [];
	const entries = await readdir(absoluteDir, { withFileTypes: true }).catch(() => []);
	const files: string[] = [];
	for (const entry of entries) {
		if (shouldSkipGeneratedRunDir(entry.name)) continue;
		const entryRelative = path.join(relativeDir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walkRunJsonFiles(root, entryRelative, depth + 1)));
		} else if (entry.isFile() && entry.name === "run.json") {
			files.push(path.join(root, entryRelative));
		}
	}
	return files;
}

async function fileModifiedAt(filePath: string): Promise<string | null> {
	try {
		return (await stat(filePath)).mtime.toISOString();
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringField(
	record: Record<string, unknown>,
	keys: string[],
): string | null {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value;
		if (typeof value === "number" && Number.isFinite(value)) return String(value);
	}
	return null;
}

function numberField(
	record: Record<string, unknown>,
	keys: string[],
): number | null {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "number" && Number.isFinite(value)) return value;
		const parsed = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function normalizeOutputPath(value: string | null): string | null {
	if (!value) return null;
	return normalizeSlashes(value);
}

function activeRunAttribution(
	value: unknown,
	fallbackName: string,
	role?: string,
): AuthorAttribution {
	if (typeof value === "string") return authorAttribution(value, role);
	if (isRecord(value)) {
		const user = stringField(value, ["user", "name", "displayName", "display_name"]);
		const actorRole = stringField(value, ["role"]) || role;
		return {
			user: user || fallbackName,
			role: actorRole || undefined,
			isAgent:
				typeof value.isAgent === "boolean"
					? value.isAgent
					: typeof value.is_agent === "boolean"
						? value.is_agent
						: Boolean(actorRole && actorRole !== "operator"),
			displayName:
				stringField(value, ["displayName", "display_name", "name", "user"]) ||
				user ||
				fallbackName,
		};
	}
	return authorAttribution(fallbackName, role);
}

function stageStatus(value: string | null): "completed" | "running" | "pending" | "failed" | "canceled" {
	const normalized = (value || "").toLowerCase();
	if (
		normalized.includes("complete") ||
		normalized.includes("finished") ||
		normalized.includes("prepared") ||
		normalized.includes("pass")
	) {
		return "completed";
	}
	if (normalized.includes("running") || normalized.includes("progress")) return "running";
	if (normalized.includes("fail") || normalized.includes("error")) return "failed";
	if (normalized.includes("cancel")) return "canceled";
	return "pending";
}

function stageLabel(value: string): string {
	return value
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseProjectHierarchy(raw: string): ActiveProjectTreeNode[] {
	const nodes: ActiveProjectTreeNode[] = [];
	let current: Partial<ActiveProjectTreeNode> | null = null;

	for (const line of raw.split(/\r?\n/)) {
		const item = /^\s*-\s+id:\s*(.*)$/.exec(line);
		if (item) {
			if (current?.id) {
				nodes.push({
					id: current.id,
					label: current.label || current.id,
					nodeType: current.nodeType || "project",
					projectId: current.projectId || null,
					parentId: current.parentId || null,
					status: current.status || "unknown",
					summary: current.summary || null,
					sortOrder: current.sortOrder || 0,
					sourcePath: current.sourcePath || null,
				});
			}
			current = { id: stripYamlScalar(item[1] || "") };
			continue;
		}

		if (!current) continue;
		const property = /^\s+([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
		if (!property) continue;
		const [, key, value] = property;
		const scalar = stripYamlScalar(value || "");
		if (key === "label") current.label = scalar;
		if (key === "node_type") current.nodeType = scalar;
		if (key === "project_id") current.projectId = scalar || null;
		if (key === "parent_id") current.parentId = scalar || null;
		if (key === "status") current.status = scalar;
		if (key === "summary") current.summary = scalar;
		if (key === "sort_order") current.sortOrder = Number.parseInt(scalar, 10) || 0;
		if (key === "source_path") current.sourcePath = scalar || null;
	}

	if (current?.id) {
		nodes.push({
			id: current.id,
			label: current.label || current.id,
			nodeType: current.nodeType || "project",
			projectId: current.projectId || null,
			parentId: current.parentId || null,
			status: current.status || "unknown",
			summary: current.summary || null,
			sortOrder: current.sortOrder || 0,
			sourcePath: current.sourcePath || null,
		});
	}

	return nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

async function readProjectTree(root: string): Promise<ActiveProjectTreeNode[]> {
	const hierarchyPath = path.join(root, "projects", "project-hierarchy.yml");
	if (!existsSync(hierarchyPath)) return [];
	return parseProjectHierarchy(await readFile(hierarchyPath, "utf8"));
}

function authorAttribution(user: string, role?: string): AuthorAttribution {
	const normalized = user.trim() || "yuriy";
	const isAgent = Boolean(role && role !== "operator");
	return {
		user: normalized,
		role,
		isAgent,
		displayName: normalized,
	};
}

function rigorTier(value: string): 1 | 2 | 3 {
	const match = /([123])/.exec(value);
	if (match?.[1] === "2") return 2;
	if (match?.[1] === "3") return 3;
	return 1;
}

function riskClassification(value: string): "low" | "medium" | "high" {
	const normalized = value.toLowerCase();
	if (normalized.includes("high")) return "high";
	if (normalized.includes("low")) return "low";
	return "medium";
}

function normalizeStatus(status: string, state: WorkOrderRunState): WorkOrderStatus {
	const normalized = status.toLowerCase();
	if (state === "running" || state === "awaiting_approval") return "in_flight";
	if (state === "completed") return "completed";
	if (normalized.includes("superseded")) return "superseded";
	if (normalized.includes("abandoned") || normalized.includes("canceled")) {
		return "abandoned";
	}
	return "queued";
}

function normalizeRunState(status: string | null): WorkOrderRunState | null {
	const normalized = (status || "").toLowerCase();
	if (!normalized) return null;
	if (normalized.includes("awaiting") || normalized.includes("paused_for_gate")) {
		return "awaiting_approval";
	}
	if (normalized.includes("running") || normalized.includes("in_progress")) return "running";
	if (normalized.includes("fail") || normalized.includes("revis")) return "failed";
	if (normalized.includes("cancel")) return "canceled";
	if (
		normalized.includes("complete") ||
		normalized.includes("closed") ||
		normalized.includes("pass")
	) {
		return "completed";
	}
	if (normalized.includes("block")) return "blocked";
	if (normalized.includes("ready")) return "ready";
	if (normalized.includes("queued") || normalized.includes("pending")) return "queued";
	return null;
}

function inferScope(parsed: Record<string, string>, raw: string): WorkOrderScope {
	const explicit = parsed.scope?.toLowerCase();
	if (WORK_ORDER_SCOPES.includes(explicit as WorkOrderScope)) {
		return explicit as WorkOrderScope;
	}
	const haystack = [
		parsed.id,
		parsed.title,
		parsed.pipeline_variant,
		parsed.context,
		parsed.intent,
		raw.slice(0, 3000),
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
	if (/\bbrand|atom|uiux|component-library|vecreal\b/.test(haystack)) return "brand";
	if (/\bcleanup|polish|permanent fix|stability|bug|neutralize\b/.test(haystack)) {
		return "cleanup";
	}
	if (/\bdocs?|index|foundation|policy|receipt|knowledge\b/.test(haystack)) {
		return "docs";
	}
	if (/\bcockpit|dashboard|surface|list view|right rail|composer|filter\b/.test(haystack)) {
		return "dashboard";
	}
	if (/\brunner|pipeline|registry|template|manifest|schema|tooling|infrastructure\b/.test(haystack)) {
		return "infrastructure";
	}
	if (/\bproduct|construction|pm|intake\b/.test(haystack)) return "product";
	return "other";
}

async function parseWorkOrder(root: string, filePath: string): Promise<ParsedWorkOrder> {
	const raw = await readFile(filePath, "utf8");
	const parsed = parseShallowYaml(raw);
	const id = parsed.id || path.basename(filePath, path.extname(filePath));
	const modifiedAt = await fileModifiedAt(filePath);
	const author = parsed.author || parsed.requested_by || "yuriy";
	const assignedTo = parsed.assigned_to || author;
	return {
		id,
		title: parsed.title || id,
		statusRaw: parsed.status || "queued",
		projectId: parsed.project_id || "software-factory",
		author,
		assignedTo,
		rigorTier: rigorTier(parsed.rigor_tier || parsed.rigor || "T1"),
		riskClassification: riskClassification(parsed.risk_classification || parsed.risk || ""),
		pipelineVariant: parsed.pipeline_variant || null,
		dependsOn: parseYamlList(raw, "depends_on"),
		sourceRelativePath: relativePath(root, filePath),
		modifiedAt,
		createdAt: parsed.created || null,
		rawSearchText: raw.slice(0, 6000),
		scope: inferScope(parsed, raw),
		gateState: parsed.gate_state || null,
	};
}

function workOrderIdFromRunPath(runRelativePath: string): string | null {
	const last = runRelativePath.split("/").filter(Boolean).at(-1) || "";
	const normalized = last
		.replace(/^wo-/i, "WO-")
		.replace(/^([a-z]+)-/i, (prefix) => prefix.toUpperCase())
		.replace(/-([a-z]+)$/i, (_match, suffix) => `-${String(suffix).toUpperCase()}`);
	const idMatch = /(WO-[A-Z]+\d+(?:\.\d+)?(?:\.\d+)?(?:-[A-Z0-9.-]+)?)/i.exec(
		normalized,
	);
	return idMatch?.[1]?.toUpperCase() || null;
}

function durationMs(startedAt: string | null, completedAt: string | null): number | null {
	if (!startedAt) return null;
	const start = new Date(startedAt).getTime();
	const end = completedAt ? new Date(completedAt).getTime() : Date.now();
	if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
	return end - start;
}

interface PipelineStageSeed {
	stageId: string;
	label: string;
	role: string;
}

function parseInlineHandoffChain(value: string): PipelineStageSeed[] {
	const trimmed = stripYamlScalar(value);
	if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
	return trimmed
		.slice(1, -1)
		.split(",")
		.map((item) => stripYamlScalar(item))
		.filter(Boolean)
		.map((role, index) => ({
			stageId: role.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
			label: stageLabel(role),
			role,
			index,
		}));
}

function parseDefaultHandoffChain(lines: string[]): PipelineStageSeed[] {
	const seeds: PipelineStageSeed[] = [];
	let inChain = false;
	let currentStage: Partial<PipelineStageSeed> | null = null;
	const flushStage = () => {
		if (!currentStage) return;
		const role = currentStage.role || currentStage.stageId || "stage";
		const stageId =
			currentStage.stageId || role.toLowerCase().replace(/[^a-z0-9]+/g, "_");
		seeds.push({
			stageId,
			label: currentStage.label || stageLabel(stageId),
			role,
		});
		currentStage = null;
	};

	for (const line of lines) {
		if (/^default_handoff_chain:\s*$/.test(line)) {
			inChain = true;
			continue;
		}
		if (!inChain) continue;
		if (/^[A-Za-z0-9_-]+:\s*/.test(line)) break;
		const stageItem = /^\s+-\s+stage:\s*(.*)$/.exec(line);
		if (stageItem) {
			flushStage();
			const stageId = stripYamlScalar(stageItem[1] || "");
			currentStage = {
				stageId,
				label: stageLabel(stageId),
			};
			continue;
		}
		const role = /^\s+role:\s*(.*)$/.exec(line);
		if (role && currentStage) {
			currentStage.role = stripYamlScalar(role[1] || "");
		}
	}
	flushStage();
	return seeds;
}

async function pipelineStagesForVariant(
	root: string,
	pipelinePath: string | null,
	variant: string | null,
): Promise<PipelineStageSeed[]> {
	if (!variant) return [];
	const candidatePath = pipelinePath
		? resolveFactoryPath(root, normalizeSlashes(pipelinePath))
		: path.join(root, "projects", "software-factory", "project-pipeline.yml");
	if (!existsSync(candidatePath)) return [];
	const raw = await readFile(candidatePath, "utf8");
	const lines = raw.split(/\r?\n/);
	if (variant === "work_order_handoff_chain" || variant === "default_handoff_chain") {
		return parseDefaultHandoffChain(lines);
	}
	let inVariant = false;
	let inHandoff = false;
	let currentStage: Partial<PipelineStageSeed> | null = null;
	const seeds: PipelineStageSeed[] = [];

	const flushStage = () => {
		if (!currentStage) return;
		const role = currentStage.role || currentStage.stageId || "stage";
		const stageId =
			currentStage.stageId || role.toLowerCase().replace(/[^a-z0-9]+/g, "_");
		seeds.push({
			stageId,
			label: currentStage.label || stageLabel(stageId),
			role,
		});
		currentStage = null;
	};

	for (const line of lines) {
		const variantMatch = /^  - id:\s*(.*)$/.exec(line);
		if (variantMatch) {
			if (inVariant) break;
			inVariant = stripYamlScalar(variantMatch[1] || "") === variant;
			continue;
		}
		if (!inVariant) continue;
		const inlineHandoff = /^\s+handoff_chain:\s*(\[.*\])\s*$/.exec(line);
		if (inlineHandoff) return parseInlineHandoffChain(inlineHandoff[1] || "");
		if (/^\s+handoff_chain:\s*$/.test(line)) {
			inHandoff = true;
			continue;
		}
		if (!inHandoff) continue;
		if (/^\s+[A-Za-z0-9_-]+:\s*/.test(line) && !/^\s+-\s+/.test(line)) {
			break;
		}
		const scalarItem = /^\s+-\s+([A-Z][A-Z0-9_]+)\s*$/.exec(line);
		if (scalarItem) {
			flushStage();
			const role = scalarItem[1] || "STAGE";
			seeds.push({
				stageId: role.toLowerCase(),
				label: stageLabel(role),
				role,
			});
			continue;
		}
		const stageItem = /^\s+-\s+stage:\s*(.*)$/.exec(line);
		if (stageItem) {
			flushStage();
			const stageId = stripYamlScalar(stageItem[1] || "");
			currentStage = {
				stageId,
				label: stageLabel(stageId),
			};
			continue;
		}
		const role = /^\s+role:\s*(.*)$/.exec(line);
		if (role && currentStage) {
			currentStage.role = stripYamlScalar(role[1] || "");
		}
	}
	flushStage();

	return seeds;
}

function stageRecordFromSeed(
	seed: PipelineStageSeed,
	index: number,
	currentIndex: number,
	runState: WorkOrderRunState,
	hasOpenGate: boolean,
): ActiveRunStageNode {
	const state: ActiveRunStageNodeState =
		runState === "failed" && index === currentIndex
			? "failed"
			: hasOpenGate && index === currentIndex
				? "gated"
				: index < currentIndex
					? "completed"
					: index === currentIndex
						? "current"
						: "upcoming";
	return {
		id: `${seed.stageId}-${index}`,
		stageId: seed.stageId,
		label: seed.label,
		role: seed.role,
		state,
		stageIndex: index,
		summary: null,
		outputPath: null,
		promptPath: null,
		receiptPath: null,
		startedAt: null,
		completedAt: null,
	};
}

function stageRecordFromRunJson(
	stage: Record<string, unknown>,
	index: number,
	currentIndex: number,
	runState: WorkOrderRunState,
	hasOpenGate: boolean,
): ActiveRunStageNode {
	const role = stringField(stage, ["role"]) || "STAGE";
	const stageId =
		stringField(stage, ["stageId", "stage_id", "stage"]) ||
		role.toLowerCase().replace(/[^a-z0-9]+/g, "_");
	const normalized = stageStatus(stringField(stage, ["status"]));
	const state: ActiveRunStageNodeState =
		normalized === "failed" || (runState === "failed" && index === currentIndex)
			? "failed"
			: hasOpenGate && index === currentIndex
				? "gated"
				: normalized === "completed" || index < currentIndex
					? "completed"
					: normalized === "running" || index === currentIndex
						? "current"
						: "upcoming";
	return {
		id: `${stageId}-${index}`,
		stageId,
		label: stageLabel(stringField(stage, ["stageName", "stage_name", "stage"]) || stageId),
		role,
		state,
		stageIndex: numberField(stage, ["stage_index", "stageIndex"]) ?? index,
		summary: stringField(stage, ["summary", "next_action", "failureReason"]),
		outputPath: normalizeOutputPath(stringField(stage, ["output_path", "outputPath"])),
		promptPath: normalizeOutputPath(stringField(stage, ["prompt_path", "promptPath"])),
		receiptPath: normalizeOutputPath(stringField(stage, ["receipt_path", "receiptPath"])),
		startedAt: stringField(stage, ["started_at", "startedAt"]),
		completedAt: stringField(stage, ["finished_at", "completed_at", "completedAt"]),
	};
}

function runJsonStages(
	parsed: Record<string, unknown>,
	runState: WorkOrderRunState,
	hasOpenGate: boolean,
): Promise<ActiveRunStageNode[]> {
	const stagesRaw = Array.isArray(parsed.stages)
		? parsed.stages.filter(isRecord)
		: [];
	const currentStageId = stringField(parsed, ["currentStageId", "current_stage_id"]);
	let currentIndex = stagesRaw.findIndex((stage) => {
		const id = stringField(stage, ["stageId", "stage_id", "stage"]);
		return Boolean(currentStageId && id === currentStageId);
	});
	if (currentIndex < 0) {
		currentIndex = stagesRaw.findIndex(
			(stage) => stageStatus(stringField(stage, ["status"])) === "running",
		);
	}
	if (currentIndex < 0) {
		currentIndex = stagesRaw.findIndex(
			(stage) => stageStatus(stringField(stage, ["status"])) !== "completed",
		);
	}
	if (currentIndex < 0) currentIndex = Math.max(0, stagesRaw.length - 1);
	return Promise.resolve(
		stagesRaw.map((stage, index) =>
			stageRecordFromRunJson(stage, index, currentIndex, runState, hasOpenGate),
		),
	);
}

async function readRunSummary(root: string, runDir: string): Promise<RunSummary | null> {
	const relative = relativePath(root, runDir);
	const runJsonPath = path.join(runDir, "run.json");
	const receiptPath = path.join(runDir, "receipt.md");
	const entries = existsSync(runDir) ? await readdir(runDir).catch(() => []) : [];
	let parsed: Record<string, unknown> = {};
	if (existsSync(runJsonPath)) {
		try {
			parsed = JSON.parse(await readFile(runJsonPath, "utf8")) as Record<string, unknown>;
		} catch {
			parsed = {};
		}
	}
	const receiptText = existsSync(receiptPath)
		? await readFile(receiptPath, "utf8").catch(() => "")
		: "";
	const receiptWorkOrder = receiptText.match(/\bWO-[A-Z]+\d+(?:\.\d+){0,2}(?:-[A-Z0-9.-]+)?\b/)?.[0];
	const workOrderId =
		(typeof parsed.work_order_id === "string" && parsed.work_order_id) ||
		receiptWorkOrder ||
		workOrderIdFromRunPath(relative);
	if (!workOrderId) return null;
	const status = typeof parsed.status === "string" ? parsed.status : receiptText ? "completed" : null;
	const stages = Array.isArray(parsed.stages) ? parsed.stages : [];
	const runningIndex = stages.findIndex((stage) => {
		return (
			stage &&
			typeof stage === "object" &&
			"status" in stage &&
			String(stage.status).toLowerCase() === "running"
		);
	});
	const currentStage =
		(typeof parsed.currentStageId === "string" && parsed.currentStageId) ||
		(typeof parsed.current_stage_id === "string" && parsed.current_stage_id) ||
		(runningIndex >= 0 &&
		stages[runningIndex] &&
		typeof stages[runningIndex] === "object" &&
		"stageName" in stages[runningIndex]
			? String(stages[runningIndex].stageName)
			: null);
	const awaiting = entries.some((entry) => entry.startsWith("awaiting"));
	const approval = entries.some((entry) => entry.startsWith("approval"));
	const startedAt =
		(typeof parsed.startedAt === "string" && parsed.startedAt) ||
		(typeof parsed.started_at === "string" && parsed.started_at) ||
		null;
	const completedAt =
		(typeof parsed.completedAt === "string" && parsed.completedAt) ||
		(typeof parsed.completed_at === "string" && parsed.completed_at) ||
		null;
	return {
		runId: relative,
		workOrderId,
		status: awaiting && !approval ? "awaiting_approval" : status,
		startedAt,
		completedAt,
		modifiedAt: await fileModifiedAt(existsSync(runJsonPath) ? runJsonPath : runDir),
		currentStage,
		currentStageIndex: Math.max(0, runningIndex),
		totalStages: Math.max(1, stages.length || 1),
		hasOpenGate: awaiting && !approval,
	};
}

async function readActiveRunNode(
	root: string,
	runJsonPath: string,
	byId: Map<string, ParsedWorkOrder>,
): Promise<ActiveRunNode | null> {
	const normalizedRunJsonPath = normalizeSlashes(runJsonPath);
	if (normalizedRunJsonPath.split("/").includes("worktree")) return null;
	const runDir = path.dirname(runJsonPath);
	const runRelativePath = relativePath(root, runDir);
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(await readFile(runJsonPath, "utf8")) as Record<string, unknown>;
	} catch {
		return null;
	}
	const workOrderId =
		stringField(parsed, ["work_order_id", "workOrderId"]) ||
		workOrderIdFromRunPath(runRelativePath);
	if (!workOrderId) return null;
	const runState = normalizeRunState(stringField(parsed, ["status"]));
	if (!runState || runState === "completed" || runState === "canceled") return null;

	const entries = existsSync(runDir) ? await readdir(runDir).catch(() => []) : [];
	const awaiting = entries.some((entry) => entry.startsWith("awaiting"));
	const approval = entries.some((entry) => entry.startsWith("approval"));
	const hasOpenGate = (awaiting && !approval) || runState === "awaiting_approval";
	const effectiveState = hasOpenGate ? "awaiting_approval" : runState;
	const workOrder = byId.get(workOrderId) || byId.get(workOrderId.toUpperCase());
	const projectId =
		stringField(parsed, ["project_id", "projectId"]) ||
		workOrder?.projectId ||
		"software-factory";
	const pipelineVariant =
		stringField(parsed, ["pipeline_variant", "pipelineVariant"]) ||
		workOrder?.pipelineVariant ||
		null;
	const pipelinePath = stringField(parsed, ["pipeline_path", "pipelinePath"]);
	const startedAt = stringField(parsed, ["started_at", "startedAt"]);
	const completedAt = stringField(parsed, ["finished_at", "completed_at", "completedAt"]);
	const modifiedAt = await fileModifiedAt(runJsonPath);
	const runId =
		stringField(parsed, ["run_id", "runId"]) ||
		runRelativePath.split("/").filter(Boolean).at(-1) ||
		runRelativePath;
	let stages = await runJsonStages(parsed, effectiveState, hasOpenGate);
	if (stages.length === 0) {
		const seeds = await pipelineStagesForVariant(root, pipelinePath, pipelineVariant);
		const currentIndex = 0;
		stages = seeds.map((seed, index) =>
			stageRecordFromSeed(seed, index, currentIndex, effectiveState, hasOpenGate),
		);
	}
	if (stages.length === 0) {
		stages = [
			stageRecordFromSeed(
				{
					stageId: effectiveState,
					label: stageLabel(effectiveState),
					role: "RUNNER",
				},
				0,
				0,
				effectiveState,
				hasOpenGate,
			),
		];
	}

	const workOrderModifiedAt = workOrder?.modifiedAt || null;
	const staleStateNotice =
		workOrderModifiedAt && startedAt && workOrderModifiedAt > startedAt
			? {
					surface: "/factory/home",
					changedAt: workOrderModifiedAt,
					changedBy: authorAttribution(workOrder?.author || "yuriy", "operator"),
					changeSummary:
						"Work order source changed after this run started. Review before acting on stale output.",
					sourcePath:
						workOrder?.sourceRelativePath ||
						normalizeOutputPath(stringField(parsed, ["work_order_path", "workOrderPath"])) ||
						runRelativePath,
				}
			: null;
	const provider = stringField(parsed, ["provider"]) || "codex";

	return {
		id: `${workOrderId}-${runRelativePath}`,
		runId,
		runRelativePath,
		workOrderId,
		title: workOrder?.title || workOrderId,
		projectId,
		state: effectiveState,
		status: stringField(parsed, ["status"]),
		pipelineVariant,
		triggeredBy: activeRunAttribution(
			parsed.triggeredBy ?? parsed.triggered_by ?? parsed.author,
			workOrder?.author || "Yuriy",
			"operator",
		),
		executedBy: activeRunAttribution(
			parsed.executedBy ?? parsed.executed_by ?? parsed.provider,
			provider,
			provider === "yuriy" ? "operator" : "agent",
		),
		lastActivityAt: modifiedAt || completedAt || startedAt,
		startedAt,
		staleStateNotice,
		stages,
	};
}

async function collectActiveRunNodes(
	root: string,
	byId: Map<string, ParsedWorkOrder>,
): Promise<ActiveRunNode[]> {
	const runJsonFiles = await walkRunJsonFiles(root);
	const active = await Promise.all(
		runJsonFiles.map((filePath) => readActiveRunNode(root, filePath, byId)),
	);
	return active
		.filter((run): run is ActiveRunNode => Boolean(run))
		.sort((a, b) => (b.lastActivityAt || "").localeCompare(a.lastActivityAt || ""))
		.slice(0, 8);
}

export function activeRunsSignature(snapshot: ActiveRunsSnapshot): string {
	return JSON.stringify(
		snapshot.runs.map((run) => ({
			id: run.id,
			state: run.state,
			activity: run.lastActivityAt,
			stages: run.stages.map((stage) => [stage.id, stage.state, stage.outputPath]),
		})),
	);
}

function stageRecordFromActiveRunStage(stage: ActiveRunStageNode): StageRecord {
	const status: StageRecord["status"] =
		stage.state === "completed"
			? "completed"
			: stage.state === "failed"
				? "failed"
				: stage.state === "upcoming"
					? "pending"
					: "running";
	return {
		stageId: stage.stageId,
		stageName: stage.label,
		status,
		startedAt: stage.startedAt || undefined,
		completedAt: stage.completedAt || undefined,
		receiptPath: stage.receiptPath || undefined,
		outputs: [stage.outputPath, stage.receiptPath].filter(
			(value): value is string => Boolean(value),
		),
	};
}

function currentOrFirstStage(run: ActiveRunNode): ActiveRunStageNode {
	return (
		run.stages.find((stage) => stage.state === "current" || stage.state === "gated") ||
		run.stages[0] || {
			id: `${run.id}-stage`,
			stageId: run.state,
			label: stageLabel(run.state),
			role: "RUNNER",
			state: run.state === "failed" ? "failed" : "current",
			stageIndex: 0,
			summary: null,
			outputPath: null,
			promptPath: null,
			receiptPath: null,
			startedAt: run.startedAt,
			completedAt: null,
		}
	);
}

function gateEventForRun(
	run: ActiveRunNode,
	stage: ActiveRunStageNode,
	generatedAt: string,
): RunStateEvent {
	return {
		kind: "gate_required",
		runId: run.runId,
		gate: {
			gateId: `${run.runId}:${stage.stageId}:gate`,
			runId: run.runId,
			stageId: stage.stageId,
			type: "final_acceptance",
			prompt: `${run.workOrderId} needs operator review.`,
			context: stage.summary || run.title,
			choices: [
				{ kind: "approve", label: "Approve" },
				{ kind: "revise", label: "Request revision", promptForGuidance: true },
				{ kind: "escalate", label: "Escalate", targetRole: "PROJECT_COORDINATOR" },
			],
			requiresAuthor: run.triggeredBy,
			createdAt: generatedAt,
		},
	};
}

export function activeRunsDeltaEvent(
	previous: ActiveRunsSnapshot | null,
	snapshot: ActiveRunsSnapshot,
): RunStateEvent | null {
	if (!previous) return null;
	const previousRuns = new Map(previous.runs.map((run) => [run.id, run]));
	for (const run of snapshot.runs) {
		const previousRun = previousRuns.get(run.id);
		const stage = currentOrFirstStage(run);
		if (!previousRun) {
			if (run.state === "awaiting_approval") return gateEventForRun(run, stage, snapshot.generatedAt);
			if (run.state === "failed") return { kind: "run_failed", runId: run.runId, reason: run.status || "Run failed." };
			return { kind: "stage_started", runId: run.runId, stage: stageRecordFromActiveRunStage(stage) };
		}
		if (run.state !== previousRun.state) {
			if (run.state === "awaiting_approval") return gateEventForRun(run, stage, snapshot.generatedAt);
			if (run.state === "failed") return { kind: "run_failed", runId: run.runId, reason: run.status || "Run failed." };
		}
		const previousStages = new Map(previousRun.stages.map((item) => [item.id, item]));
		for (const nextStage of run.stages) {
			const previousStage = previousStages.get(nextStage.id);
			if (
				previousStage &&
				previousStage.state === nextStage.state &&
				previousStage.outputPath === nextStage.outputPath &&
				previousStage.receiptPath === nextStage.receiptPath
			) {
				continue;
			}
			const stageRecord = stageRecordFromActiveRunStage(nextStage);
			if (nextStage.state === "gated") return gateEventForRun(run, nextStage, snapshot.generatedAt);
			if (nextStage.state === "completed") {
				return {
					kind: "stage_completed",
					runId: run.runId,
					stage: stageRecord,
					outputs: stageRecord.outputs || [],
				};
			}
			if (nextStage.state === "failed") {
				return {
					kind: "stage_failed",
					runId: run.runId,
					stage: stageRecord,
					failureReason: nextStage.summary || run.status || "Stage failed.",
				};
			}
			if (nextStage.state === "current") {
				return { kind: "stage_started", runId: run.runId, stage: stageRecord };
			}
		}
	}
	return null;
}

async function collectRuns(root: string): Promise<RunSummary[]> {
	const runsRoot = path.join(root, "runs");
	if (!existsSync(runsRoot)) return [];
	const candidateDirs = new Set<string>();
	for (const filePath of await walkFiles(root, "runs", [".json", ".md", ".yml", ".yaml"])) {
		const basename = path.basename(filePath);
		if (
			basename === "run.json" ||
			basename === "receipt.md" ||
			basename.startsWith("awaiting") ||
			basename.startsWith("approval")
		) {
			candidateDirs.add(path.dirname(filePath));
		}
	}
	const topLevel = await readdir(runsRoot, { withFileTypes: true }).catch(() => []);
	for (const entry of topLevel) {
		if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "worktree") {
			candidateDirs.add(path.join(runsRoot, entry.name));
		}
	}
	const summaries = await Promise.all(
		[...candidateDirs].map((dir) => readRunSummary(root, dir)),
	);
	return summaries.filter((summary): summary is RunSummary => Boolean(summary));
}

function latestRunFor(workOrderId: string, runs: RunSummary[]): RunSummary | null {
	const matching = runs.filter(
		(run) => run.workOrderId.toUpperCase() === workOrderId.toUpperCase(),
	);
	return matching.sort((a, b) =>
		(b.modifiedAt || b.completedAt || b.startedAt || "").localeCompare(
			a.modifiedAt || a.completedAt || a.startedAt || "",
		),
	)[0] || null;
}

function finalState(
	workOrder: ParsedWorkOrder,
	runs: RunSummary[],
	byId: Map<string, ParsedWorkOrder>,
): WorkOrderRunState {
	const latestRun = latestRunFor(workOrder.id, runs);
	const runState = normalizeRunState(latestRun?.status || null);
	if (runState && runState !== "queued") return runState;
	const statusState = normalizeRunState(workOrder.statusRaw);
	if (statusState && TERMINAL_STATES.has(statusState)) return statusState;
	const unsatisfied = workOrder.dependsOn.filter((dependency) => {
		const dependencyWorkOrder = byId.get(dependency);
		if (!dependencyWorkOrder) return true;
		const dependencyState = finalStateWithoutDependencies(dependencyWorkOrder, runs);
		return dependencyState !== "completed";
	});
	if (unsatisfied.length > 0) return "blocked";
	if (statusState === "ready") return "ready";
	if (statusState === "blocked") return "blocked";
	if (statusState === "queued" || !statusState) return "ready";
	return statusState;
}

function finalStateWithoutDependencies(
	workOrder: ParsedWorkOrder,
	runs: RunSummary[],
): WorkOrderRunState {
	const latestRun = latestRunFor(workOrder.id, runs);
	const runState = normalizeRunState(latestRun?.status || null);
	if (runState && runState !== "queued") return runState;
	const statusState = normalizeRunState(workOrder.statusRaw);
	return statusState || "queued";
}

function buildDependencyEdges(
	workOrder: ParsedWorkOrder,
	byId: Map<string, ParsedWorkOrder>,
	runs: RunSummary[],
): DependencyEdge[] {
	return workOrder.dependsOn.map((dependency) => {
		const dependencyWorkOrder = byId.get(dependency);
		const state: DependencyEdge["state"] = !dependencyWorkOrder
			? "broken"
			: finalStateWithoutDependencies(dependencyWorkOrder, runs) === "completed"
				? "satisfied"
				: "pending";
		return {
			from: dependency,
			to: workOrder.id,
			state,
			reason:
				state === "broken"
					? "Dependency work order was not found"
					: state === "pending"
						? "Dependency has not completed"
						: undefined,
		};
	});
}

function labelFor(value: string): string {
	return value
		.split(/[_-]+/g)
		.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
		.join(" ");
}

function optionCounts<T extends string>(
	items: WorkOrderListItemView[],
	values: readonly T[],
	pick: (item: WorkOrderListItemView) => T,
): FilterOption[] {
	return values.map((value) => ({
		value,
		label: labelFor(value),
		count: items.filter((item) => pick(item) === value).length,
	}));
}

function projectOptions(items: WorkOrderListItemView[]): FilterOption[] {
	const counts = new Map<string, number>();
	for (const item of items) counts.set(item.projectId, (counts.get(item.projectId) || 0) + 1);
	return [...counts.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([value, count]) => ({ value, label: value, count }));
}

function matchesFilters(item: WorkOrderListItemView, filters: WorkOrderListFilters): boolean {
	if (filters.projectId && filters.projectId !== "all" && item.projectId !== filters.projectId) {
		return false;
	}
	if (filters.scope && filters.scope !== "all" && item.scope !== filters.scope) {
		return false;
	}
	if (filters.state && filters.state !== "all" && item.state !== filters.state) {
		return false;
	}
	const needle = filters.search?.trim().toLowerCase();
	if (needle) {
		const haystack = [
			item.id,
			item.title,
			item.projectId,
			item.scope,
			item.state,
			item.sourceRelativePath,
			item.author.displayName,
			item.assignedTo.displayName,
		]
			.join(" ")
			.toLowerCase();
		if (!haystack.includes(needle)) return false;
	}
	return true;
}

function sortByActivity(a: WorkOrderListItemView, b: WorkOrderListItemView): number {
	return b.lastActivityAt.localeCompare(a.lastActivityAt);
}

async function activeProjectOwner(projectId: string): Promise<string> {
	const projects = await getFactoryReadModel().getDataset("projects");
	const project = projects.find((row) => row.data.project_id === projectId);
	return typeof project?.data.primary_owner === "string" ? project.data.primary_owner : "yuriy";
}

async function assertGatePacketNotStale(
	root: string,
	input: GateResponseWriteInput,
): Promise<void> {
	if (!input.awaitingPacketPath || !input.expectedPacketModifiedAt) return;
	const packetPath = resolveFactoryPath(root, input.awaitingPacketPath);
	const currentModifiedAt = (await stat(packetPath)).mtime.toISOString();
	if (currentModifiedAt !== input.expectedPacketModifiedAt) {
		throw new Error(
			`STALE_GATE_PACKET: ${input.awaitingPacketPath} changed after this gate loaded. Reload the packet before approving.`,
		);
	}
}

async function readRunJson(runDir: string): Promise<Record<string, unknown>> {
	const runJson = path.join(runDir, "run.json");
	if (!existsSync(runJson)) return {};
	try {
		return JSON.parse(await readFile(runJson, "utf8")) as Record<string, unknown>;
	} catch {
		return {};
	}
}

async function updateRunJson(
	runDir: string,
	updater: (current: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
	const next = updater(await readRunJson(runDir));
	await writeAtomic(path.join(runDir, "run.json"), `${JSON.stringify(next, null, 2)}\n`);
}

function runCommand(
	root: string,
	command: string,
	args: readonly string[],
): Promise<{ command: string; status: "pass" | "fail"; output: string }> {
	return new Promise((resolve) => {
		const child = spawn(command, [...args], {
			cwd: root,
			windowsHide: true,
			env: { ...process.env, FACTORY_LOCAL_ONLY: "true" },
		});
		const chunks: string[] = [];
		child.stdout.on("data", (chunk) => chunks.push(String(chunk)));
		child.stderr.on("data", (chunk) => chunks.push(String(chunk)));
		child.on("error", (error) => {
			resolve({
				command: [command, ...args].join(" "),
				status: "fail",
				output: error.message,
			});
		});
		child.on("close", (code) => {
			resolve({
				command: [command, ...args].join(" "),
				status: code === 0 ? "pass" : "fail",
				output: chunks.join("").trim(),
			});
		});
	});
}

async function updateWorkOrderStatus(
	root: string,
	workOrderId: string,
): Promise<boolean> {
	const files = await walkFiles(root, "work-orders", [".yml", ".yaml"]);
	const target = files.find((file) => path.basename(file, path.extname(file)) === workOrderId);
	if (!target) return false;
	const raw = await readFile(target, "utf8");
	const next = raw.replace(/^status:\s*.+$/m, "status: completed");
	if (next === raw) return false;
	await writeAtomic(target, next);
	return true;
}

function toItem(
	workOrder: ParsedWorkOrder,
	state: WorkOrderRunState,
	allRuns: RunSummary[],
	byId: Map<string, ParsedWorkOrder>,
): WorkOrderListItemView {
	const latestRun = latestRunFor(workOrder.id, allRuns);
	const edges = buildDependencyEdges(workOrder, byId, allRuns);
	const blockedBy = edges
		.filter((edge) => edge.state !== "satisfied")
		.map((edge) => edge.from);
	const lastActivityAt =
		latestRun?.modifiedAt ||
		latestRun?.completedAt ||
		latestRun?.startedAt ||
		workOrder.modifiedAt ||
		workOrder.createdAt ||
		new Date(0).toISOString();
	const elapsed = durationMs(latestRun?.startedAt || null, latestRun?.completedAt || null);
	return {
		id: workOrder.id,
		title: workOrder.title,
		status: normalizeStatus(workOrder.statusRaw, state),
		rigorTier: workOrder.rigorTier,
		riskClassification: workOrder.riskClassification,
		author: authorAttribution(workOrder.author),
		assignedTo: authorAttribution(workOrder.assignedTo),
		projectId: workOrder.projectId,
		scope: workOrder.scope,
		state,
		blockedBy,
		lastActivityAt,
		hasOpenGate: Boolean(latestRun?.hasOpenGate) || state === "awaiting_approval",
		inFlightRunId:
			state === "running" || state === "awaiting_approval"
				? latestRun?.runId
				: undefined,
		sourceRelativePath: workOrder.sourceRelativePath,
		pipelineVariant: workOrder.pipelineVariant,
		gateState: workOrder.gateState,
		runCount: allRuns.filter(
			(run) => run.workOrderId.toUpperCase() === workOrder.id.toUpperCase(),
		).length,
		latestRunId: latestRun?.runId || null,
		latestRunStatus: latestRun?.status || null,
		progress:
			state === "running" || state === "awaiting_approval"
				? {
						currentStage: latestRun?.currentStage || state,
						currentStageIndex: latestRun?.currentStageIndex || 0,
						totalStages: latestRun?.totalStages || 1,
						elapsedMs: elapsed,
						startedAt: latestRun?.startedAt || null,
					}
				: null,
		dependencyEdges: edges,
		dialogueAttentionCount: workOrder.rawSearchText.includes("dialogueId") ? 1 : 0,
		canRun: state === "ready",
		createdAt: workOrder.createdAt,
		durationMs: elapsed,
	};
}

function projectPipelinePath(root: string, projectId: string): string | null {
	const candidate = path.join(root, "projects", ...projectId.split("/"), "project-pipeline.yml");
	return existsSync(candidate) ? relativePath(root, candidate) : null;
}

function carryForwardKnownGaps(): string[] {
	return [
		"AttentionPill v0 provisional",
		"/automations route alias mismatch",
	];
}

function pipelineStageFromSeed(seed: PipelineStageSeed): PipelineStage {
	return {
		stageId: seed.stageId,
		role: seed.role,
		label: seed.label,
		hasOwnerGate: /GATE|APPROVAL|VALIDATION|AUDIT/i.test(seed.role),
		isParallelizable: /IMPLEMENTATION|DOCUMENTATION|COMPONENT|REVIEW/i.test(seed.role),
	};
}

function runHistoryItem(run: RunSummary): WorkOrderRunHistoryItem {
	return {
		runId: run.runId,
		runRelativePath: run.runId,
		status: run.status,
		startedAt: run.startedAt,
		completedAt: run.completedAt,
		modifiedAt: run.modifiedAt,
		currentStage: run.currentStage,
		currentStageIndex: run.currentStageIndex,
		totalStages: run.totalStages,
		hasOpenGate: run.hasOpenGate,
	};
}

async function nextCSeriesIds(root: string, count: number): Promise<string[]> {
	const files = await walkFiles(root, "work-orders", [".yml", ".yaml"]);
	let highest = 0;
	for (const file of files) {
		const raw = await readFile(file, "utf8").catch(() => "");
		const parsed = parseShallowYaml(raw);
		const fromId = workOrderNumber(parsed.id || "");
		const fromFile = workOrderNumber(path.basename(file, path.extname(file)));
		highest = Math.max(highest, fromId || 0, fromFile || 0);
	}
	return Array.from({ length: count }, (_, index) => `WO-C${highest + index + 1}`);
}

function normalizeComposerActor(actor?: WorkOrderComposerActor): WorkOrderComposerActor {
	return {
		user: actor?.user || "yuriy",
		displayName: actor?.displayName || actor?.user || "yuriy",
		role: actor?.role || "operator",
		isAgent: Boolean(actor?.isAgent),
	};
}

function defaultAcceptanceCriteria(mode: WorkOrderComposerMode): string[] {
	return mode === "project-launch"
		? [
				"Substage scope is documented before implementation starts.",
				"Dependencies are explicit and any parallel cohorts are safe to run together.",
				"Receipt cites verification evidence and open follow-ups.",
			]
		: [
				"Requested behavior is implemented or the blocker is documented.",
				"Relevant verification passes.",
				"Receipt explains what changed in plain English.",
			];
}

function defaultVerificationCommands(projectId: string): string[] {
	if (projectId === "software-factory") {
		return [
			"bun run --cwd vendor/superset-sh/apps/desktop typecheck",
			"bun run --cwd vendor/superset-sh/apps/desktop compile:app",
		];
	}
	return ["Verify the changed project files and receipt evidence."];
}

function riskFromText(value: string): "low" | "medium" | "high" {
	const lower = value.toLowerCase();
	if (/\bsecurity|payment|legal|foundation|migration|delete|production\b/.test(lower)) {
		return "high";
	}
	if (/\bui|surface|dashboard|runner|pipeline|schema|integration\b/.test(lower)) {
		return "medium";
	}
	return "low";
}

function pipelineVariantFromText(value: string): string {
	const lower = value.toLowerCase();
	if (/\bui|surface|dashboard|cockpit|screen|component|visual\b/.test(lower)) {
		return "dashboard_or_ui_feature";
	}
	if (/\bdoc|readme|policy|copy|content|knowledge\b/.test(lower)) {
		return "documentation_or_content";
	}
	return "default";
}

function renderDraftYaml(input: {
	draft: Omit<WorkOrderDraftItem, "yaml">;
	mode: WorkOrderComposerMode;
	author: WorkOrderComposerActor;
	assignedTo: WorkOrderComposerActor;
	references: WorkOrderComposerReference[];
}): string {
	const { draft, mode, author, assignedTo, references } = input;
	const now = new Date().toISOString().slice(0, 10);
	const sourceLines = [
		`id: ${draft.id}`,
		`title: ${yamlScalar(draft.title)}`,
		"status: queued",
		`created: ${now}`,
		"source: factory-work-order-composer",
		`composer_mode: ${mode}`,
		"requested_by: yuriy",
		`author: ${yamlScalar(author.user)}`,
		`assigned_to: ${yamlScalar(assignedTo.user)}`,
		`project_id: ${yamlScalar(draft.projectId)}`,
		"mission_id: MISSION-2026-04-29-001",
		`rigor_tier: ${draft.rigorTier}`,
		`risk_classification: ${draft.riskClassification}`,
		"risk: P1",
		"owner: codex",
		"pipeline_profile: projects/software-factory/project-pipeline.yml",
		`pipeline_variant: ${yamlScalar(draft.pipelineVariant)}`,
		"modifies_factory_machinery: false",
		"non_code_artifact: false",
		"foundation_class_amendment: false",
		"",
		"context: >",
		"  Drafted from the cockpit Work Order Composer through the INTAKE_STEWARD flow.",
		"",
		"intent: >",
		...draft.intent.split(/\r?\n/).map((line) => `  ${line || ""}`),
		"",
		"references:",
		...yamlList(references.map((reference) => `${reference.kind}:${reference.value}`)),
		"",
		"depends_on:",
		...yamlList(draft.dependsOn),
		"",
		"acceptance_criteria:",
		...yamlList(draft.acceptanceCriteria),
		"",
		"verification_plan:",
		...draft.verificationCommands.flatMap((command) => [
			`  - command: ${yamlScalar(command)}`,
			"    required: true",
		]),
		"",
		"handoff_return:",
		"  expected:",
		"    - receipt with verification evidence",
		"",
	];
	return `${sourceLines.join("\n")}`;
}

function composeDraftsFromIntent(input: {
	ids: string[];
	mode: WorkOrderComposerMode;
	intent: string;
	projectId: string;
	author: WorkOrderComposerActor;
	assignedTo: WorkOrderComposerActor;
	references: WorkOrderComposerReference[];
	parsedCli?: unknown;
}): { drafts: WorkOrderDraftItem[]; cohorts: string[][]; stewardTurn: string } {
	const parsedRecord = isRecord(input.parsedCli) ? input.parsedCli : null;
	const cliOrders = Array.isArray(parsedRecord?.work_orders)
		? parsedRecord.work_orders.filter(isRecord)
		: [];
	const orderSeeds =
		cliOrders.length > 0
			? cliOrders
			: input.mode === "project-launch"
				? [
						{
							title: `${titleFromIntent(input.intent, "Product launch")} product scope`,
							intent: `Define the product scope, acceptance boundaries, dependencies, and operator gates for: ${input.intent}`,
							depends_on: [],
						},
						{
							title: `${titleFromIntent(input.intent, "Product launch")} architecture`,
							intent: `Design the implementation architecture and integration plan for: ${input.intent}`,
							depends_on: ["0"],
						},
						{
							title: `${titleFromIntent(input.intent, "Product launch")} implementation`,
							intent: `Implement the approved architecture for: ${input.intent}`,
							depends_on: ["1"],
						},
						{
							title: `${titleFromIntent(input.intent, "Product launch")} audit and synthesis`,
							intent: `Audit, verify, and synthesize the completed project-launch cohort for: ${input.intent}`,
							depends_on: ["2"],
						},
					]
				: [
						{
							title: titleFromIntent(input.intent, "Composed work order"),
							intent: input.intent,
							depends_on: [],
						},
					];
	const ids = input.ids.slice(0, orderSeeds.length);
	const titleToId = new Map<string, string>();
	orderSeeds.forEach((seed, index) => {
		const title = stringField(seed, ["title"]) || `Composed work order ${index + 1}`;
		titleToId.set(title, ids[index] || `WO-C${index + 1}`);
		titleToId.set(String(index), ids[index] || `WO-C${index + 1}`);
	});
	const drafts = orderSeeds.map((seed, index) => {
		const title = stringField(seed, ["title"]) || `Composed work order ${index + 1}`;
		const intent = stringField(seed, ["intent", "summary"]) || input.intent;
		const dependsOnRaw = Array.isArray(seed.depends_on)
			? seed.depends_on.map((item) => String(item))
			: [];
		const dependsOn = dependsOnRaw
			.map((dependency) => titleToId.get(dependency) || dependency)
			.filter((dependency) => dependency && dependency !== ids[index]);
		const acceptanceCriteria = Array.isArray(seed.acceptance_criteria)
			? seed.acceptance_criteria.map((item) => String(item)).filter(Boolean)
			: defaultAcceptanceCriteria(input.mode);
		const verificationCommands = Array.isArray(seed.verification_commands)
			? seed.verification_commands.map((item) => String(item)).filter(Boolean)
			: defaultVerificationCommands(input.projectId);
		const baseDraft: Omit<WorkOrderDraftItem, "yaml"> = {
			id: ids[index] || `WO-C${index + 1}`,
			title,
			intent,
			projectId: input.projectId,
			pipelineVariant:
				stringField(seed, ["pipeline_variant"]) || pipelineVariantFromText(intent),
			rigorTier: (stringField(seed, ["rigor_tier"]) as "T1" | "T2" | "T3") || "T1",
			riskClassification:
				(stringField(seed, ["risk_classification"]) as "low" | "medium" | "high") ||
				riskFromText(intent),
			dependsOn,
			acceptanceCriteria,
			verificationCommands,
		};
		return {
			...baseDraft,
			yaml: renderDraftYaml({
				draft: baseDraft,
				mode: input.mode,
				author: input.author,
				assignedTo: input.assignedTo,
				references: input.references,
			}),
		};
	});
	const cliCohorts = Array.isArray(parsedRecord?.cohorts)
		? parsedRecord.cohorts
				.filter(Array.isArray)
				.map((cohort) =>
					cohort
						.map((item) => titleToId.get(String(item)) || String(item))
						.filter((id) => drafts.some((draft) => draft.id === id)),
				)
				.filter((cohort) => cohort.length > 0)
		: [];
	const cohorts =
		cliCohorts.length > 0
			? cliCohorts
			: input.mode === "project-launch"
				? drafts.map((draft) => [draft.id])
				: [[drafts[0]?.id || ids[0] || "WO-C0"]];
	return {
		drafts,
		cohorts,
		stewardTurn:
			stringField(parsedRecord || {}, ["steward_turn", "summary"]) ||
			(input.mode === "project-launch"
				? `I scoped this into ${drafts.length} dependent work orders. Review the graph, then approve one cohort at a time or save the full set.`
				: "I drafted one queued work order from your intent. Review the scope and YAML if you want the exact file before saving."),
	};
}

function remapDraftIds(
	drafts: WorkOrderDraftItem[],
	nextIds: string[],
	proposal: WorkOrderDraftProposal,
): WorkOrderDraftItem[] {
	const idMap = new Map<string, string>();
	drafts.forEach((draft, index) => idMap.set(draft.id, nextIds[index] || draft.id));
	return drafts.map((draft) => {
		const baseDraft: Omit<WorkOrderDraftItem, "yaml"> = {
			...draft,
			id: idMap.get(draft.id) || draft.id,
			dependsOn: draft.dependsOn.map((dependency) => idMap.get(dependency) || dependency),
		};
		return {
			...baseDraft,
			yaml: renderDraftYaml({
				draft: baseDraft,
				mode: proposal.mode,
				author: proposal.author,
				assignedTo: proposal.assignedTo,
				references: proposal.references,
			}),
		};
	});
}

function extractJsonObject(text: string): unknown {
	const trimmed = text.trim();
	if (!trimmed) return null;
	try {
		return JSON.parse(trimmed);
	} catch {
		const start = trimmed.indexOf("{");
		const end = trimmed.lastIndexOf("}");
		if (start >= 0 && end > start) {
			try {
				return JSON.parse(trimmed.slice(start, end + 1));
			} catch {
				return null;
			}
		}
		return null;
	}
}

export class FactoryWorkOrdersStore {
	async list(input: WorkOrderListFilters = {}): Promise<FilteredWorkOrderList> {
		const readModel = getFactoryReadModel();
		const root = readModel.getRoot();
		const files = await walkFiles(root, "work-orders", [".yml", ".yaml"]);
		const parsed = await Promise.all(files.map((file) => parseWorkOrder(root, file)));
		const runs = await collectRuns(root);
		const byId = new Map(parsed.map((workOrder) => [workOrder.id, workOrder]));
		const items = parsed.map((workOrder) =>
			toItem(workOrder, finalState(workOrder, runs, byId), runs, byId),
		);
		const filters = {
			projectId: input.projectId || "software-factory",
			scope: input.scope || "all",
			state: input.state || "all",
			assignedToMe: Boolean(input.assignedToMe),
			search: input.search || "",
			historyLimit: Math.max(1, Math.min(input.historyLimit || 50, 250)),
		};
		const filtered = items.filter((item) => matchesFilters(item, filters));
		const inFlight = filtered
			.filter((item) => item.state === "running" || item.state === "awaiting_approval")
			.sort(sortByActivity);
		const queued = filtered
			.filter((item) => !TERMINAL_STATES.has(item.state) && !inFlight.includes(item))
			.sort((a, b) => {
				const stateOrder = { blocked: 0, ready: 1, queued: 2 };
				return (
					(stateOrder[a.state as keyof typeof stateOrder] ?? 9) -
						(stateOrder[b.state as keyof typeof stateOrder] ?? 9) ||
					sortByActivity(a, b)
				);
			});
		const historyAll = filtered
			.filter((item) => TERMINAL_STATES.has(item.state))
			.sort(sortByActivity);
		const history = historyAll.slice(0, filters.historyLimit);
		const dependencyEdges = filtered.flatMap((item) => item.dependencyEdges);

		return {
			generatedAt: new Date().toISOString(),
			filters,
			activeProjectOwner: await activeProjectOwner(filters.projectId),
			projectOptions: projectOptions(items),
			scopeOptions: optionCounts(items, WORK_ORDER_SCOPES, (item) => item.scope),
			stateOptions: optionCounts(items, WORK_ORDER_STATES, (item) => item.state),
			sections: {
				inFlight,
				queued,
				history,
				historyTotal: historyAll.length,
				historyLimit: filters.historyLimit,
				historyHasMore: history.length < historyAll.length,
			},
			dependencyGraph: {
				nodes: filtered,
				edges: dependencyEdges,
				parallelCohorts: [
					queued.filter((item) => item.state === "ready").map((item) => item.id),
				].filter((cohort) => cohort.length > 0),
				blockedQueue: queued
					.filter((item) => item.state === "blocked")
					.map((item) => item.id),
			},
			carryForwardKnownGaps: carryForwardKnownGaps(),
		};
	}

	async detail(workOrderId: string): Promise<WorkOrderDetailView> {
		const readModel = getFactoryReadModel();
		const root = readModel.getRoot();
		const files = await walkFiles(root, "work-orders", [".yml", ".yaml"]);
		const parsed = await Promise.all(files.map((file) => parseWorkOrder(root, file)));
		const workOrder =
			parsed.find((candidate) => candidate.id === workOrderId) ||
			parsed.find((candidate) => candidate.id.toUpperCase() === workOrderId.toUpperCase());
		if (!workOrder) throw new Error(`Work order not found: ${workOrderId}`);
		const runs = await collectRuns(root);
		const byId = new Map(parsed.map((candidate) => [candidate.id, candidate]));
		const item = toItem(workOrder, finalState(workOrder, runs, byId), runs, byId);
		const sourcePath = resolveFactoryPath(root, workOrder.sourceRelativePath);
		const raw = await readFile(sourcePath, "utf8");
		const pipelinePath = projectPipelinePath(root, workOrder.projectId);
		const pipelineStages = (
			await pipelineStagesForVariant(root, pipelinePath, workOrder.pipelineVariant)
		).map(pipelineStageFromSeed);
		const activeById = new Map<string, ParsedWorkOrder>();
		for (const candidate of parsed) {
			activeById.set(candidate.id, candidate);
			activeById.set(candidate.id.toUpperCase(), candidate);
		}
		const activeRun =
			(await collectActiveRunNodes(root, activeById)).find(
				(run) => run.workOrderId.toUpperCase() === workOrder.id.toUpperCase(),
			) || null;
		const runHistory = runs
			.filter((run) => run.workOrderId.toUpperCase() === workOrder.id.toUpperCase())
			.sort((a, b) =>
				(b.modifiedAt || b.completedAt || b.startedAt || "").localeCompare(
					a.modifiedAt || a.completedAt || a.startedAt || "",
				),
			)
			.map(runHistoryItem);

		return {
			generatedAt: new Date().toISOString(),
			item,
			sourceRelativePath: workOrder.sourceRelativePath,
			raw,
			parsed: parseShallowYaml(raw),
			pipelineStages,
			runHistory,
			activeRun,
			capacity: getFactoryRunnerBridge().capacity(),
			carryForwardKnownGaps: carryForwardKnownGaps(),
		};
	}

	async runWorkOrder(input: {
		workOrderId: string;
		provider?: string;
		simulate?: string;
	}): Promise<FactoryRunnerLaunchResult> {
		const detail = await this.detail(input.workOrderId);
		return getFactoryRunnerBridge().launch({
			workOrderId: detail.item.id,
			workOrderPath: detail.sourceRelativePath,
			projectId: detail.item.projectId,
			pipelinePath: projectPipelinePath(getFactoryReadModel().getRoot(), detail.item.projectId),
			provider: input.provider,
			simulate: input.simulate,
			requestedBy: detail.item.author,
		});
	}

	async resumeRun(input: {
		workOrderId: string;
		runId: string;
		provider?: string;
		simulate?: string;
	}): Promise<FactoryRunnerLaunchResult> {
		const detail = await this.detail(input.workOrderId);
		return getFactoryRunnerBridge().resume({
			workOrderId: detail.item.id,
			workOrderPath: detail.sourceRelativePath,
			projectId: detail.item.projectId,
			pipelinePath: projectPipelinePath(getFactoryReadModel().getRoot(), detail.item.projectId),
			provider: input.provider,
			simulate: input.simulate,
			requestedBy: detail.item.author,
			runId: input.runId,
		});
	}

	async cancelRun(input: {
		runId: string;
		canceledBy?: AuthorAttribution;
	}): Promise<FactoryRunnerControlResult> {
		return getFactoryRunnerBridge().cancel(input.runId, input.canceledBy);
	}

	capacity(): FactoryRunnerCapacity {
		return getFactoryRunnerBridge().capacity();
	}

	subscribeRunnerEvents(
		listener: (event: FactoryRunnerBridgeEvent) => void,
	): () => void {
		return getFactoryRunnerBridge().subscribe(listener);
	}

	async draftWorkOrders(input: WorkOrderComposerRequest): Promise<WorkOrderDraftProposal> {
		const readModel = getFactoryReadModel();
		const root = readModel.getRoot();
		const author = normalizeComposerActor(input.author);
		const assignedTo = normalizeComposerActor(input.assignedTo || input.author);
		const provider = input.provider || "dry-run";
		const promptSource = {
			mode: input.mode,
			projectId: input.projectId || "software-factory",
			operatorIntent: input.intent,
			operatorMessage: input.operatorMessage,
			authorUser: author.user,
			assignedToUser: assignedTo.user,
			references: input.references || [],
			priorDraftYaml: input.priorDraft?.workOrders.map((draft) => draft.yaml).join("\n---\n"),
		};
		const prompt =
			input.mode === "project-launch"
				? buildProjectLaunchWorkOrderPrompt(promptSource)
				: buildWorkOrderDraftPrompt(promptSource);
		let parsedCli: unknown = null;
		let stewardTurn = "";
		let cliInvoked = false;
		let cliFallbackReason: string | undefined;
		if (provider !== "dry-run") {
			cliInvoked = true;
			try {
				const result = await invokeFactoryCliRole({
					provider,
					roleId: "INTAKE_STEWARD",
					prompt,
					dialogueId: `work-order-composer-${input.projectId}`,
				});
				parsedCli = extractJsonObject(result.text);
				stewardTurn = result.text.trim();
				if (!parsedCli) {
					cliFallbackReason = "INTAKE_STEWARD returned non-JSON text, so the cockpit produced a local draft from the same prompt.";
				}
			} catch (error) {
				cliFallbackReason = error instanceof Error ? error.message : String(error);
			}
		}
		const parsedOrders =
			isRecord(parsedCli) && Array.isArray(parsedCli.work_orders)
				? parsedCli.work_orders
				: [];
		const draftCount =
			parsedOrders.length > 0 ? parsedOrders.length : input.mode === "project-launch" ? 4 : 1;
		const ids = await nextCSeriesIds(root, draftCount);
		const composed = composeDraftsFromIntent({
			ids,
			mode: input.mode,
			intent: input.intent,
			projectId: input.projectId || "software-factory",
			author,
			assignedTo,
			references: input.references || [],
			parsedCli,
		});
		const visibleStewardTurn =
			stewardTurn && !parsedCli
				? `${plainSummary(stewardTurn, 420)}\n\n${composed.stewardTurn}`
				: composed.stewardTurn;
		return {
			draftId: `${input.mode}-${Date.now().toString(36)}`,
			mode: input.mode,
			projectId: input.projectId || "software-factory",
			author,
			assignedTo,
			references: input.references || [],
			stewardTurn: visibleStewardTurn,
			cliProvider: provider,
			cliInvoked,
			cliFallbackReason,
			createdAt: new Date().toISOString(),
			workOrders: composed.drafts,
			cohorts: composed.cohorts,
		};
	}

	async saveComposedWorkOrders(
		input: SaveWorkOrderDraftInput,
	): Promise<SaveWorkOrderDraftResult> {
		const readModel = getFactoryReadModel();
		const root = readModel.getRoot();
		const selected = new Set(input.selectedIds || input.proposal.workOrders.map((draft) => draft.id));
		let drafts = input.proposal.workOrders.filter((draft) => selected.has(draft.id));
		if (drafts.length === 0) {
			throw new Error("No draft work orders were selected to save.");
		}
		const saved: SaveWorkOrderDraftResult["saved"] = [];
		const skipped = input.proposal.workOrders
			.filter((draft) => !selected.has(draft.id))
			.map((draft) => draft.id);
		if (
			drafts.some((draft) =>
				existsSync(path.join(root, "work-orders", safeWorkOrderFileName(draft.id))),
			)
		) {
			drafts = remapDraftIds(
				drafts,
				await nextCSeriesIds(root, drafts.length),
				input.proposal,
			);
		}
		for (const draft of drafts) {
			const filePath = path.join(root, "work-orders", safeWorkOrderFileName(draft.id));
			try {
				await writeNewFile(filePath, draft.yaml);
			} catch (error) {
				if (
					error &&
					typeof error === "object" &&
					"code" in error &&
					error.code === "EEXIST"
				) {
					const [fresh] = await nextCSeriesIds(root, 1);
					const [remapped] = remapDraftIds([draft], [fresh], input.proposal);
					const remappedPath = path.join(
						root,
						"work-orders",
						safeWorkOrderFileName(remapped.id),
					);
					await writeNewFile(remappedPath, remapped.yaml);
					saved.push({
						id: remapped.id,
						path: relativePath(root, remappedPath),
						title: remapped.title,
					});
					continue;
				}
				throw error;
			}
			saved.push({
				id: draft.id,
				path: relativePath(root, filePath),
				title: draft.title,
			});
		}
		await readModel.refresh();
		return { saved, skipped };
	}

	async activeRuns(
		input: Pick<WorkOrderListFilters, "projectId" | "assignedToMe"> = {},
	): Promise<ActiveRunsSnapshot> {
		const readModel = getFactoryReadModel();
		const root = readModel.getRoot();
		const files = await walkFiles(root, "work-orders", [".yml", ".yaml"]);
		const parsed = await Promise.all(files.map((file) => parseWorkOrder(root, file)));
		const byId = new Map<string, ParsedWorkOrder>();
		for (const workOrder of parsed) {
			byId.set(workOrder.id, workOrder);
			byId.set(workOrder.id.toUpperCase(), workOrder);
		}
		const requestedProjectId = input.projectId || "software-factory";
		const activeRuns = (await collectActiveRunNodes(root, byId)).filter((run) => {
			const projectMatch =
				requestedProjectId === "all" ||
				run.projectId === requestedProjectId ||
				run.projectId.startsWith(`${requestedProjectId}/`);
			if (!projectMatch) return false;
			if (!input.assignedToMe) return true;
			const userNames = [
				run.triggeredBy.user,
				run.triggeredBy.displayName,
				run.executedBy.user,
				run.executedBy.displayName,
			].map((value) => value.toLowerCase());
			return userNames.some((value) => value.includes("yuriy"));
		});

		return {
			generatedAt: new Date().toISOString(),
			projectId: requestedProjectId,
			activeProjectOwner: await activeProjectOwner(requestedProjectId),
			runs: activeRuns,
			projectTree: await readProjectTree(root),
			carryForwardKnownGaps: carryForwardKnownGaps(),
		};
	}

	async respondGate(
		input: GateResponseWriteInput,
	): Promise<{ files: string[]; runRelativePath: string }> {
		const readModel = getFactoryReadModel();
		const root = readModel.getRoot();
		await assertGatePacketNotStale(root, input);
		const runDir = resolveRunPath(root, input.runRelativePath);
		const gateSlug = safeSlug(input.gate);
		const createdAt = new Date().toISOString();
		const content = [
			`status: ${input.decision}`,
			`decision: ${input.decision}`,
			`approved_by: ${input.decidedBy?.displayName || "Yuriy"}`,
			`gate: ${gateSlug}`,
			input.gateId ? `gate_id: ${input.gateId}` : null,
			"source: superset-cockpit",
			`created_at: ${createdAt}`,
			...actorForYaml(input.decidedBy),
			`notes: ${yamlBlock(input.notes)}`,
			"",
		]
			.filter((line): line is string => line !== null)
			.join("\n");
		const generalApproval = path.join(runDir, "approval.yml");
		const gateApproval = path.join(runDir, `approval-${gateSlug}.yml`);
		await writeAtomic(generalApproval, content);
		await writeAtomic(gateApproval, content);
		await this.logManualIntervention(input.runRelativePath, {
			reason: `Gate ${gateSlug} ${input.decision} from cockpit.`,
			proposedFix: input.notes || undefined,
			decidedBy: input.decidedBy,
		});
		await readModel.refresh();
		return {
			files: [relativePath(root, generalApproval), relativePath(root, gateApproval)],
			runRelativePath: relativePath(root, runDir),
		};
	}

	async logManualIntervention(
		runRelativePath: string,
		intervention: {
			reason: string;
			proposedFix?: string;
			decidedBy?: GateDecisionActor;
		},
	): Promise<void> {
		const root = getFactoryReadModel().getRoot();
		const runDir = resolveRunPath(root, runRelativePath);
		await updateRunJson(runDir, (current) => {
			const manualInterventions = Array.isArray(current.manualInterventions)
				? current.manualInterventions
				: [];
			return {
				...current,
				manualInterventions: [
					...manualInterventions,
					{
						at: new Date().toISOString(),
						reason: intervention.reason,
						proposedFix: intervention.proposedFix,
						decidedBy: intervention.decidedBy || {
							user: "Yuriy",
							displayName: "Yuriy",
							isAgent: false,
						},
					},
				],
			};
		});
	}

	async markRunForRetry(
		runRelativePath: string,
		reason: string,
	): Promise<{ file: string }> {
		const readModel = getFactoryReadModel();
		const root = readModel.getRoot();
		const runDir = resolveRunPath(root, runRelativePath);
		const filePath = path.join(runDir, "retry-requested.yml");
		await writeAtomic(
			filePath,
			[
				"status: retry_requested",
				"source: superset-cockpit",
				`created_at: ${new Date().toISOString()}`,
				`reason: ${yamlBlock(reason)}`,
				"",
			].join("\n"),
		);
		await this.logManualIntervention(runRelativePath, {
			reason: "Run retry requested from cockpit.",
			proposedFix: reason || undefined,
		});
		await readModel.refresh();
		return { file: relativePath(root, filePath) };
	}

	async abandonRun(
		runRelativePath: string,
		reason: string,
	): Promise<{ file: string }> {
		const readModel = getFactoryReadModel();
		const root = readModel.getRoot();
		const runDir = resolveRunPath(root, runRelativePath);
		const filePath = path.join(runDir, "abandon-requested.yml");
		await writeAtomic(
			filePath,
			[
				"status: abandon_requested",
				"source: superset-cockpit",
				`created_at: ${new Date().toISOString()}`,
				`reason: ${yamlBlock(reason)}`,
				"",
			].join("\n"),
		);
		await updateRunJson(runDir, (current) => ({
			...current,
			status: "canceled",
			canceledAt: new Date().toISOString(),
		}));
		await this.logManualIntervention(runRelativePath, {
			reason: "Run abandon requested from cockpit.",
			proposedFix: reason || undefined,
		});
		await readModel.refresh();
		return { file: relativePath(root, filePath) };
	}

	async merge(input: MergeWorkOrderInput): Promise<MergeWorkOrderResult> {
		const readModel = getFactoryReadModel();
		const root = readModel.getRoot();
		const branchName = input.branchName || `origin/codex/${input.workOrderId.toLowerCase()}`;
		const commands: MergeWorkOrderResult["commands"] = [];
		if (input.dryRun) {
			return {
				workOrderId: input.workOrderId,
				branchName,
				commands: [
					{ command: "git fetch", status: "skip", output: "dry-run" },
					{
						command: `git merge --no-ff ${branchName}`,
						status: "skip",
						output: "dry-run",
					},
					{
						command: "git submodule update --init --recursive",
						status: "skip",
						output: "dry-run",
					},
					{ command: "git push origin main", status: "skip", output: "dry-run" },
				],
				merged: false,
				workOrderStatusUpdated: false,
			};
		}
		for (const [command, args] of [
			["git", ["fetch"]],
			["git", ["merge", "--no-ff", branchName]],
			["git", ["submodule", "update", "--init", "--recursive"]],
		] as const) {
			const result = await runCommand(root, command, args);
			commands.push(result);
			if (result.status === "fail") {
				return {
					workOrderId: input.workOrderId,
					branchName,
					commands,
					merged: false,
					workOrderStatusUpdated: false,
				};
			}
		}
		const workOrderStatusUpdated = await updateWorkOrderStatus(root, input.workOrderId);
		if (workOrderStatusUpdated) {
			commands.push(await runCommand(root, "git", ["add", "work-orders"]));
			commands.push(
				await runCommand(root, "git", [
					"commit",
					"-m",
					`Mark ${input.workOrderId} completed after cockpit merge`,
				]),
			);
		}
		commands.push(await runCommand(root, "git", ["push", "origin", "main"]));
		await readModel.refresh();
		return {
			workOrderId: input.workOrderId,
			branchName,
			commands,
			merged: commands.every((command) => command.status !== "fail"),
			workOrderStatusUpdated,
		};
	}
}

let singleton: FactoryWorkOrdersStore | null = null;

export function getFactoryWorkOrdersStore(): FactoryWorkOrdersStore {
	singleton ??= new FactoryWorkOrdersStore();
	return singleton;
}
