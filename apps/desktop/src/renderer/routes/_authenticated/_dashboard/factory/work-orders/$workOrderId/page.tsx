import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import type { RunStateEvent } from "lib/types/factory-operator-console";
import { useEffect, useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useActiveProjectId } from "renderer/stores/active-project";
import {
	DocumentSheet,
	FactorySection,
	SourceButton,
	StatusBadge,
	formatDate,
	parseShallowYaml,
	rowMatchesProject,
	type FactoryDocumentReference,
	type FactoryRow,
} from "../../components/FactoryView";
import {
	LDPSurface,
	useLDPSurfaceDialogue,
	type LDPDialogueAgent,
	type LDPDialogueTurn,
	type LDPMetricTone,
	type LDPStatusSummary,
} from "../../components/LDPSurface";
import { RunActionCards } from "./components/RunActionCards";
import { RunStreamingPanel } from "./components/RunStreamingPanel";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/work-orders/$workOrderId/",
)({
	validateSearch: (search) => ({
		dialogueId:
			typeof search.dialogueId === "string" ? search.dialogueId : undefined,
	}),
	component: WorkOrderDetailPage,
});

interface ManualMockupSlot {
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

interface ManualMockupManifest {
	run_id: string;
	work_order_id: string;
	source_relative_path: string;
	awaiting_packet_path: string | null;
	slots: ManualMockupSlot[];
}

const WORK_ORDER_AGENT: LDPDialogueAgent = {
	name: "ORCH",
	roleId: "ORCH",
	description:
		"Primary Work Order detail LDP steward. PRODUCT_SCOPE is attributed on scope impact.",
};

function dataText(row: FactoryRow | null | undefined, key: string, fallback = "unknown"): string {
	const value = row?.data[key];
	return typeof value === "string" && value ? value : fallback;
}

function metricToneForGate(gateState: string): LDPMetricTone {
	if (gateState === "shipped") return "success";
	if (gateState === "Yuriy gate required") return "warning";
	return "default";
}

function streamTurnForEvent(event: RunStateEvent, index: number): LDPDialogueTurn {
	const title =
		event.kind === "stage_started"
			? `${event.stage.stageName} started`
			: event.kind === "stage_completed"
				? `${event.stage.stageName} completed`
				: event.kind === "stage_failed"
					? `${event.stage.stageName} failed`
					: event.kind === "gate_required"
						? `${event.gate.type} gate required`
						: event.kind === "mockups_generated"
							? "Mockups generated"
							: event.kind === "run_completed"
								? "Run completed"
								: event.kind === "run_failed"
									? "Run failed"
									: event.kind === "run_canceled"
										? "Run canceled"
										: "Runner event";
	const body =
		event.kind === "stage_failed"
			? event.failureReason
			: event.kind === "gate_required"
				? event.gate.prompt
				: event.kind === "mockups_generated"
					? `${event.bundle.mockups.length} mockup(s) are ready for review.`
					: event.kind === "run_completed"
						? event.finalReceipt.summary
						: event.kind === "run_failed"
							? event.reason
							: event.kind === "run_canceled"
								? `Canceled by ${event.canceledBy.displayName}.`
								: "The work-order runner reported progress.";
	return {
		id: `run-stream-${event.runId}-${event.kind}-${index}`,
		kind: event.kind === "gate_required" ? "system" : "agent",
		speaker: "Runner",
		roleId: "ORCH",
		content: `${title}\n${body}`,
		timestamp: new Date().toISOString(),
		author: {
			user: "cockpit-runner-bridge",
			role: "agent",
			isAgent: true,
			displayName: "Cockpit runner bridge",
		},
	};
}

function WorkOrderDetailPage() {
	const { workOrderId } = Route.useParams();
	const [selectedSource, setSelectedSource] = useState<string | null>(null);
	const [selectedRunPath, setSelectedRunPath] = useState<string | null>(null);
	const [streamEvents, setStreamEvents] = useState<RunStateEvent[]>([]);
	const activeProjectId = useActiveProjectId();
	const search = Route.useSearch();
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const workOrder = electronTrpc.factory.workOrder.useQuery({ id: workOrderId });
	const workOrderDetail = electronTrpc.factory.workOrders.detail.useQuery(
		{ workOrderId },
		{ refetchInterval: 4000 },
	);
	const workOrderDoc = electronTrpc.factory.document.useQuery(
		{ path: workOrder.data?.source_relative_path || "" },
		{ enabled: !!workOrder.data?.source_relative_path },
	);
	const ldp = useLDPSurfaceDialogue({
		project: activeProjectId,
		surface: "work-orders",
		title: `Work Order ${workOrderId} dialogue`,
		initialDialogueId: search.dialogueId,
		onDialogueIdChange: (dialogueId) =>
			navigate({
				to: "/factory/work-orders/$workOrderId",
				params: { workOrderId },
				search: { dialogueId },
				replace: true,
			}),
	});
	const runs = electronTrpc.factory.dataset.useQuery(
		{ dataset: "runs" },
		{ refetchInterval: 5000 },
	);
	const pendingApprovals = electronTrpc.factory.pendingApprovals.useQuery(undefined, {
		refetchInterval: 5000,
	});
	const manifests = electronTrpc.factory.manualMockupManifests.useQuery(
		{ workOrderId },
		{ refetchInterval: 5000 },
	);
	const matchedRuns = useMemo(
		() =>
			(runs.data || []).filter((row: FactoryRow) => {
				const workOrderFromRun = String(row.data.work_order_id || "");
				return (
					rowMatchesProject(row, activeProjectId) &&
					(workOrderFromRun === workOrderId ||
						row.title === workOrderId ||
						row.id.toLowerCase().includes(workOrderId.toLowerCase()))
				);
			}),
		[activeProjectId, runs.data, workOrderId],
	);
	const activeRunPath =
		selectedRunPath || matchedRuns[0]?.source_relative_path.replace(/\/run\.json$/, "");
	const latestRun = matchedRuns.find(
		(run: FactoryRow) =>
			run.source_relative_path.replace(/\/run\.json$/, "") === activeRunPath,
	) || matchedRuns[0];
	const runEvidence = electronTrpc.factory.runEvidence.useQuery(
		{ runRelativePath: activeRunPath || "" },
		{ enabled: !!activeRunPath, refetchInterval: 5000 },
	);
	const parsedWorkOrder = parseShallowYaml(workOrderDoc.data?.content || "");
	const pendingApproval = pendingApprovals.data?.find(
		(item) => item.work_order_id === workOrderId,
	);
	const manifestSlots = manifests.data?.flatMap(
		(manifest: ManualMockupManifest) => manifest.slots,
	) || [];
	const completedSlots = manifestSlots.filter((slot) => slot.complete).length;
	const gateState = dataText(workOrder.data, "gate_state");
	const runMutation = electronTrpc.factory.workOrders.run.useMutation({
		onSuccess: async (result) => {
			setSelectedRunPath(result.runRelativePath);
			await Promise.all([
				workOrderDetail.refetch(),
				runs.refetch(),
				utils.factory.workOrders.detail.invalidate({ workOrderId }),
				utils.factory.workOrders.activeRuns.invalidate(),
			]);
		},
	});
	const cancelMutation = electronTrpc.factory.workOrders.cancel.useMutation({
		onSuccess: async (result) => {
			setSelectedRunPath(result.runRelativePath);
			await Promise.all([
				workOrderDetail.refetch(),
				runs.refetch(),
				utils.factory.workOrders.detail.invalidate({ workOrderId }),
			]);
		},
	});
	const resumeMutation = electronTrpc.factory.workOrders.resume.useMutation({
		onSuccess: async (result) => {
			setSelectedRunPath(result.runRelativePath);
			await Promise.all([
				workOrderDetail.refetch(),
				runs.refetch(),
				utils.factory.workOrders.detail.invalidate({ workOrderId }),
			]);
		},
	});
	electronTrpc.factory.workOrders.runEvents.useSubscription(
		{ workOrderId, runId: workOrderDetail.data?.activeRun?.runId },
		{
			onData: (event) => {
				if (event.kind === "run_state") {
					setStreamEvents((previous) => [...previous, event.event].slice(-60));
				}
				if (event.kind === "snapshot" || event.kind === "capacity_changed") {
					void workOrderDetail.refetch();
				}
			},
		},
	);
	useEffect(() => {
		setStreamEvents([]);
	}, [workOrderId]);
	const displayedTurns = useMemo(
		() => [
			...ldp.turns,
			...streamEvents.map((event, index) => streamTurnForEvent(event, index)),
		],
		[ldp.turns, streamEvents],
	);
	const status: LDPStatusSummary = {
		kind: "read_model",
		label: "Work Order Detail",
		state: ldp.state,
		sourcePath: workOrder.data?.source_relative_path,
		lastUpdated: formatDate(workOrder.data?.modified_at),
		primaryAgent: WORK_ORDER_AGENT.roleId,
		metrics: [
			{
				label: "Gate state",
				value: gateState,
				tone: metricToneForGate(gateState),
			},
			{ label: "Runs", value: matchedRuns.length },
			{ label: "Evidence files", value: runEvidence.data?.length || 0 },
			{
				label: "Runner capacity",
				value: workOrderDetail.data
					? `${workOrderDetail.data.capacity.active}/${workOrderDetail.data.capacity.maxConcurrent}`
					: "unknown",
				tone: workOrderDetail.data?.capacity.atCapacity ? "warning" : "default",
			},
			{
				label: "Manual slots",
				value: manifestSlots.length ? `${completedSlots}/${manifestSlots.length}` : 0,
				tone:
					manifestSlots.length && completedSlots === manifestSlots.length
						? "success"
						: "default",
			},
		],
		flags: [
			{ label: `Active project: ${activeProjectId}` },
			{ label: "PRODUCT_SCOPE on scope" },
			pendingApproval
				? { label: `Pending approval: ${pendingApproval.gate}`, tone: "warning" }
				: { label: "No pending approval", tone: "success" },
		],
	};

	const readPane = (
		<div className="space-y-4">
				<RunStreamingPanel
					detail={workOrderDetail.data}
					streamEvents={streamEvents}
					evidenceFiles={runEvidence.data || []}
					isLaunching={runMutation.isPending}
					isCanceling={cancelMutation.isPending}
					isResuming={resumeMutation.isPending}
					onRun={() => runMutation.mutate({ workOrderId })}
					onCancel={(runId) =>
						cancelMutation.mutate({
							runId,
							canceledBy: {
								user: "yuriy",
								role: "operator",
								isAgent: false,
								displayName: "Yuriy",
							},
						})
					}
					onResume={(runId) => resumeMutation.mutate({ workOrderId, runId })}
					onOpenSource={setSelectedSource}
				/>

				<div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
					<FactorySection title="Work order">
						<div className="grid gap-3 md:grid-cols-2">
							{[
								["Title", workOrder.data?.title || parsedWorkOrder.title],
								["Status", workOrder.data?.status || parsedWorkOrder.status],
								["Project", parsedWorkOrder.project_id],
								["Pipeline", parsedWorkOrder.pipeline_variant],
								["Tier", parsedWorkOrder.rigor_tier || parsedWorkOrder.tier],
								["Owner", parsedWorkOrder.owner],
								["Gate state", gateState],
							].map(([label, value]) => (
								<div key={label} className="rounded-md border px-3 py-2">
									<div className="text-xs uppercase text-muted-foreground">
										{label}
									</div>
									<div className="mt-1 text-sm">{value || "unknown"}</div>
								</div>
							))}
						</div>
						{workOrder.data?.source_relative_path && (
							<div className="mt-4">
								<SourceButton
									path={workOrder.data.source_relative_path}
									onOpen={setSelectedSource}
								>
									Open work-order YAML
								</SourceButton>
							</div>
						)}
					</FactorySection>

					<FactorySection title="Approval state">
						{pendingApproval ? (
							<div className="space-y-3">
								<Badge variant="outline">{pendingApproval.gate}</Badge>
								<p className="text-sm text-muted-foreground">
									This work order is waiting for owner review.
								</p>
								<Button asChild size="sm">
									<Link to="/factory/approvals" search={{ dialogueId: undefined }}>
										Open Approval Queue
									</Link>
								</Button>
							</div>
						) : (
							<p className="text-sm text-muted-foreground">
								No pending owner approval detected for this work order.
							</p>
						)}
					</FactorySection>
				</div>

				<FactorySection title="Runs" className="mt-4">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Run</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Modified</TableHead>
								<TableHead>Source</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{matchedRuns.map((run: FactoryRow) => {
								const runPath = run.source_relative_path.replace(/\/run\.json$/, "");
								return (
									<TableRow key={run.id}>
										<TableCell className="font-mono text-xs">{run.id}</TableCell>
										<TableCell>
											<StatusBadge status={run.status} />
										</TableCell>
										<TableCell>{formatDate(run.modified_at)}</TableCell>
										<TableCell>
											<Button
												size="xs"
												variant={activeRunPath === runPath ? "secondary" : "ghost"}
												onClick={() => setSelectedRunPath(runPath)}
											>
												Show evidence
											</Button>
											<SourceButton
												path={run.source_relative_path}
												onOpen={setSelectedSource}
											/>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</FactorySection>

				<FactorySection title="Receipts and evidence" className="mt-4">
					{runEvidence.data?.length ? (
						<div className="grid gap-2 md:grid-cols-2">
							{runEvidence.data.map((file: FactoryDocumentReference) => (
								<div
									key={file.source_relative_path}
									className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
								>
									<div className="min-w-0">
										<div className="truncate text-sm">{file.title}</div>
										<div className="text-xs text-muted-foreground">
											{formatDate(file.modified_at)}
										</div>
									</div>
									<SourceButton
										path={file.source_relative_path}
										onOpen={setSelectedSource}
									>
										Open
									</SourceButton>
								</div>
							))}
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							No run evidence found yet.
						</p>
					)}
				</FactorySection>

				<RunActionCards
					workOrderId={workOrderId}
					activeRunPath={activeRunPath}
					latestRun={latestRun}
					pendingApproval={pendingApproval}
					manifest={manifests.data?.[0] || null}
					evidenceFiles={runEvidence.data || []}
					onOpenSource={setSelectedSource}
				/>

				{manifests.data?.map((manifest: ManualMockupManifest) => (
					<AttachmentSurface
						key={manifest.run_id}
						manifest={manifest}
						onOpenSource={setSelectedSource}
					/>
				))}
		</div>
	);

	return (
		<>
			<LDPSurface
				title={`Work Order: ${workOrderId}`}
				description="Canonical work-order detail with run receipts, evidence, approval state, and manual mockup attachment slots."
				status={status}
				primaryAgent={WORK_ORDER_AGENT}
				turns={displayedTurns}
				readPane={readPane}
				inputValue={ldp.inputValue}
				inputPlaceholder="Ask ORCH about this work order, its gates, scope, runs, or evidence..."
				isThinking={ldp.isThinking}
				thinkingLabel={ldp.thinkingLabel}
				onInputChange={ldp.setInputValue}
				onSubmit={ldp.submit}
			/>
			<DocumentSheet
				path={selectedSource}
				title="Work-order artifact"
				onOpenChange={(open) => !open && setSelectedSource(null)}
			/>
			{ldp.streamElement}
		</>
	);
}

function AttachmentSurface({
	manifest,
	onOpenSource,
}: {
	manifest: ManualMockupManifest;
	onOpenSource: (path: string) => void;
}) {
	const completeCount = manifest.slots.filter((slot) => slot.complete).length;

	return (
		<FactorySection
			title="AttachmentSurface"
			description="Manual gpt-image-2 handoff artifact state."
			className="mt-4"
		>
			<div className="mb-3 flex items-center justify-between gap-3">
				<div className="text-sm text-muted-foreground">
					{completeCount} / {manifest.slots.length} slots complete for{" "}
					<span className="font-mono">{manifest.run_id}</span>
				</div>
				{manifest.awaiting_packet_path && (
					<SourceButton path={manifest.awaiting_packet_path} onOpen={onOpenSource}>
						Awaiting packet
					</SourceButton>
				)}
			</div>
			<div className="grid gap-4 lg:grid-cols-2">
				{manifest.slots.map((slot) => (
					<div key={slot.id} className="rounded-md border p-4">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<div className="truncate text-sm font-medium">{slot.title}</div>
								<p className="mt-1 text-xs text-muted-foreground">{slot.purpose}</p>
							</div>
							<Badge variant={slot.complete ? "secondary" : "outline"}>
								{slot.complete ? (
									<>
										<CheckCircle2 className="size-3" /> Complete
									</>
								) : (
									"Waiting"
								)}
							</Badge>
						</div>
						<div className="mt-3 rounded-md border bg-muted/20 p-3 text-xs">
							<div className="mb-2 flex items-center justify-between">
								<span className="font-medium">UIUX prompt</span>
								<SourceButton path={slot.prompt_path} onOpen={onOpenSource}>
									Open prompt
								</SourceButton>
							</div>
							<pre className="max-h-32 overflow-y-auto whitespace-pre-wrap">
								{slot.prompt_content || "Prompt file not found yet."}
							</pre>
						</div>
						<div className="mt-3 flex flex-wrap items-center gap-2">
							{slot.has_png ? (
								<SourceButton path={slot.png_path} onOpen={onOpenSource}>
									PNG
								</SourceButton>
							) : (
								<Badge variant="outline">PNG missing</Badge>
							)}
							{slot.has_evidence ? (
								<SourceButton path={slot.evidence_path} onOpen={onOpenSource}>
									Evidence
								</SourceButton>
							) : (
								<Badge variant="outline">Evidence missing</Badge>
							)}
							{slot.has_comments ? (
								<SourceButton path={slot.comments_path} onOpen={onOpenSource}>
									Comments
								</SourceButton>
							) : (
								<Badge variant="outline">Comments missing</Badge>
							)}
						</div>
					</div>
				))}
			</div>
		</FactorySection>
	);
}
