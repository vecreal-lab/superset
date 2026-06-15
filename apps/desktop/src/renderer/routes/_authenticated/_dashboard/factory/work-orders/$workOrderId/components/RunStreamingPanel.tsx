import { Play, RotateCcw, Square, TimerReset } from "lucide-react";
import type { Mockup, RunStateEvent } from "lib/types/factory-operator-console";
import {
	AuthorChip,
	Card,
	PipelineStrip,
	StatusBadge as VecrealStatusBadge,
	type PipelineStage as VecrealPipelineStage,
} from "renderer/components/vecreal";
import {
	MockupRenderer,
	StaleStateNotice,
} from "renderer/components/factory-primitives";
import {
	FactorySection,
	SourceButton,
	type FactoryDocumentReference,
} from "../../../components/FactoryView";

interface DetailPipelineStage {
	stageId: string;
	role: string;
	label: string;
	hasOwnerGate: boolean;
	isParallelizable: boolean;
}

interface DetailActiveStage {
	id: string;
	stageId: string;
	label: string;
	role: string;
	state: "completed" | "current" | "upcoming" | "failed" | "gated";
	stageIndex: number;
	summary: string | null;
	outputPath: string | null;
	promptPath: string | null;
	receiptPath: string | null;
	startedAt: string | null;
	completedAt: string | null;
}

interface DetailActiveRun {
	runId: string;
	runRelativePath: string;
	state: string;
	status: string | null;
	staleStateNotice: {
		surface: string;
		changedAt: string;
		changeSummary: string;
		sourcePath: string;
	} | null;
	stages: DetailActiveStage[];
}

interface RunHistoryItem {
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

interface WorkOrderDetail {
	pipelineStages: DetailPipelineStage[];
	activeRun: DetailActiveRun | null;
	runHistory: RunHistoryItem[];
	capacity: {
		maxConcurrent: number;
		active: number;
		queued: number;
		atCapacity: boolean;
	};
}

interface RunStreamingPanelProps {
	detail?: WorkOrderDetail | null;
	streamEvents: RunStateEvent[];
	evidenceFiles: FactoryDocumentReference[];
	isLaunching: boolean;
	isCanceling: boolean;
	isResuming: boolean;
	onRun: () => void;
	onCancel: (runId: string) => void;
	onResume: (runId: string) => void;
	onOpenSource: (path: string) => void;
}

function statusVariant(status?: string | null):
	| "success"
	| "warning"
	| "error"
	| "info"
	| "neutral" {
	const normalized = (status || "").toLowerCase();
	if (normalized.includes("complete") || normalized.includes("pass")) return "success";
	if (normalized.includes("fail") || normalized.includes("error")) return "error";
	if (normalized.includes("cancel")) return "neutral";
	if (normalized.includes("running") || normalized.includes("queued")) return "warning";
	if (normalized.includes("approval") || normalized.includes("gate")) return "info";
	return "neutral";
}

function pipelineState(stage: DetailActiveStage): VecrealPipelineStage["state"] {
	if (stage.state === "completed") return "complete";
	if (stage.state === "failed") return "failed";
	if (stage.state === "current" || stage.state === "gated") return "active";
	return "pending";
}

function plannedPipeline(detail?: WorkOrderDetail | null): VecrealPipelineStage[] {
	if (!detail) return [];
	if (detail.activeRun?.stages.length) {
		return detail.activeRun.stages.map((stage) => ({
			id: stage.id,
			label: stage.label,
			state: pipelineState(stage),
		}));
	}
	return detail.pipelineStages.map((stage) => ({
		id: stage.stageId,
		label: stage.label,
		state: "pending",
	}));
}

function eventTitle(event: RunStateEvent): string {
	if (event.kind === "stage_started") return `${event.stage.stageName} started`;
	if (event.kind === "stage_completed") return `${event.stage.stageName} completed`;
	if (event.kind === "stage_failed") return `${event.stage.stageName} failed`;
	if (event.kind === "gate_required") return `${event.gate.type} gate required`;
	if (event.kind === "mockups_generated") return "Mockups generated";
	if (event.kind === "manual_intervention_logged") return "Manual intervention logged";
	if (event.kind === "run_completed") return "Run completed";
	if (event.kind === "run_failed") return "Run failed";
	if (event.kind === "run_canceled") return "Run canceled";
	return "Run event";
}

function eventStatus(event: RunStateEvent): string {
	if ("stage" in event) return event.stage.status;
	if (event.kind === "gate_required") return "paused_for_gate";
	if (event.kind === "mockups_generated") return event.bundle.approvalState;
	if (event.kind === "run_completed") return "completed";
	if (event.kind === "run_failed") return "failed";
	if (event.kind === "run_canceled") return "canceled";
	return "logged";
}

function eventSummary(event: RunStateEvent): string {
	if (event.kind === "stage_started") return "The runner entered this stage.";
	if (event.kind === "stage_completed") return "The runner wrote stage outputs and receipt evidence.";
	if (event.kind === "stage_failed") return event.failureReason;
	if (event.kind === "gate_required") return event.gate.prompt;
	if (event.kind === "mockups_generated") return `${event.bundle.mockups.length} mockup(s) are ready for review.`;
	if (event.kind === "manual_intervention_logged") return event.intervention.reason;
	if (event.kind === "run_completed") return event.finalReceipt.summary;
	if (event.kind === "run_failed") return event.reason;
	if (event.kind === "run_canceled") return `Canceled by ${event.canceledBy.displayName}.`;
	return "Runner event received.";
}

function eventOutputs(event: RunStateEvent): string[] {
	if (event.kind === "stage_completed") return event.outputs;
	if ("stage" in event) return event.stage.outputs || [];
	if (event.kind === "run_completed") {
		return event.finalReceipt.verificationOutputs
			.map((output) => output.output)
			.filter((value): value is string => Boolean(value));
	}
	return [];
}

function eventMockups(event: RunStateEvent): Mockup[] {
	if (event.kind === "mockups_generated") return event.bundle.mockups;
	return [];
}

export function RunStreamingPanel({
	detail,
	streamEvents,
	evidenceFiles,
	isLaunching,
	isCanceling,
	isResuming,
	onRun,
	onCancel,
	onResume,
	onOpenSource,
}: RunStreamingPanelProps) {
	const pipeline = plannedPipeline(detail);
	const activeRun = detail?.activeRun;
	const latestRun = detail?.runHistory[0] || null;
	const latestStatus = activeRun?.status || activeRun?.state || latestRun?.status || "not started";
	const canResume =
		latestRun &&
		/(failed|canceled|escalated)/i.test(String(latestRun.status || ""));
	const runTitle = detail?.capacity.atCapacity
		? `Two work orders are already active; this run will queue behind ${detail.capacity.queued} queued item(s).`
		: "Start this work order through the factory runner.";

	return (
		<div className="space-y-4">
			<FactorySection
				title="Pipeline preview"
				description="Planned handoff chain before launch, then live stage state once the runner starts."
			>
				<div className="space-y-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex flex-wrap items-center gap-2">
							<VecrealStatusBadge variant={statusVariant(latestStatus)} isLive={/running|queued/i.test(String(latestStatus))}>
								{latestStatus}
							</VecrealStatusBadge>
							<VecrealStatusBadge variant={detail?.capacity.atCapacity ? "warning" : "neutral"}>
								{detail?.capacity.active ?? 0}/{detail?.capacity.maxConcurrent ?? 2} running
							</VecrealStatusBadge>
							{detail?.capacity.queued ? (
								<VecrealStatusBadge variant="info">
									{detail.capacity.queued} queued
								</VecrealStatusBadge>
							) : null}
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<button
								type="button"
								className="factory-button factory-button--secondary"
								title={runTitle}
								disabled={isLaunching}
								onClick={onRun}
							>
								<Play className="size-4" />
								<span>{detail?.capacity.atCapacity ? "Queue run" : "Run"}</span>
							</button>
							{activeRun ? (
								<button
									type="button"
									className="factory-button factory-button--ghost"
									disabled={isCanceling}
									onClick={() => onCancel(activeRun.runId)}
								>
									<Square className="size-4" />
									<span>Cancel</span>
								</button>
							) : null}
							{canResume ? (
								<button
									type="button"
									className="factory-button factory-button--ghost"
									disabled={isResuming}
									onClick={() => onResume(latestRun.runId.split("/").at(-1) || latestRun.runId)}
								>
									<RotateCcw className="size-4" />
									<span>Resume</span>
								</button>
							) : null}
						</div>
					</div>
					{pipeline.length ? (
						<PipelineStrip stages={pipeline} variant="full" ariaLabel="Work order pipeline preview" />
					) : (
						<p className="text-sm text-muted-foreground">
							No pipeline stages were parsed for this work order yet.
						</p>
					)}
				</div>
			</FactorySection>

			{activeRun?.staleStateNotice ? (
				<StaleStateNotice
					notice={{
						summary: activeRun.staleStateNotice.changeSummary,
						sourcePath: activeRun.staleStateNotice.sourcePath,
					}}
				/>
			) : null}

			<FactorySection
				title="Stage stream"
				description="Runner events are mirrored as readable chat-style turns and evidence cards."
			>
				{streamEvents.length ? (
					<div className="space-y-3">
						{streamEvents.slice(-12).map((event, index) => (
							<Card key={`${event.kind}-${index}`} variant="compact">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0 space-y-2">
										<div className="flex flex-wrap items-center gap-2">
											<AuthorChip
												name={event.kind.startsWith("run_") ? "RUNNER" : "ORCH"}
												kind="agent"
												role="work order runner"
												showRole
											/>
											<VecrealStatusBadge variant={statusVariant(eventStatus(event))}>
												{eventStatus(event)}
											</VecrealStatusBadge>
										</div>
										<div>
											<div className="text-sm font-medium">{eventTitle(event)}</div>
											<p className="mt-1 text-sm text-muted-foreground">
												{eventSummary(event)}
											</p>
										</div>
									</div>
									<TimerReset className="mt-1 size-4 text-muted-foreground" />
								</div>
								{eventOutputs(event).length ? (
									<div className="flex flex-wrap gap-2">
										{eventOutputs(event).slice(0, 4).map((output) => (
											<SourceButton key={output} path={output} onOpen={onOpenSource}>
												Output
											</SourceButton>
										))}
									</div>
								) : null}
								{eventMockups(event).length ? (
									<div className="grid gap-3 md:grid-cols-2">
										{eventMockups(event).map((mockup) => (
											<MockupRenderer key={`${mockup.path}-${mockup.index}`} mockup={mockup} size="inline" />
										))}
									</div>
								) : null}
							</Card>
						))}
					</div>
				) : evidenceFiles.length ? (
					<p className="text-sm text-muted-foreground">
						No live events in this cockpit session yet. Existing receipts are listed below.
					</p>
				) : (
					<p className="text-sm text-muted-foreground">
						Start or resume a run to stream stage events here.
					</p>
				)}
			</FactorySection>
		</div>
	);
}
