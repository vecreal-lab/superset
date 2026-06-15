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
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useActiveProjectId } from "renderer/stores/active-project";
import {
	DocumentSheet,
	SourceButton,
	WorkOrderLink,
	rowMatchesProject,
	type FactoryDocumentReference,
	type FactoryRow,
} from "../components/FactoryView";
import {
	LDPSurface,
	useLDPSurfaceDialogue,
	type LDPDialogueAgent,
	type LDPStatusSummary,
} from "../components/LDPSurface";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/approvals/",
)({
	validateSearch: (search) => ({
		dialogueId:
			typeof search.dialogueId === "string" ? search.dialogueId : undefined,
	}),
	component: ApprovalsPage,
});

const APPROVALS_AGENT: LDPDialogueAgent = {
	name: "AUDIT",
	roleId: "AUDIT",
	description:
		"Primary approval queue steward. Originating work-order roles are displayed where the read model can derive them.",
};

interface PendingApproval {
	id: string;
	work_order_id: string;
	title: string;
	gate: string;
	run_id: string;
	run_relative_path: string;
	packet: {
		content: string;
		source_relative_path: string;
		modified_at?: string | null;
	};
	evidence_files: FactoryDocumentReference[];
}

function ApprovalMotionStyles() {
	return (
		<style>
			{`
				@keyframes p14-active-light {
					0%, 100% { box-shadow: 0 0 0 0 hsl(var(--primary) / 0); }
					32% { box-shadow: 0 0 0 8px hsl(var(--primary) / 0.18); }
				}
				@keyframes p14-active-dark {
					0%, 100% { box-shadow: 0 0 0 0 hsl(var(--primary) / 0); }
					40% { box-shadow: 0 0 0 8px hsl(var(--primary) / 0.24); }
				}
				@keyframes p14-check-draw {
					from { stroke-dashoffset: 100; }
					to { stroke-dashoffset: 0; }
				}
				.p14-active-light { animation: p14-active-light 1.8s ease-in-out infinite; }
				.dark .p14-active-dark { animation: p14-active-dark 1.8s ease-in-out infinite; }
				.p14-check {
					stroke-dasharray: 100;
					stroke-dashoffset: 100;
					animation: p14-check-draw 0.75s ease-out forwards;
				}
				@media (prefers-reduced-motion: reduce) {
					.p14-active-light,
					.dark .p14-active-dark,
					.p14-check {
						animation: none;
						stroke-dashoffset: 0;
					}
				}
			`}
		</style>
	);
}

function ApprovalWorkflowRail({ approval }: { approval: PendingApproval }) {
	const steps = [
		{ label: "Packet", state: "done" },
		{
			label: approval.evidence_files.length ? "Evidence" : "Evidence pending",
			state: approval.evidence_files.length ? "done" : "pending",
		},
		{ label: "Yuriy review", state: "active" },
	];

	return (
		<div
			className="mt-3 space-y-2"
			aria-label={`Approval workflow for ${approval.work_order_id}`}
		>
			{steps.map((step, index) => (
				<div key={step.label} className="flex items-center gap-2 text-xs">
					<span
						className={
							step.state === "active"
								? "p14-active-light p14-active-dark flex size-7 items-center justify-center rounded-full border-2 border-primary text-primary"
								: step.state === "done"
									? "flex size-7 items-center justify-center rounded-full bg-emerald-600 text-white"
									: "flex size-7 items-center justify-center rounded-full border text-muted-foreground"
						}
					>
						{step.state === "done" ? (
							<svg
								aria-hidden="true"
								className="size-4"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="3"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path className="p14-check" pathLength="100" d="M20 6 9 17l-5-5" />
							</svg>
						) : (
							<span className="font-mono text-[10px]">{index + 1}</span>
						)}
					</span>
					<span>{step.label}</span>
					{step.state === "active" && (
						<Badge variant="secondary">Awaiting you</Badge>
					)}
				</div>
			))}
		</div>
	);
}

function ApprovalsPage() {
	const search = Route.useSearch();
	return <ApprovalQueueContent search={search} navigateTo="/factory/approvals" />;
}

export function ApprovalQueueContent({
	search,
	navigateTo,
}: {
	search: { dialogueId?: string };
	navigateTo: "/factory/approvals" | "/factory/approval-queue";
}) {
	const [selectedSource, setSelectedSource] = useState<string | null>(null);
	const activeProjectId = useActiveProjectId();
	const navigate = useNavigate();
	const approvals = electronTrpc.factory.pendingApprovals.useQuery(undefined, {
		refetchInterval: 5000,
	});
	const utils = electronTrpc.useUtils();
	const respondGate = electronTrpc.factory.workOrders.respondGate.useMutation({
		onSuccess: async () => {
			await Promise.all([
				utils.factory.pendingApprovals.invalidate(),
				utils.factory.dataset.invalidate(),
			]);
		},
	});
	const workOrders = electronTrpc.factory.dataset.useQuery(
		{ dataset: "work_orders" },
		{ refetchInterval: 5000 },
	);
	const ldp = useLDPSurfaceDialogue({
		project: activeProjectId,
		surface: "approvals",
		title: "Approvals dialogue",
		initialDialogueId: search.dialogueId,
		onDialogueIdChange: (dialogueId) =>
			navigate({
				to: navigateTo,
				search: { dialogueId },
				replace: true,
			}),
	});
	const activeApprovals = useMemo(() => {
		const workOrderRows = workOrders.data || [];
		return (approvals.data || []).filter((approval: PendingApproval) => {
			const matchingWorkOrder = workOrderRows.find(
				(row: FactoryRow) => row.id === approval.work_order_id,
			);
			return matchingWorkOrder
				? rowMatchesProject(matchingWorkOrder, activeProjectId)
				: approval.run_relative_path.includes(activeProjectId);
		});
	}, [activeProjectId, approvals.data, workOrders.data]);
	const workOrderRows = workOrders.data || [];
	const originRoleFor = (approval: PendingApproval): string => {
		const row = workOrderRows.find(
			(candidate: FactoryRow) => candidate.id === approval.work_order_id,
		);
		const value = row?.data.originating_role || row?.data.owner;
		return typeof value === "string" && value ? value : "unknown";
	};
	const originRoles = [
		...new Set(activeApprovals.map((approval: PendingApproval) => originRoleFor(approval))),
	];
	const evidenceCount = activeApprovals.reduce(
		(total: number, approval: PendingApproval) =>
			total + approval.evidence_files.length,
		0,
	);
	const status: LDPStatusSummary = {
		kind: "read_model",
		label: "Approvals",
		state: ldp.state,
		sourcePath: "runs/*/awaiting*.md",
		primaryAgent: APPROVALS_AGENT.roleId,
		metrics: [
			{
				label: "Pending approvals",
				value: activeApprovals.length,
				tone: activeApprovals.length > 0 ? "warning" : "success",
			},
			{
				label: "Gate types",
				value: new Set(
					activeApprovals.map((approval: PendingApproval) => approval.gate),
				).size,
			},
			{ label: "Evidence files", value: evidenceCount },
			{ label: "Origin roles", value: originRoles.length },
		],
		flags: [
			{ label: `Active project: ${activeProjectId}` },
			{ label: `Origin: ${originRoles.slice(0, 3).join(", ") || "none"}` },
		],
	};
	const submitApproval = (
		approval: PendingApproval,
		decision: "approved" | "revision_requested",
	) => {
		const notes =
			decision === "approved"
				? "Approved in cockpit approval queue."
				: window.prompt("What should the agents revise?", "");
		if (notes === null) return;
		respondGate.mutate({
			runRelativePath: approval.run_relative_path,
			gate: approval.gate,
			gateId: approval.id,
			decision,
			notes,
			decidedBy: {
				user: "Yuriy",
				role: "operator",
				isAgent: false,
				displayName: "Yuriy",
			},
			awaitingPacketPath: approval.packet.source_relative_path,
			expectedPacketModifiedAt: approval.packet.modified_at || null,
		});
	};

	const readPane = (
		<div className="space-y-4">
			<ApprovalMotionStyles />
			{activeApprovals.length ? (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Work order</TableHead>
							<TableHead>Gate</TableHead>
							<TableHead>Origin role</TableHead>
							<TableHead>Packet</TableHead>
							<TableHead>Evidence</TableHead>
							<TableHead>Action</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{activeApprovals.map((approval: PendingApproval) => (
							<TableRow key={approval.id}>
								<TableCell className="max-w-56 whitespace-normal">
									<WorkOrderLink id={approval.work_order_id} />
									<div className="mt-1 font-mono text-xs text-muted-foreground">
										{approval.run_id}
									</div>
									<ApprovalWorkflowRail approval={approval} />
								</TableCell>
								<TableCell>
									<Badge variant="outline">{approval.gate}</Badge>
								</TableCell>
								<TableCell>
									<Badge variant="secondary">{originRoleFor(approval)}</Badge>
								</TableCell>
								<TableCell className="max-w-xl whitespace-normal">
									<div className="max-h-72 overflow-y-auto rounded-md border p-3">
										<MarkdownRenderer
											content={approval.packet.content}
											className="h-auto overflow-visible"
										/>
									</div>
									<SourceButton
										path={approval.packet.source_relative_path}
										onOpen={setSelectedSource}
									/>
								</TableCell>
								<TableCell className="max-w-64 whitespace-normal">
									<div className="flex flex-col items-start gap-1">
										{approval.evidence_files.slice(0, 8).map((file) => (
											<SourceButton
												key={file.source_relative_path}
												path={file.source_relative_path}
												onOpen={setSelectedSource}
											>
												{file.title}
											</SourceButton>
										))}
										{approval.evidence_files.length > 8 && (
											<span className="text-xs text-muted-foreground">
												+{approval.evidence_files.length - 8} more
											</span>
										)}
									</div>
								</TableCell>
								<TableCell>
									<div className="flex flex-col gap-2">
										<Button
											size="sm"
											onClick={() => submitApproval(approval, "approved")}
										>
											Approve
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() =>
												submitApproval(approval, "revision_requested")
											}
										>
											Request revision
										</Button>
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			) : (
				<div className="rounded-md border border-dashed p-6 text-sm">
					<div className="font-medium">No pending owner approvals</div>
					<p className="mt-2 text-muted-foreground">
						When a run writes an awaiting-review packet and no matching approval
						YAML exists, it will appear here.
					</p>
				</div>
			)}
		</div>
	);

	return (
		<>
			<LDPSurface
				title="Approval Queue"
				description="Owner-review gates for the active project, with approval packets, evidence, and origin-role attribution."
				status={status}
				primaryAgent={APPROVALS_AGENT}
				turns={ldp.turns}
				readPane={readPane}
				inputValue={ldp.inputValue}
				inputPlaceholder="Ask AUDIT about an approval packet, evidence, send-back risk, or gate decision..."
				isThinking={ldp.isThinking}
				thinkingLabel={ldp.thinkingLabel}
				onInputChange={ldp.setInputValue}
				onSubmit={ldp.submit}
			/>
			<DocumentSheet
				path={selectedSource}
				title="Approval evidence"
				onOpenChange={(open) => !open && setSelectedSource(null)}
			/>
			{ldp.streamElement}
		</>
	);
}
