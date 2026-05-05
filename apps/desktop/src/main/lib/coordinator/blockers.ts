import { createHash } from "node:crypto";
import { existsSync, watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
	getFactoryReadModel,
	type FactoryRow,
	type PendingFactoryApproval,
} from "main/lib/factory-read-model";
import type {
	ArtifactReference,
	AuthorAttribution,
	CoordinatorHandoff,
	ManualIntervention,
	RightRailItem,
	RightRailItemKind,
	RunState,
	RunStatus,
	StageRecord,
} from "lib/types/factory-operator-console";

export type CoordinatorBlockerReconcileReason =
	| "context_load"
	| "read_model_refresh"
	| "subscription_start"
	| "heartbeat";

export interface CoordinatorBlockerSnapshot {
	projectId: string;
	cursor: string;
	reason: CoordinatorBlockerReconcileReason;
	items: RightRailItem[];
	emittedAt: string;
	sources: string[];
}

type BlockerListener = (items: RightRailItem[], snapshot: CoordinatorBlockerSnapshot) => void;

const WATCH_RELATIVE_PATHS = ["runs", "work-orders", "projects", "decisions"];
const COORDINATOR_BLOCKER_PREFIXES = [
	"blocker-run-",
	"blocker-gate-",
	"blocker-foundation-",
	"blocker-handoff-",
	"blocker-audit-",
];

const SYSTEM_AUTHOR: AuthorAttribution = {
	user: "factory-read-model",
	role: "PROJECT_COORDINATOR",
	isAgent: true,
	displayName: "Factory read model",
};

function nowIso(): string {
	return new Date().toISOString();
}

function dataString(row: FactoryRow | null | undefined, key: string): string | null {
	const value = row?.data[key];
	return typeof value === "string" && value ? value : null;
}

function normalizedStatus(row: FactoryRow): string {
	return (
		dataString(row, "gate_state") ||
		dataString(row, "state") ||
		dataString(row, "run_state") ||
		row.status ||
		"unknown"
	).toLowerCase();
}

function projectIdForRow(row: FactoryRow): string | null {
	return dataString(row, "project_id") || dataString(row, "project");
}

function rowMatchesProject(row: FactoryRow, projectId: string): boolean {
	const dataProject = projectIdForRow(row);
	return (
		dataProject === projectId ||
		row.source_relative_path.includes(`/projects/${projectId}/`) ||
		row.source_relative_path.includes(`projects/${projectId}/`) ||
		row.id.includes(projectId)
	);
}

function runDirectoryForRow(row: FactoryRow): string {
	if (path.basename(row.source_path) === "run.json") return path.dirname(row.source_path);
	if (existsSync(path.join(row.source_path, "run.json"))) return row.source_path;
	return path.dirname(row.source_path);
}

function safeItemId(prefix: string, value: string): string {
	return `${prefix}${value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

function itemCursor(items: RightRailItem[]): string {
	const payload = items
		.map((item) => `${item.itemId}:${item.kind}:${item.updatedAt}:${item.summary}`)
		.sort()
		.join("|");
	return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function artifactForRow(
	row: FactoryRow,
	kind: ArtifactReference["kind"],
	projectId: string,
): ArtifactReference {
	return {
		referenceId: row.id,
		kind,
		label: row.title || row.id,
		projectId,
		path: row.source_relative_path,
		route:
			kind === "work_order"
				? `/factory/work-orders/${row.id}`
				: row.source_relative_path,
		summary: row.status ?? undefined,
	};
}

function artifactForPath(input: {
	referenceId: string;
	kind: ArtifactReference["kind"];
	label: string;
	projectId: string;
	relativePath: string;
	summary?: string;
}): ArtifactReference {
	return {
		referenceId: input.referenceId,
		kind: input.kind,
		label: input.label,
		projectId: input.projectId,
		path: input.relativePath,
		route: input.relativePath,
		summary: input.summary,
	};
}

function runStatusFromRow(row: FactoryRow): RunStatus {
	const status = normalizedStatus(row);
	if (status.includes("fail") || status.includes("error")) return "failed";
	if (status.includes("cancel")) return "canceled";
	if (status.includes("complete") || status.includes("pass")) return "completed";
	if (status.includes("pause") || status.includes("approval")) return "paused_for_gate";
	if (status.includes("run") || status.includes("progress") || status.includes("flight")) {
		return "running";
	}
	return "pending";
}

function rightRailKindForRun(row: FactoryRow): RightRailItemKind {
	const status = normalizedStatus(row);
	const signalText = `${status} ${row.title} ${row.quality_flags.join(" ")}`.toLowerCase();
	if (
		signalText.includes("fail") ||
		signalText.includes("error") ||
		signalText.includes("blocked") ||
		signalText.includes("retry exhausted")
	) {
		return "blocked_or_error";
	}
	if (
		signalText.includes("awaiting") ||
		signalText.includes("approval") ||
		signalText.includes("paused") ||
		signalText.includes("manual")
	) {
		return "pending_action";
	}
	if (signalText.includes("complete") || signalText.includes("pass")) {
		return "recently_completed";
	}
	return "running_work";
}

function stageStatusFromRunStatus(status: RunStatus): StageRecord["status"] {
	if (status === "completed") return "completed";
	if (status === "failed") return "failed";
	if (status === "canceled") return "canceled";
	if (status === "running") return "running";
	return "pending";
}

function normalizeStages(value: unknown, fallbackStatus: RunStatus): StageRecord[] {
	if (!Array.isArray(value)) {
		return [
			{
				stageId: "read-model",
				stageName: "Read model",
				status: stageStatusFromRunStatus(fallbackStatus),
			},
		];
	}
	return value
		.map((entry, index): StageRecord | null => {
			if (!entry || typeof entry !== "object") return null;
			const record = entry as Record<string, unknown>;
			const stageId =
				typeof record.stageId === "string"
					? record.stageId
					: typeof record.stage_id === "string"
						? record.stage_id
						: `stage-${index + 1}`;
			const stageName =
				typeof record.stageName === "string"
					? record.stageName
					: typeof record.stage_name === "string"
						? record.stage_name
						: stageId;
			const rawStatus = typeof record.status === "string" ? record.status : "pending";
			const status: StageRecord["status"] =
				rawStatus === "running" ||
				rawStatus === "completed" ||
				rawStatus === "failed" ||
				rawStatus === "canceled"
					? rawStatus
					: "pending";
			return {
				stageId,
				stageName,
				status,
				startedAt: typeof record.startedAt === "string" ? record.startedAt : undefined,
				completedAt:
					typeof record.completedAt === "string" ? record.completedAt : undefined,
				receiptPath:
					typeof record.receiptPath === "string" ? record.receiptPath : undefined,
			};
		})
		.filter((stage): stage is StageRecord => Boolean(stage));
}

function normalizeManualInterventions(value: unknown): ManualIntervention[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry): ManualIntervention | null => {
			if (!entry || typeof entry !== "object") return null;
			const record = entry as Record<string, unknown>;
			const reason =
				typeof record.reason === "string"
					? record.reason
					: typeof record.message === "string"
						? record.message
						: "";
			if (!reason) return null;
			return {
				at:
					typeof record.at === "string"
						? record.at
						: typeof record.createdAt === "string"
							? record.createdAt
							: nowIso(),
				reason,
				proposedFix:
					typeof record.proposedFix === "string" ? record.proposedFix : undefined,
			};
		})
		.filter((intervention): intervention is ManualIntervention => Boolean(intervention));
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
	if (!existsSync(filePath)) return null;
	try {
		const parsed = JSON.parse(await readFile(filePath, "utf8"));
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch {
		return null;
	}
}

async function runStateForRow(row: FactoryRow): Promise<RunState> {
	const status = runStatusFromRow(row);
	const runDir = runDirectoryForRow(row);
	const runJson = await readJsonFile(path.join(runDir, "run.json"));
	const workOrderId =
		dataString(row, "work_order_id") ||
		(typeof runJson?.work_order_id === "string" ? runJson.work_order_id : null) ||
		row.id.split("/").slice(-1)[0] ||
		row.id;
	const manualInterventions = normalizeManualInterventions(
		runJson?.manualInterventions ?? runJson?.manual_interventions,
	);
	return {
		runId: row.id,
		workOrderId,
		status,
		startedAt:
			typeof runJson?.startedAt === "string"
				? runJson.startedAt
				: typeof runJson?.started_at === "string"
					? runJson.started_at
					: row.modified_at || nowIso(),
		completedAt:
			typeof runJson?.completedAt === "string"
				? runJson.completedAt
				: typeof runJson?.completed_at === "string"
					? runJson.completed_at
					: status === "completed"
						? row.modified_at || undefined
						: undefined,
		currentStageId:
			typeof runJson?.currentStageId === "string"
				? runJson.currentStageId
				: typeof runJson?.current_stage_id === "string"
					? runJson.current_stage_id
					: undefined,
		stages: normalizeStages(runJson?.stages, status),
		triggeredBy: SYSTEM_AUTHOR,
		executedBy: SYSTEM_AUTHOR,
		manualInterventions,
	};
}

async function runSignalItem(row: FactoryRow, projectId: string): Promise<RightRailItem | null> {
	const kind = rightRailKindForRun(row);
	if (kind === "recently_completed") {
		const modifiedAt = row.modified_at ? new Date(row.modified_at).getTime() : 0;
		if (modifiedAt && Date.now() - modifiedAt > 1000 * 60 * 60 * 24 * 14) return null;
	}
	const runState = await runStateForRow(row);
	const hasManualIntervention = runState.manualInterventions.length > 0;
	const signalText = `${normalizedStatus(row)} ${row.title} ${row.quality_flags.join(" ")}`.toLowerCase();
	const finalKind =
		hasManualIntervention && kind !== "recently_completed" ? "pending_action" : kind;
	const priority =
		finalKind === "blocked_or_error"
			? "interrupting"
			: finalKind === "recently_completed"
				? "ambient"
				: "proactive";
	const summary =
		hasManualIntervention
			? `Manual intervention logged: ${runState.manualInterventions[0]?.reason}`
			: signalText.includes("retry exhausted")
				? "Retry budget is exhausted and operator attention is needed."
				: `${normalizedStatus(row)} - ${row.source_relative_path}`;
	return {
		itemId: safeItemId("blocker-run-", row.id),
		kind: finalKind,
		title: row.title || runState.workOrderId,
		summary,
		priority,
		references: [artifactForRow(row, "run", projectId)],
		updatedAt: row.modified_at || nowIso(),
		expanded: finalKind === "blocked_or_error" || finalKind === "pending_action",
		runState,
	};
}

function gateTypeForApproval(approval: PendingFactoryApproval): "mockup_approval" | "final_acceptance" | "merge_approval" | "scope_approval" {
	const gate = approval.gate.toLowerCase();
	if (gate.includes("mockup") || gate.includes("uiux")) return "mockup_approval";
	if (gate.includes("merge")) return "merge_approval";
	if (gate.includes("scope")) return "scope_approval";
	return "final_acceptance";
}

function approvalMatchesProject(
	approval: PendingFactoryApproval,
	projectId: string,
	runs: FactoryRow[],
	workOrders: FactoryRow[],
): boolean {
	const run = runs.find((row) => row.id === approval.run_relative_path);
	const workOrder = workOrders.find((row) => row.id === approval.work_order_id);
	return Boolean(
		(run && rowMatchesProject(run, projectId)) ||
			(workOrder && rowMatchesProject(workOrder, projectId)) ||
			approval.run_relative_path.includes(projectId),
	);
}

function gateSignalItem(
	approval: PendingFactoryApproval,
	projectId: string,
): RightRailItem {
	const updatedAt = approval.packet.modified_at || nowIso();
	return {
		itemId: safeItemId("blocker-gate-", approval.id),
		kind: "pending_action",
		title: approval.title || approval.work_order_id,
		summary: `${approval.gate} is waiting for operator review.`,
		priority: "interrupting",
		references: [
			{
				referenceId: approval.work_order_id,
				kind: "work_order",
				label: approval.work_order_id,
				projectId,
				route: `/factory/work-orders/${approval.work_order_id}`,
				path: approval.run_relative_path,
			},
			artifactForPath({
				referenceId: approval.packet.source_relative_path,
				kind: "receipt",
				label: path.basename(approval.packet.source_relative_path),
				projectId,
				relativePath: approval.packet.source_relative_path,
				summary: "Awaiting approval packet",
			}),
		],
		updatedAt,
		expanded: true,
		gate: {
			gateId: approval.id,
			runId: approval.run_id,
			stageId: approval.gate,
			type: gateTypeForApproval(approval),
			prompt: approval.title || `${approval.gate} approval`,
			context: approval.packet.content.slice(0, 600),
			choices: [
				{ kind: "approve", label: "Approve" },
				{ kind: "revise", label: "Request revision", promptForGuidance: true },
				{ kind: "escalate", label: "Escalate", targetRole: "PROJECT_COORDINATOR" },
			],
			requiresAuthor: { ...SYSTEM_AUTHOR, isAgent: false, displayName: "Operator" },
			createdAt: updatedAt,
		},
	};
}

function projectLineage(projectId: string, projects: FactoryRow[]): Set<string> {
	const lineage = new Set<string>([projectId, "_shared"]);
	const byProjectId = new Map<string, FactoryRow>();
	for (const project of projects) {
		const rowProjectId = projectIdForRow(project);
		if (rowProjectId) byProjectId.set(rowProjectId, project);
	}
	let cursor = byProjectId.get(projectId);
	const seen = new Set<string>();
	while (cursor) {
		const parentId = dataString(cursor, "parent_id") || dataString(cursor, "hierarchy_parent_id");
		if (!parentId || seen.has(parentId)) break;
		seen.add(parentId);
		lineage.add(parentId);
		cursor = byProjectId.get(parentId);
	}
	return lineage;
}

function foundationScopeForPath(relativePath: string): string | null {
	const shared = /^projects\/_shared\/foundations\//.exec(relativePath);
	if (shared) return "_shared";
	const project = /^projects\/(.+)\/foundations\/[^/]+\.md$/.exec(relativePath);
	return project?.[1] ?? null;
}

function projectScopeMatchesActiveProject(
	scope: string,
	projectId: string,
	lineage: Set<string>,
): boolean {
	return (
		scope === projectId ||
		lineage.has(scope) ||
		projectId.startsWith(`${scope}/`)
	);
}

function parseCascadeRelevantMetadata(raw: string): boolean | null {
	const frontmatter = raw.startsWith("---")
		? /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1]
		: raw.split(/\r?\n/).slice(0, 24).join("\n");
	if (!frontmatter) return null;
	const match = /^cascade_relevant:\s*(true|false)\s*$/im.exec(frontmatter);
	if (!match) return null;
	return match[1]?.toLowerCase() === "true";
}

async function sharedFoundationIsCascadeRelevant(row: FactoryRow): Promise<boolean> {
	try {
		const raw = await readFile(row.source_path, "utf8");
		return parseCascadeRelevantMetadata(raw) === true;
	} catch {
		return false;
	}
}

async function foundationSignalItem(
	row: FactoryRow,
	projectId: string,
	lineage: Set<string>,
): Promise<RightRailItem | null> {
	const scope = foundationScopeForPath(row.source_relative_path);
	if (!scope) return null;
	if (scope === "_shared") {
		if (!(await sharedFoundationIsCascadeRelevant(row))) return null;
	} else if (!projectScopeMatchesActiveProject(scope, projectId, lineage)) {
		return null;
	}
	const parentOrShared = scope === "_shared" || scope !== projectId;
	const updatedAt = row.modified_at || nowIso();
	return {
		itemId: safeItemId("blocker-foundation-", `${scope}-${row.id}`),
		kind: parentOrShared ? "blocked_or_error" : "reference",
		title: parentOrShared ? "Parent foundation changed" : row.title || "Foundation reference",
		summary: parentOrShared
			? `${row.title || row.source_relative_path} may affect this project's active coordinator state.`
			: `${row.title || row.source_relative_path} is available as project context.`,
		priority: parentOrShared ? "proactive" : "ambient",
		references: [artifactForRow(row, "foundation", projectId)],
		updatedAt,
		expanded: parentOrShared,
		staleStateNotice: parentOrShared
			? {
					surface: "Project Coordinator right rail",
					changedAt: updatedAt,
					changedBy: SYSTEM_AUTHOR,
					changeSummary: `${scope} foundation changed: ${row.title || row.id}.`,
					affectsCurrentDialogue: true,
					sourcePath: row.source_relative_path,
					currentUpdatedAt: updatedAt,
				}
			: undefined,
	};
}

async function auditSignalItem(
	row: FactoryRow,
	projectId: string,
): Promise<RightRailItem | null> {
	const runDir = runDirectoryForRow(row);
	const auditPath = path.join(runDir, "audit-report.md");
	const auditReceiptPath = path.join(runDir, "audit-receipt.md");
	const sourcePath = existsSync(auditPath)
		? auditPath
		: existsSync(auditReceiptPath)
			? auditReceiptPath
			: null;
	if (!sourcePath) return null;
	let raw = "";
	try {
		raw = await readFile(sourcePath, "utf8");
	} catch {
		return null;
	}
	if (!/\b(finding|blocker|PASS_WITH_FINDINGS|REVISE|FAIL)\b/i.test(raw)) return null;
	const relativePath = path.relative(getFactoryReadModel().getRoot(), sourcePath).replace(/\\/g, "/");
	const blocker = /\b(blocker|FAIL|REVISE)\b/i.test(raw);
	return {
		itemId: safeItemId("blocker-audit-", `${row.id}-${path.basename(sourcePath)}`),
		kind: blocker ? "blocked_or_error" : "reference",
		title: blocker ? "AUDIT finding needs attention" : "AUDIT findings available",
		summary: `${row.title || row.id} has AUDIT evidence to review.`,
		priority: blocker ? "interrupting" : "proactive",
		references: [
			artifactForRow(row, "run", projectId),
			artifactForPath({
				referenceId: relativePath,
				kind: "receipt",
				label: path.basename(relativePath),
				projectId,
				relativePath,
				summary: "AUDIT evidence",
			}),
		],
		updatedAt: row.modified_at || nowIso(),
		expanded: blocker,
	};
}

function handoffSignalItem(row: FactoryRow, projectId: string): RightRailItem | null {
	const text = `${row.id} ${row.title} ${row.source_relative_path} ${row.status || ""}`.toLowerCase();
	if (!text.includes("handoff")) return null;
	const handoff: CoordinatorHandoff = {
		handoffId: safeItemId("handoff-", row.id),
		kind: "pc_to_pc",
		status: normalizedStatus(row).includes("accepted") ? "accepted" : "pending_operator",
		from: {
			projectId: projectIdForRow(row) || projectId,
			coordinatorRole: "PROJECT_COORDINATOR",
			dialoguePath: `runs/dialogues/${projectId}/coordinator/messages.jsonl`,
		},
		to: {
			projectId,
			coordinatorRole: "PROJECT_COORDINATOR",
			dialoguePath: `runs/dialogues/${projectId}/coordinator/messages.jsonl`,
		},
		createdBy: SYSTEM_AUTHOR,
		createdAt: row.modified_at || nowIso(),
		summary: row.title || "Cross-project handoff",
		requestedAction: "Review the handoff and decide whether to accept it.",
		references: [artifactForRow(row, "run", projectId)],
	};
	return {
		itemId: safeItemId("blocker-handoff-", row.id),
		kind: "handoff",
		title: "Cross-project handoff",
		summary: row.title || row.source_relative_path,
		priority: "proactive",
		references: handoff.references,
		updatedAt: row.modified_at || nowIso(),
		expanded: true,
		handoff,
	};
}

function sortRailItems(items: RightRailItem[]): RightRailItem[] {
	const priorityRank: Record<RightRailItem["priority"], number> = {
		interrupting: 0,
		proactive: 1,
		ambient: 2,
	};
	return [...items].sort((a, b) => {
		const priority = priorityRank[a.priority] - priorityRank[b.priority];
		if (priority !== 0) return priority;
		return b.updatedAt.localeCompare(a.updatedAt);
	});
}

export function isCoordinatorBlockerRightRailItem(item: RightRailItem): boolean {
	return COORDINATOR_BLOCKER_PREFIXES.some((prefix) => item.itemId.startsWith(prefix));
}

export function mergeCoordinatorBlockerItems(
	stateItems: RightRailItem[],
	blockerItems: RightRailItem[],
): RightRailItem[] {
	const nonBlockerItems = stateItems.filter(
		(item) => !isCoordinatorBlockerRightRailItem(item),
	);
	const blockerIds = new Set(blockerItems.map((item) => item.itemId));
	const carriedItems = nonBlockerItems.filter((item) => !blockerIds.has(item.itemId));
	return sortRailItems([...blockerItems, ...carriedItems]);
}

export class CoordinatorBlockerHub {
	private readonly listeners = new Map<string, Set<BlockerListener>>();
	private readonly lastSnapshots = new Map<string, CoordinatorBlockerSnapshot>();
	private readonly watchers: FSWatcher[] = [];
	private refreshTimer: NodeJS.Timeout | null = null;

	subscribe(projectId: string, listener: BlockerListener): () => void {
		this.startWatching();
		const listenersForProject = this.listeners.get(projectId) ?? new Set<BlockerListener>();
		listenersForProject.add(listener);
		this.listeners.set(projectId, listenersForProject);

		const existing = this.lastSnapshots.get(projectId);
		if (existing) listener(existing.items, existing);
		void this.reconcileProject(projectId, "subscription_start");

		return () => {
			const current = this.listeners.get(projectId);
			if (!current) return;
			current.delete(listener);
			if (current.size === 0) this.listeners.delete(projectId);
		};
	}

	async reconcileProject(
		projectId: string,
		reason: CoordinatorBlockerReconcileReason = "heartbeat",
		notify = true,
	): Promise<CoordinatorBlockerSnapshot> {
		const items = await this.buildItems(projectId);
		const snapshot: CoordinatorBlockerSnapshot = {
			projectId,
			cursor: itemCursor(items),
			reason,
			items,
			emittedAt: nowIso(),
			sources: Array.from(
				new Set(
					items.flatMap((item) =>
						item.references
							.map((reference) => reference.path)
							.filter((pathValue): pathValue is string => Boolean(pathValue)),
					),
				),
			),
		};
		this.lastSnapshots.set(projectId, snapshot);
		if (notify) this.notify(projectId, snapshot);
		return snapshot;
	}

	private startWatching(): void {
		if (this.watchers.length > 0) return;
		const readModel = getFactoryReadModel();
		readModel.startWatching();
		const root = readModel.getRoot();
		for (const relative of WATCH_RELATIVE_PATHS) {
			const absolute = path.join(root, relative);
			if (!existsSync(absolute)) continue;
			try {
				const watcher = watch(absolute, { recursive: true }, () => {
					this.scheduleReconcile();
				});
				this.watchers.push(watcher);
			} catch (error) {
				console.warn("[coordinator-blockers] watcher failed", {
					relative,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	private scheduleReconcile(): void {
		if (this.refreshTimer) clearTimeout(this.refreshTimer);
		this.refreshTimer = setTimeout(() => {
			void this.reconcileSubscribedProjects("read_model_refresh");
		}, 250);
	}

	private async reconcileSubscribedProjects(
		reason: CoordinatorBlockerReconcileReason,
	): Promise<void> {
		await getFactoryReadModel().refresh();
		await Promise.all(
			Array.from(this.listeners.keys()).map((projectId) =>
				this.reconcileProject(projectId, reason),
			),
		);
	}

	private notify(projectId: string, snapshot: CoordinatorBlockerSnapshot): void {
		const listeners = this.listeners.get(projectId);
		if (!listeners) return;
		for (const listener of listeners) listener(snapshot.items, snapshot);
	}

	private async buildItems(projectId: string): Promise<RightRailItem[]> {
		const readModel = getFactoryReadModel();
		const [index, approvals] = await Promise.all([
			readModel.getIndex(),
			readModel.listPendingApprovals(),
		]);
		const runs = index.runs.filter((row) => rowMatchesProject(row, projectId));
		const workOrders = index.work_orders.filter((row) => rowMatchesProject(row, projectId));
		const lineage = projectLineage(projectId, index.projects);
		const items: RightRailItem[] = [];

		for (const approval of approvals) {
			if (approvalMatchesProject(approval, projectId, index.runs, index.work_orders)) {
				items.push(gateSignalItem(approval, projectId));
			}
		}

		for (const row of runs) {
			const signalItem = await runSignalItem(row, projectId);
			if (signalItem) items.push(signalItem);
			const auditItem = await auditSignalItem(row, projectId);
			if (auditItem) items.push(auditItem);
			const handoffItem = handoffSignalItem(row, projectId);
			if (handoffItem) items.push(handoffItem);
		}

		for (const row of workOrders) {
			const status = normalizedStatus(row);
			if (!/(blocked|failed|manual|retry exhausted|awaiting|approval)/.test(status)) continue;
			items.push({
				itemId: safeItemId("blocker-run-", `wo-${row.id}`),
				kind:
					status.includes("blocked") || status.includes("failed")
						? "blocked_or_error"
						: "pending_action",
				title: row.title || row.id,
				summary: `${status} - ${row.source_relative_path}`,
				priority:
					status.includes("blocked") || status.includes("failed")
						? "interrupting"
						: "proactive",
				references: [artifactForRow(row, "work_order", projectId)],
				updatedAt: row.modified_at || nowIso(),
				expanded: status.includes("blocked") || status.includes("failed"),
			});
		}

		for (const foundation of index.foundations) {
			const item = await foundationSignalItem(foundation, projectId, lineage);
			if (item) items.push(item);
		}

		return sortRailItems(items).slice(0, 32);
	}
}

let singleton: CoordinatorBlockerHub | null = null;

export function getCoordinatorBlockerHub(): CoordinatorBlockerHub {
	if (!singleton) singleton = new CoordinatorBlockerHub();
	return singleton;
}
