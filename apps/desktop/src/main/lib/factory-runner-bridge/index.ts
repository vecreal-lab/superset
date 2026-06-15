import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { getFactoryReadModel } from "main/lib/factory-read-model";
import type {
	AuthorAttribution,
	RunStateEvent,
	StageRecord,
	SynthesisPacket,
} from "lib/types/factory-operator-console";

export type FactoryRunnerBridgeEvent =
	| {
			kind: "capacity_changed";
			capacity: FactoryRunnerCapacity;
	  }
	| {
			kind: "run_state";
			workOrderId: string;
			runId: string;
			runRelativePath: string;
			event: RunStateEvent;
	  }
	| {
			kind: "runner_log";
			workOrderId: string;
			runId: string;
			runRelativePath: string;
			stream: "stdout" | "stderr";
			line: string;
	  };

export interface FactoryRunnerCapacity {
	maxConcurrent: number;
	active: number;
	queued: number;
	atCapacity: boolean;
}

export interface FactoryRunnerLaunchInput {
	workOrderId: string;
	workOrderPath: string;
	projectId?: string;
	pipelinePath?: string | null;
	provider?: string;
	simulate?: string;
	resumeRunId?: string;
	requestedBy?: AuthorAttribution;
}

export interface FactoryRunnerLaunchResult {
	workOrderId: string;
	runId: string;
	runRelativePath: string;
	status: "queued" | "running";
	capacity: FactoryRunnerCapacity;
}

export interface FactoryRunnerControlResult {
	workOrderId: string;
	runId: string;
	runRelativePath: string;
	status: "canceled" | "queued" | "running";
	capacity: FactoryRunnerCapacity;
}

interface QueueItem {
	input: FactoryRunnerLaunchInput;
	runId: string;
	runRelativePath: string;
}

interface RunningItem extends QueueItem {
	child: ChildProcessWithoutNullStreams;
	pollTimer: NodeJS.Timeout;
	lastRunSignature: string;
	seenTerminalEvent: boolean;
}

type StoredRunState = Record<string, unknown>;

const DEFAULT_MAX_CONCURRENT = 2;

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

function resolveInside(root: string, relativeOrAbsolutePath: string): string {
	const resolved = path.resolve(root, relativeOrAbsolutePath);
	if (!isInsidePath(root, resolved)) {
		throw new Error(`Factory path must stay inside repo: ${relativeOrAbsolutePath}`);
	}
	return resolved;
}

function safeRunId(workOrderId: string): string {
	const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
	const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	const slug = workOrderId
		.toLowerCase()
		.replace(/[^a-z0-9.]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return `${slug || "work-order"}-${stamp}-${unique}`;
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
	await mkdir(path.dirname(filePath), { recursive: true });
	const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tmpPath, content, "utf8");
	await rename(tmpPath, filePath);
}

function authorOrOperator(author?: AuthorAttribution): AuthorAttribution {
	return (
		author || {
			user: "yuriy",
			role: "operator",
			isAgent: false,
			displayName: "Yuriy",
		}
	);
}

function nowIso(): string {
	return new Date().toISOString();
}

function stringField(record: StoredRunState, keys: string[]): string | null {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value;
		if (typeof value === "number" && Number.isFinite(value)) return String(value);
	}
	return null;
}

function readStageStatus(value: unknown): StageRecord["status"] {
	const normalized = String(value || "").toLowerCase();
	if (
		normalized.includes("pass") ||
		normalized.includes("prepared") ||
		normalized.includes("complete")
	) {
		return "completed";
	}
	if (normalized.includes("fail") || normalized.includes("error")) return "failed";
	if (normalized.includes("cancel")) return "canceled";
	if (normalized.includes("running")) return "running";
	return "pending";
}

function stageRecordFromStoredStage(stage: Record<string, unknown>): StageRecord {
	const stageId =
		stringField(stage, ["stageId", "stage_id", "stage"]) ||
		stringField(stage, ["role"]) ||
		"stage";
	return {
		stageId,
		stageName:
			stringField(stage, ["stageName", "stage_name", "stage"]) ||
			stageId.replace(/[-_]+/g, " "),
		status: readStageStatus(stage.status),
		startedAt: stringField(stage, ["startedAt", "started_at"]) || undefined,
		completedAt:
			stringField(stage, ["completedAt", "completed_at", "finished_at"]) || undefined,
		receiptPath: stringField(stage, ["receiptPath", "receipt_path"]) || undefined,
		outputs: [
			stringField(stage, ["outputPath", "output_path"]),
			stringField(stage, ["receiptPath", "receipt_path"]),
		].filter((value): value is string => Boolean(value)),
	};
}

function stagesFromRunState(runState: StoredRunState): StageRecord[] {
	const stages = Array.isArray(runState.stages)
		? runState.stages.filter(
				(stage): stage is Record<string, unknown> =>
					Boolean(stage && typeof stage === "object" && !Array.isArray(stage)),
			)
		: [];
	return stages.map(stageRecordFromStoredStage);
}

function runStatus(runState: StoredRunState): string {
	return String(runState.status || "running").toLowerCase();
}

function finalPacketForRun(runState: StoredRunState, runRelativePath: string): SynthesisPacket {
	const runId = stringField(runState, ["run_id", "runId"]) || runRelativePath;
	const workOrderId =
		stringField(runState, ["work_order_id", "workOrderId"]) || "unknown-work-order";
	return {
		runId,
		workOrderId,
		summary: "Runner subprocess completed. Review receipts and changed files before merge.",
		filesChanged: [],
		verificationOutputs: [],
		lessonCandidates: [],
		domainKnowledgeRetrievalEvidence: {
			areasConsulted: ["factory-architecture", "operator-experience"],
			filesLoaded: [],
			tokenCountConsumed: 0,
			retrievalGaps: [],
		},
		auditFindings: [],
		decisionsRecorded: [],
		branchName: `factory/${workOrderId.toLowerCase()}`,
		submoduleChanged: false,
	};
}

function deltaEvents(
	previous: StoredRunState | null,
	next: StoredRunState,
	runRelativePath: string,
): RunStateEvent[] {
	const runId = stringField(next, ["run_id", "runId"]) || runRelativePath;
	const previousStages = previous ? stagesFromRunState(previous) : [];
	const nextStages = stagesFromRunState(next);
	const events: RunStateEvent[] = [];

	for (let index = previousStages.length; index < nextStages.length; index += 1) {
		const stage = nextStages[index];
		if (!stage) continue;
		if (stage.status === "failed") {
			events.push({
				kind: "stage_failed",
				runId,
				stage,
				failureReason: "Stage failed. Open the receipt for details.",
			});
		} else if (stage.status === "completed") {
			events.push({
				kind: "stage_completed",
				runId,
				stage,
				outputs: stage.outputs || [],
			});
		} else if (stage.status === "running") {
			events.push({ kind: "stage_started", runId, stage });
		}
	}

	const previousStatus = previous ? runStatus(previous) : "";
	const nextStatus = runStatus(next);
	if (previousStatus !== nextStatus) {
		if (nextStatus === "completed") {
			events.push({
				kind: "run_completed",
				runId,
				finalReceipt: finalPacketForRun(next, runRelativePath),
			});
		} else if (nextStatus === "failed" || nextStatus === "escalated") {
			events.push({
				kind: "run_failed",
				runId,
				reason:
					nextStatus === "escalated"
						? "Runner escalated for operator decision."
						: "Runner failed. Open the latest receipt for details.",
			});
		} else if (nextStatus === "canceled") {
			events.push({
				kind: "run_canceled",
				runId,
				canceledBy: authorOrOperator(),
			});
		}
	}

	return events;
}

async function readRunJson(root: string, runRelativePath: string): Promise<StoredRunState | null> {
	const runJsonPath = path.join(resolveInside(root, runRelativePath), "run.json");
	if (!existsSync(runJsonPath)) return null;
	try {
		return JSON.parse(await readFile(runJsonPath, "utf8")) as StoredRunState;
	} catch {
		return null;
	}
}

export class FactoryRunnerBridge {
	private readonly emitter = new EventEmitter();
	private readonly active = new Map<string, RunningItem>();
	private readonly queue: QueueItem[] = [];

	capacity(): FactoryRunnerCapacity {
		const configuredMax =
			process.env.FACTORY_MAX_CONCURRENT_RUNS ||
			process.env.FACTORY_RUNNER_MAX_CONCURRENT;
		const maxConcurrent = Number.parseInt(
			configuredMax || `${DEFAULT_MAX_CONCURRENT}`,
			10,
		);
		const max = Number.isFinite(maxConcurrent) && maxConcurrent > 0
			? maxConcurrent
			: DEFAULT_MAX_CONCURRENT;
		return {
			maxConcurrent: max,
			active: this.active.size,
			queued: this.queue.length,
			atCapacity: this.active.size >= max,
		};
	}

	subscribe(listener: (event: FactoryRunnerBridgeEvent) => void): () => void {
		this.emitter.on("event", listener);
		return () => this.emitter.off("event", listener);
	}

	async launch(input: FactoryRunnerLaunchInput): Promise<FactoryRunnerLaunchResult> {
		const root = getFactoryReadModel().getRoot();
		const runId = input.resumeRunId || safeRunId(input.workOrderId);
		const runRelativePath = normalizeSlashes(path.join("runs", runId));
		const item: QueueItem = { input, runId, runRelativePath };

		if (this.capacity().atCapacity) {
			this.queue.push(item);
			await this.writeQueuedState(item);
			this.emitCapacity();
			return {
				workOrderId: input.workOrderId,
				runId,
				runRelativePath,
				status: "queued",
				capacity: this.capacity(),
			};
		}

		await this.startItem(item);
		await getFactoryReadModel().refresh();
		return {
			workOrderId: input.workOrderId,
			runId,
			runRelativePath,
			status: "running",
			capacity: this.capacity(),
		};
	}

	async resume(input: FactoryRunnerLaunchInput & { runId: string }): Promise<FactoryRunnerLaunchResult> {
		return this.launch({ ...input, resumeRunId: input.runId });
	}

	async cancel(runId: string, canceledBy?: AuthorAttribution): Promise<FactoryRunnerControlResult> {
		const root = getFactoryReadModel().getRoot();
		const queuedIndex = this.queue.findIndex((item) => item.runId === runId);
		if (queuedIndex >= 0) {
			const [queued] = this.queue.splice(queuedIndex, 1);
			if (!queued) throw new Error(`Queued run not found: ${runId}`);
			await this.writeCanceledState(queued, canceledBy);
			this.emitRunEvent(queued, {
				kind: "run_canceled",
				runId,
				canceledBy: authorOrOperator(canceledBy),
			});
			this.emitCapacity();
			return {
				workOrderId: queued.input.workOrderId,
				runId,
				runRelativePath: queued.runRelativePath,
				status: "canceled",
				capacity: this.capacity(),
			};
		}

		const running = this.active.get(runId);
		if (!running) {
			const runRelativePath = normalizeSlashes(path.join("runs", runId));
			const runState = await readRunJson(root, runRelativePath);
			if (!runState) throw new Error(`Active or queued run not found: ${runId}`);
			const workOrderId = stringField(runState, ["work_order_id", "workOrderId"]) || runId;
			const item: QueueItem = {
				input: {
					workOrderId,
					workOrderPath: stringField(runState, ["work_order_path", "workOrderPath"]) || "",
				},
				runId,
				runRelativePath,
			};
			await this.writeCanceledState(item, canceledBy);
			this.emitRunEvent(item, {
				kind: "run_canceled",
				runId,
				canceledBy: authorOrOperator(canceledBy),
			});
			return {
				workOrderId,
				runId,
				runRelativePath,
				status: "canceled",
				capacity: this.capacity(),
			};
		}

		running.child.kill("SIGTERM");
		await this.writeCanceledState(running, canceledBy);
		this.emitRunEvent(running, {
			kind: "run_canceled",
			runId,
			canceledBy: authorOrOperator(canceledBy),
		});
		return {
			workOrderId: running.input.workOrderId,
			runId,
			runRelativePath: running.runRelativePath,
			status: "canceled",
			capacity: this.capacity(),
		};
	}

	private async startItem(item: QueueItem): Promise<void> {
		const root = getFactoryReadModel().getRoot();
		const workOrderPath = resolveInside(root, item.input.workOrderPath);
		const runnerPath = path.join(root, "tools", "factory-runner", "run-work-order.mjs");
		const nodeBinary =
			process.env.FACTORY_NODE_BIN ||
			(process.versions.electron ? "node" : process.execPath);
		const args = [
			runnerPath,
			"--work-order",
			workOrderPath,
			"--run-id",
			item.runId,
			"--out-dir",
			item.runRelativePath,
			"--provider",
			item.input.provider || process.env.FACTORY_RUNNER_PROVIDER || "dry-run",
			"--executed-by",
			"cockpit-runner-bridge",
		];
		if (item.input.pipelinePath) {
			args.push("--pipeline", resolveInside(root, item.input.pipelinePath));
		}
		if (item.input.resumeRunId) args.push("--no-clean");
		if (item.input.simulate) args.push("--simulate", item.input.simulate);

		await mkdir(path.join(root, item.runRelativePath), { recursive: true });
		await this.writeStartingState(item);
		const child = spawn(nodeBinary, args, {
			cwd: root,
			windowsHide: true,
			env: {
				...process.env,
				FACTORY_LOCAL_ONLY: "true",
				SOFTWARE_FACTORY_ROOT: root,
			},
		});
		const running: RunningItem = {
			...item,
			child,
			pollTimer: setInterval(() => {
				void this.pollRunState(running).catch((error) => {
					this.emitLog(item, "stderr", error instanceof Error ? error.message : String(error));
				});
			}, 750),
			lastRunSignature: "",
			seenTerminalEvent: false,
		};
		this.active.set(item.runId, running);
		this.emitCapacity();
		this.emitRunEvent(item, {
			kind: "stage_started",
			runId: item.runId,
			stage: {
				stageId: "runner_subprocess",
				stageName: "Runner subprocess",
				status: "running",
				startedAt: nowIso(),
			},
		});

		child.stdout.on("data", (chunk) => this.handleLines(item, "stdout", chunk));
		child.stderr.on("data", (chunk) => this.handleLines(item, "stderr", chunk));
		child.on("error", (error) => {
			this.emitRunEvent(item, {
				kind: "run_failed",
				runId: item.runId,
				reason: error.message,
			});
		});
		child.on("close", (code) => {
			clearInterval(running.pollTimer);
			void this.pollRunState(running, true).finally(async () => {
				this.active.delete(item.runId);
				if (code !== 0 && !running.seenTerminalEvent) {
					this.emitRunEvent(item, {
						kind: "run_failed",
						runId: item.runId,
						reason: `Runner subprocess exited with code ${code ?? "unknown"}.`,
					});
				}
				this.emitCapacity();
				this.startNextQueued();
				await getFactoryReadModel().refresh();
			});
		});
	}

	private startNextQueued(): void {
		if (this.capacity().atCapacity) return;
		const next = this.queue.shift();
		if (!next) return;
		void this.startItem(next).catch((error) => {
			this.emitLog(next, "stderr", error instanceof Error ? error.message : String(error));
		});
		this.emitCapacity();
	}

	private handleLines(item: QueueItem, stream: "stdout" | "stderr", chunk: Buffer): void {
		for (const rawLine of String(chunk).split(/\r?\n/)) {
			const line = rawLine.trim();
			if (!line) continue;
			this.emitLog(item, stream, line);
		}
	}

	private async pollRunState(running: RunningItem, final = false): Promise<void> {
		const root = getFactoryReadModel().getRoot();
		const next = await readRunJson(root, running.runRelativePath);
		if (!next) return;
		const signature = JSON.stringify({
			status: next.status,
			stages: next.stages,
			finished_at: next.finished_at,
			canceledAt: next.canceledAt,
		});
		if (signature === running.lastRunSignature && !final) return;
		const previous = running.lastRunSignature
			? JSON.parse(running.lastRunSignature) as StoredRunState
			: null;
		const previousRunState = previous
			? { status: previous.status, stages: previous.stages, finished_at: previous.finished_at }
			: null;
		running.lastRunSignature = signature;
		for (const event of deltaEvents(previousRunState, next, running.runRelativePath)) {
			if (
				event.kind === "run_completed" ||
				event.kind === "run_failed" ||
				event.kind === "run_canceled"
			) {
				running.seenTerminalEvent = true;
			}
			this.emitRunEvent(running, event);
		}
	}

	private async writeQueuedState(item: QueueItem): Promise<void> {
		const root = getFactoryReadModel().getRoot();
		const runDir = path.join(root, item.runRelativePath);
		await writeAtomic(
			path.join(runDir, "run.json"),
			`${JSON.stringify(
				{
					run_id: item.runId,
					work_order_id: item.input.workOrderId,
					work_order_path: item.input.workOrderPath,
					project_id: item.input.projectId || "software-factory",
					pipeline_path: item.input.pipelinePath || null,
					provider: item.input.provider || "dry-run",
					status: "queued",
					started_at: nowIso(),
					stages: [],
					triggered_by: authorOrOperator(item.input.requestedBy),
					executed_by: {
						user: "cockpit-runner-bridge",
						role: "agent",
						isAgent: true,
						displayName: "Cockpit runner bridge",
					},
					out_dir: item.runRelativePath,
					manual_interventions: [],
				},
				null,
				2,
			)}\n`,
		);
	}

	private async writeStartingState(item: QueueItem): Promise<void> {
		const root = getFactoryReadModel().getRoot();
		const runDir = path.join(root, item.runRelativePath);
		const runJsonPath = path.join(runDir, "run.json");
		let previous: StoredRunState = {};
		if (existsSync(runJsonPath)) {
			try {
				previous = JSON.parse(await readFile(runJsonPath, "utf8")) as StoredRunState;
			} catch {
				previous = {};
			}
		}
		await writeAtomic(
			runJsonPath,
			`${JSON.stringify(
				{
					...previous,
					run_id: item.runId,
					work_order_id: item.input.workOrderId,
					work_order_path: item.input.workOrderPath,
					project_id: item.input.projectId || previous.project_id || "software-factory",
					pipeline_path: item.input.pipelinePath || previous.pipeline_path || null,
					provider: item.input.provider || previous.provider || "dry-run",
					status: "running",
					started_at: nowIso(),
					finished_at: null,
					canceledAt: undefined,
					canceledBy: undefined,
					stages: [],
					triggered_by: authorOrOperator(item.input.requestedBy),
					executed_by: {
						user: "cockpit-runner-bridge",
						role: "agent",
						isAgent: true,
						displayName: "Cockpit runner bridge",
					},
					out_dir: item.runRelativePath,
					manual_interventions: Array.isArray(previous.manual_interventions)
						? previous.manual_interventions
						: [],
				},
				null,
				2,
			)}\n`,
		);
	}

	private async writeCanceledState(item: QueueItem, canceledBy?: AuthorAttribution): Promise<void> {
		const root = getFactoryReadModel().getRoot();
		const runDir = path.join(root, item.runRelativePath);
		const runJsonPath = path.join(runDir, "run.json");
		const current = existsSync(runJsonPath)
			? JSON.parse(await readFile(runJsonPath, "utf8")) as StoredRunState
			: {};
		await writeAtomic(
			runJsonPath,
			`${JSON.stringify(
				{
					...current,
					run_id: item.runId,
					work_order_id: item.input.workOrderId,
					work_order_path: item.input.workOrderPath,
					status: "canceled",
					canceledAt: nowIso(),
					canceledBy: authorOrOperator(canceledBy),
					manual_interventions: Array.isArray(current.manual_interventions)
						? current.manual_interventions
						: [],
				},
				null,
				2,
			)}\n`,
		);
		await getFactoryReadModel().refresh();
	}

	private emitCapacity(): void {
		this.emitter.emit("event", {
			kind: "capacity_changed",
			capacity: this.capacity(),
		} satisfies FactoryRunnerBridgeEvent);
	}

	private emitLog(item: QueueItem, stream: "stdout" | "stderr", line: string): void {
		this.emitter.emit("event", {
			kind: "runner_log",
			workOrderId: item.input.workOrderId,
			runId: item.runId,
			runRelativePath: item.runRelativePath,
			stream,
			line,
		} satisfies FactoryRunnerBridgeEvent);
	}

	private emitRunEvent(item: QueueItem, event: RunStateEvent): void {
		this.emitter.emit("event", {
			kind: "run_state",
			workOrderId: item.input.workOrderId,
			runId: item.runId,
			runRelativePath: item.runRelativePath,
			event,
		} satisfies FactoryRunnerBridgeEvent);
	}
}

let singleton: FactoryRunnerBridge | null = null;

export function getFactoryRunnerBridge(): FactoryRunnerBridge {
	singleton ??= new FactoryRunnerBridge();
	return singleton;
}
