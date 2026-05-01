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
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useActiveProjectId } from "renderer/stores/active-project";
import {
	DocumentSheet,
	FactoryPage,
	FactoryTextarea,
	SourceButton,
	WorkOrderLink,
	rowMatchesProject,
	type FactoryDocumentReference,
	type FactoryRow,
} from "../components/FactoryView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/approvals/",
)({
	component: ApprovalsPage,
});

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
	const [notesById, setNotesById] = useState<Record<string, string>>({});
	const activeProjectId = useActiveProjectId();
	const utils = electronTrpc.useUtils();
	const approvals = electronTrpc.factory.pendingApprovals.useQuery(undefined, {
		refetchInterval: 5000,
	});
	const workOrders = electronTrpc.factory.dataset.useQuery(
		{ dataset: "work_orders" },
		{ refetchInterval: 5000 },
	);
	const writeApproval = electronTrpc.factory.writeApproval.useMutation({
		onSuccess: async () => {
			await Promise.all([
				utils.factory.pendingApprovals.invalidate(),
				utils.factory.dataset.invalidate({ dataset: "approvals" }),
				utils.factory.dataset.invalidate({ dataset: "runs" }),
			]);
		},
	});

	const submit = (approval: PendingApproval, status: "approved" | "revision_requested") => {
		writeApproval.mutate({
			runRelativePath: approval.run_relative_path,
			gate: approval.gate,
			status,
			notes: notesById[approval.id] || "",
		});
	};
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

	return (
		<FactoryPage
			title="Approval Queue"
			description="Owner-review gates for the active project. Approve or send back with free-form notes; the cockpit writes the approval YAML."
		>
			<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
				{activeApprovals.length ? (
					<div className="space-y-6">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Work order</TableHead>
									<TableHead>Gate</TableHead>
									<TableHead>Packet</TableHead>
									<TableHead>Evidence</TableHead>
									<TableHead>Decision</TableHead>
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
										<TableCell className="w-80 whitespace-normal">
											<FactoryTextarea
												value={notesById[approval.id] || ""}
												placeholder="Free-form notes for the approval file."
												onChange={(value) =>
													setNotesById((current) => ({
														...current,
														[approval.id]: value,
													}))
												}
											/>
											<div className="mt-2 flex gap-2">
												<Button
													size="sm"
													disabled={writeApproval.isPending}
													onClick={() => submit(approval, "approved")}
												>
													Approve
												</Button>
												<Button
													size="sm"
													variant="outline"
													disabled={writeApproval.isPending}
													onClick={() => submit(approval, "revision_requested")}
												>
													Send back
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				) : (
					<div className="rounded-md border border-dashed p-6 text-sm">
						<div className="font-medium">No pending owner approvals</div>
						<p className="mt-2 text-muted-foreground">
							When a run writes an awaiting-review packet and no matching
							approval YAML exists, it will appear here.
						</p>
					</div>
				)}
				{writeApproval.error && (
					<div className="mt-4 rounded-md border border-destructive p-3 text-sm text-destructive">
						{writeApproval.error.message}
					</div>
				)}
			</div>
			<DocumentSheet
				path={selectedSource}
				title="Approval evidence"
				onOpenChange={(open) => !open && setSelectedSource(null)}
			/>
		</FactoryPage>
	);
}
