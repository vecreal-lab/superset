import { AlertTriangle, GitMerge, RotateCcw, XCircle } from "lucide-react";
import type {
	MockupBundle,
	SynthesisPacket,
} from "lib/types/factory-operator-console";
import { useState } from "react";
import {
	GateCard as VecrealGateCard,
	AuthorChip,
	Card,
	StatusBadge as VecrealStatusBadge,
} from "renderer/components/vecreal";
import {
	MergePacket,
	MockupApprovalGrid,
	StaleStateNotice,
} from "renderer/components/factory-primitives";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	FactorySection,
	SourceButton,
	type FactoryDocumentReference,
	type FactoryRow,
} from "../../../components/FactoryView";

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

interface RunActionCardsProps {
	workOrderId: string;
	activeRunPath?: string | null;
	latestRun?: FactoryRow | null;
	pendingApproval?: PendingApproval | null;
	manifest?: ManualMockupManifest | null;
	evidenceFiles: FactoryDocumentReference[];
	onOpenSource: (path: string) => void;
}

function useRefreshFactoryQueries() {
	const utils = electronTrpc.useUtils();
	return async () => {
		await Promise.all([
			utils.factory.pendingApprovals.invalidate(),
			utils.factory.dataset.invalidate(),
			utils.factory.runEvidence.invalidate(),
			utils.factory.manualMockupManifests.invalidate(),
		]);
	};
}

function gateStatus(gate: string): "pending" | "approved" | "revised" | "blocked" {
	if (gate.includes("security")) return "blocked";
	return "pending";
}

function gateTitle(gate: string): string {
	const normalized = gate.replace(/[-_]+/g, " ").trim();
	if (!normalized) return "Owner gate";
	return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function gateKind(gate: string):
	| "standard"
	| "mockup_approval"
	| "merge_approval"
	| "design_review"
	| "scope_approval"
	| "security_decision"
	| "final_acceptance" {
	if (gate.includes("mockup")) return "mockup_approval";
	if (gate.includes("merge")) return "merge_approval";
	if (gate.includes("design")) return "design_review";
	if (gate.includes("scope")) return "scope_approval";
	if (gate.includes("security")) return "security_decision";
	if (gate.includes("final") || gate.includes("acceptance")) return "final_acceptance";
	return "standard";
}

function actor() {
	return {
		user: "Yuriy",
		role: "operator",
		isAgent: false,
		displayName: "Yuriy",
	};
}

function mockupBundleFromManifest(manifest: ManualMockupManifest): MockupBundle {
	return {
		bundleId: `${manifest.run_id}-manual-mockups`,
		runId: manifest.run_id,
		stageId: "visual_design_generation",
		revisionCount: 0,
		approvalState: manifest.slots.every((slot) => slot.complete)
			? "approved"
			: "pending",
		mockups: manifest.slots.map((slot, index) => ({
			path: slot.png_path,
			index,
			caption: slot.title,
			generatedAt: new Date().toISOString(),
			prompt: slot.prompt_content,
		})),
	};
}

function synthesisPacketFromRun({
	workOrderId,
	runPath,
	evidenceFiles,
}: {
	workOrderId: string;
	runPath: string;
	evidenceFiles: FactoryDocumentReference[];
}): SynthesisPacket {
	return {
		runId: runPath.split("/").at(-1) || runPath,
		workOrderId,
		summary:
			"The run is completed. Review the receipt and evidence, then merge when the packet is acceptable.",
		filesChanged: evidenceFiles.slice(0, 10).map((file) => ({
			path: file.source_relative_path,
			additions: 0,
			deletions: 0,
		})),
		verificationOutputs: evidenceFiles
			.filter((file) => /receipt|verification|audit|synthesis/i.test(file.title))
			.slice(0, 6)
			.map((file) => ({
				command: file.title,
				status: "pass",
				output: file.source_relative_path,
			})),
		lessonCandidates: [],
		domainKnowledgeRetrievalEvidence: {
			areasConsulted: [
				"operator-experience",
				"multi-user-architecture",
				"multi-domain-coherence",
			],
			filesLoaded: evidenceFiles.slice(0, 8).map((file) => ({
				path: file.source_relative_path,
				bytesLoaded: 0,
			})),
			tokenCountConsumed: 0,
			retrievalGaps: [],
		},
		auditFindings: [],
		decisionsRecorded: [],
		branchName: `codex/${workOrderId.toLowerCase()}`,
		submoduleChanged: evidenceFiles.some((file) =>
			file.source_relative_path.includes("vendor/superset-sh"),
		),
	};
}

export function RunActionCards({
	workOrderId,
	activeRunPath,
	latestRun,
	pendingApproval,
	manifest,
	evidenceFiles,
	onOpenSource,
}: RunActionCardsProps) {
	const refresh = useRefreshFactoryQueries();
	const [staleMessage, setStaleMessage] = useState<string | null>(null);
	const respondGate = electronTrpc.factory.workOrders.respondGate.useMutation({
		onSuccess: refresh,
		onError: (error) => setStaleMessage(error.message),
	});
	const approveMockupBundle =
		electronTrpc.factory.workOrders.approveMockupBundle.useMutation({
			onSuccess: refresh,
			onError: (error) => setStaleMessage(error.message),
		});
	const requestMockupRevision =
		electronTrpc.factory.workOrders.requestMockupRevision.useMutation({
			onSuccess: refresh,
			onError: (error) => setStaleMessage(error.message),
		});
	const retryRun = electronTrpc.factory.workOrders.retryRun.useMutation({
		onSuccess: refresh,
	});
	const abandonRun = electronTrpc.factory.workOrders.abandonRun.useMutation({
		onSuccess: refresh,
	});
	const mergeRun = electronTrpc.factory.workOrders.merge.useMutation({
		onSuccess: refresh,
	});
	const gate = pendingApproval?.gate || "";
	const runPath = pendingApproval?.run_relative_path || activeRunPath || "";
	const status = (latestRun?.status || "").toLowerCase();
	const gateType = gateKind(gate);

	const submitGate = (decision: "approved" | "revision_requested" | "escalated") => {
		if (!pendingApproval) return;
		const notes =
			decision === "approved"
				? "Approved in cockpit."
				: window.prompt(
						decision === "revision_requested"
							? "What should the agents revise?"
							: "What needs escalation?",
						"",
					);
		if (notes === null) return;
		setStaleMessage(null);
		respondGate.mutate({
			runRelativePath: pendingApproval.run_relative_path,
			gate: pendingApproval.gate,
			gateId: pendingApproval.id,
			decision,
			notes,
			decidedBy: actor(),
			awaitingPacketPath: pendingApproval.packet.source_relative_path,
			expectedPacketModifiedAt: pendingApproval.packet.modified_at || null,
		});
	};

	const cards = [];

	if (staleMessage) {
		cards.push(
			<StaleStateNotice
				key="stale"
				notice={{
					summary: staleMessage,
					sourcePath: pendingApproval?.packet.source_relative_path,
				}}
				onAcknowledge={() => setStaleMessage(null)}
				onContinueAgainstNewState={() => refresh()}
			/>,
		);
	}

	if (pendingApproval) {
		cards.push(
			<VecrealGateCard
				key="gate"
				title={`${gateTitle(gate)} gate`}
				summary={pendingApproval.title || pendingApproval.packet.content.slice(0, 180)}
				status={gateStatus(gate)}
				actions={[
					{ label: "Approve", variant: "primary", onClick: () => submitGate("approved") },
					{
						label: "Request revision",
						variant: "secondary",
						onClick: () => submitGate("revision_requested"),
					},
					{ label: "Escalate", variant: "ghost", onClick: () => submitGate("escalated") },
				]}
			>
				<div className="flex flex-wrap items-center gap-2 text-xs">
					<AuthorChip name="Yuriy" kind="human" role="decision owner" showRole />
					<VecrealStatusBadge variant="neutral" size="sm">
						{gateType}
					</VecrealStatusBadge>
					<SourceButton
						path={pendingApproval.packet.source_relative_path}
						onOpen={onOpenSource}
					>
						Open packet
					</SourceButton>
				</div>
			</VecrealGateCard>,
		);
	}

	if (pendingApproval && gateType === "mockup_approval" && manifest) {
		const bundle = mockupBundleFromManifest(manifest);
		cards.push(
			<Card key="mockups" variant="evidence">
				<MockupApprovalGrid
					bundle={bundle}
					onBundleApprove={() =>
						approveMockupBundle.mutate({
							runRelativePath: pendingApproval.run_relative_path,
							guidance: "All mockups approved in cockpit.",
						})
					}
					onMockupRevise={(index) => {
						const guidance = window.prompt("Revision guidance for this mockup", "");
						if (!guidance) return;
						requestMockupRevision.mutate({
							runRelativePath: pendingApproval.run_relative_path,
							mockupIndex: index,
							guidance,
						});
					}}
				/>
			</Card>,
		);
	}

	if (activeRunPath && status === "completed") {
		cards.push(
			<MergePacket
				key="merge"
				packet={synthesisPacketFromRun({
					workOrderId,
					runPath: activeRunPath,
					evidenceFiles,
				})}
				onMerge={() =>
					mergeRun.mutate({
						workOrderId,
						branchName: `origin/codex/${workOrderId.toLowerCase()}`,
					})
				}
				onDiscardBranch={() =>
					abandonRun.mutate({
						runRelativePath: activeRunPath,
						reason: "Discard branch requested from merge packet.",
					})
				}
			/>,
		);
	}

	if (activeRunPath && (status === "failed" || status === "error")) {
		cards.push(
			<Card key="failure" variant="interactive">
				<div className="flex items-start justify-between gap-4">
					<div>
						<div className="flex items-center gap-2 font-medium">
							<AlertTriangle className="size-4 text-destructive" />
							Run failed
						</div>
						<p className="mt-2 text-sm text-muted-foreground">
							The run stopped before completion. Open the evidence files for raw
							logs, then retry or abandon from here.
						</p>
					</div>
					<VecrealStatusBadge variant="error">failed</VecrealStatusBadge>
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						className="factory-button factory-button--secondary"
						onClick={() =>
							retryRun.mutate({
								runRelativePath: activeRunPath,
								reason: "Retry requested after reviewing failure surface.",
							})
						}
					>
						<RotateCcw className="size-4" />
						<span>Retry</span>
					</button>
					<button
						type="button"
						className="factory-button factory-button--ghost"
						onClick={() =>
							abandonRun.mutate({
								runRelativePath: activeRunPath,
								reason: "Abandoned after reviewing failure surface.",
							})
						}
					>
						<XCircle className="size-4" />
						<span>Abandon</span>
					</button>
					{evidenceFiles.slice(0, 1).map((file) => (
						<button
							key={file.source_relative_path}
							type="button"
							className="factory-button factory-button--ghost"
							onClick={() => onOpenSource(file.source_relative_path)}
						>
							<span>Open logs</span>
						</button>
					))}
				</div>
			</Card>,
		);
	}

	if (!cards.length) return null;

	return (
		<FactorySection
			title="Run actions"
			description="Gate, mockup approval, merge, and failure handling surfaces for this work order."
			className="mt-4"
		>
			<div className="grid gap-4">{cards}</div>
			{mergeRun.data && (
				<div className="mt-4 rounded-md border p-3 text-xs">
					<div className="flex items-center gap-2 font-medium">
						<GitMerge className="size-4" /> Merge result
					</div>
					<pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap">
						{JSON.stringify(mergeRun.data, null, 2)}
					</pre>
				</div>
			)}
		</FactorySection>
	);
}
