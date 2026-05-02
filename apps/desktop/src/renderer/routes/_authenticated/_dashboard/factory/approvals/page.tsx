import { Badge } from "@superset/ui/badge";
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
	};
	evidence_files: FactoryDocumentReference[];
}

function ApprovalsPage() {
	const [selectedSource, setSelectedSource] = useState<string | null>(null);
	const activeProjectId = useActiveProjectId();
	const search = Route.useSearch();
	const navigate = useNavigate();
	const approvals = electronTrpc.factory.pendingApprovals.useQuery(undefined, {
		refetchInterval: 5000,
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
				to: "/factory/approvals",
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

	const readPane = (
		<div className="space-y-4">
			{activeApprovals.length ? (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Work order</TableHead>
							<TableHead>Gate</TableHead>
							<TableHead>Origin role</TableHead>
							<TableHead>Packet</TableHead>
							<TableHead>Evidence</TableHead>
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
