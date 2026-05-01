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
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	DocumentSheet,
	FactoryPage,
	FactorySection,
	FactoryTextarea,
	SourceButton,
	StatusBadge,
	formatDate,
	parseShallowYaml,
	type FactoryDocumentReference,
	type FactoryRow,
} from "../../components/FactoryView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/work-orders/$workOrderId/",
)({
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

async function fileToBase64(file: File): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	let binary = "";
	for (let index = 0; index < bytes.length; index += 0x8000) {
		const chunk = bytes.subarray(index, index + 0x8000);
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
}

function WorkOrderDetailPage() {
	const { workOrderId } = Route.useParams();
	const [selectedSource, setSelectedSource] = useState<string | null>(null);
	const [selectedRunPath, setSelectedRunPath] = useState<string | null>(null);
	const workOrder = electronTrpc.factory.workOrder.useQuery({ id: workOrderId });
	const workOrderDoc = electronTrpc.factory.document.useQuery(
		{ path: workOrder.data?.source_relative_path || "" },
		{ enabled: !!workOrder.data?.source_relative_path },
	);
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
					workOrderFromRun === workOrderId ||
					row.title === workOrderId ||
					row.id.toLowerCase().includes(workOrderId.toLowerCase())
				);
			}),
		[runs.data, workOrderId],
	);
	const activeRunPath =
		selectedRunPath || matchedRuns[0]?.source_relative_path.replace(/\/run\.json$/, "");
	const runEvidence = electronTrpc.factory.runEvidence.useQuery(
		{ runRelativePath: activeRunPath || "" },
		{ enabled: !!activeRunPath, refetchInterval: 5000 },
	);
	const parsedWorkOrder = parseShallowYaml(workOrderDoc.data?.content || "");
	const pendingApproval = pendingApprovals.data?.find(
		(item) => item.work_order_id === workOrderId,
	);

	return (
		<FactoryPage
			title={`Work Order: ${workOrderId}`}
			description="Canonical work-order detail with run receipts, evidence, approval state, and manual mockup attachment slots."
			actions={<StatusBadge status={workOrder.data?.status} />}
		>
			<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
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
									<Link to="/factory/approvals">Open Approval Queue</Link>
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

				{manifests.data?.map((manifest: ManualMockupManifest) => (
					<AttachmentSurface
						key={manifest.run_id}
						manifest={manifest}
						onOpenSource={setSelectedSource}
					/>
				))}
			</div>
			<DocumentSheet
				path={selectedSource}
				title="Work-order artifact"
				onOpenChange={(open) => !open && setSelectedSource(null)}
			/>
		</FactoryPage>
	);
}

function AttachmentSurface({
	manifest,
	onOpenSource,
}: {
	manifest: ManualMockupManifest;
	onOpenSource: (path: string) => void;
}) {
	const [comments, setComments] = useState<Record<string, string>>({});
	const [status, setStatus] = useState<string>("");
	const utils = electronTrpc.useUtils();
	const saveAttachment = electronTrpc.factory.saveManualMockupAttachment.useMutation({
		onSuccess: async () => {
			await utils.factory.manualMockupManifests.invalidate({
				workOrderId: manifest.work_order_id,
			});
		},
	});
	const completeCount = manifest.slots.filter((slot) => slot.complete).length;

	const handleFile = async (slot: ManualMockupSlot, file: File) => {
		const pngBase64 = await fileToBase64(file);
		await saveAttachment.mutateAsync({
			runId: manifest.run_id,
			viewId: slot.id,
			pngBase64,
			fileName: file.name,
			comments: comments[slot.id] || "",
		});
	};

	return (
		<FactorySection
			title="AttachmentSurface"
			description="Manual gpt-image-2 handoff. Add PNGs and free-form comments; evidence JSON is synthesized by the cockpit."
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
						<div
							className="mt-3 rounded-md border border-dashed p-4 text-center text-sm"
							onDragOver={(event) => event.preventDefault()}
							onDrop={(event) => {
								event.preventDefault();
								const file = event.dataTransfer.files.item(0);
								if (file) void handleFile(slot, file);
							}}
						>
							<Upload className="mx-auto mb-2 size-5 text-muted-foreground" />
							<label className="cursor-pointer underline-offset-4 hover:underline">
								Drop PNG here or choose file
								<input
									type="file"
									accept="image/png"
									className="hidden"
									onChange={(event) => {
										const file = event.currentTarget.files?.item(0);
										if (file) void handleFile(slot, file);
										event.currentTarget.value = "";
									}}
								/>
							</label>
						</div>
						<div className="mt-3">
							<FactoryTextarea
								value={comments[slot.id] || ""}
								placeholder="Free-form Yuriy comments for this mockup."
								onChange={(value) =>
									setComments((current) => ({ ...current, [slot.id]: value }))
								}
							/>
						</div>
					</div>
				))}
			</div>
			<div className="mt-4 flex items-center gap-3">
				<Button
					type="button"
					disabled={completeCount !== manifest.slots.length}
					onClick={() =>
						setStatus(
							completeCount === manifest.slots.length
								? "All expected manual mockup artifacts are present. The runner can resume validation."
								: "Complete every slot before validation.",
						)
					}
				>
					Submit for UIUX validation
				</Button>
				{saveAttachment.error && (
					<span className="text-sm text-destructive">
						{saveAttachment.error.message}
					</span>
				)}
				{status && <span className="text-sm text-muted-foreground">{status}</span>}
			</div>
		</FactorySection>
	);
}
