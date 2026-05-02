import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "@superset/ui/sonner";
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useActiveProjectId } from "renderer/stores/active-project";
import {
	DocumentSheet,
	EmptyFactoryState,
	FactorySection,
	SourceButton,
	StatusBadge,
	formatDate,
	rowMatchesProject,
	type FactoryRow,
} from "../components/FactoryView";
import {
	LDPSurface,
	useLDPSurfaceDialogue,
	type LDPDialogueAgent,
	type LDPStatusSummary,
} from "../components/LDPSurface";
import {
	StrategyCandidateList,
	type StrategyLedgerCandidate,
} from "../components/StrategyCandidateList";
import { StrategyLedgerPromotePreview } from "../components/StrategyLedgerPromotePreview";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/strategy-pulse/",
)({
	validateSearch: (search) => ({
		dialogueId:
			typeof search.dialogueId === "string" ? search.dialogueId : undefined,
	}),
	component: StrategyPulsePage,
});

const STRATEGY_AGENT: LDPDialogueAgent = {
	name: "STRATEGY_STEWARD",
	roleId: "STRATEGY_STEWARD",
	description: "Primary Strategy Pulse steward.",
};

function StrategyPulsePage() {
	const [selectedSource, setSelectedSource] = useState<string | null>(null);
	const [candidateToPromote, setCandidateToPromote] =
		useState<StrategyLedgerCandidate | null>(null);
	const activeProjectId = useActiveProjectId();
	const search = Route.useSearch();
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const roles = electronTrpc.factory.dataset.useQuery({ dataset: "roles" });
	const runs = electronTrpc.factory.dataset.useQuery(
		{ dataset: "runs" },
		{ refetchInterval: 5000 },
	);
	const ledgerCandidates =
		electronTrpc.factory.strategyPulse.listLedgerCandidates.useQuery(
			{ include_resolved: true },
			{ refetchInterval: 5000 },
		);
	const declineCandidate =
		electronTrpc.factory.strategyPulse.declineCandidate.useMutation();
	const ldp = useLDPSurfaceDialogue({
		project: activeProjectId,
		surface: "strategy-pulse",
		title: "Strategy Pulse dialogue",
		initialDialogueId: search.dialogueId,
		onDialogueIdChange: (dialogueId) =>
			navigate({
				to: "/factory/strategy-pulse",
				search: { dialogueId },
				replace: true,
			}),
	});
	const strategyRole = roles.data?.find(
		(row: FactoryRow) => row.id === "STRATEGY_STEWARD",
	);
	const pulseRuns = useMemo(
		() =>
			(runs.data || []).filter(
				(row: FactoryRow) =>
					rowMatchesProject(row, activeProjectId) &&
					`${row.id} ${row.title} ${row.source_relative_path}`.includes(
						"STRATEGY_STEWARD",
					),
			),
		[activeProjectId, runs.data],
	);
	const lanes = [
		"Moat health",
		"Positioning drift",
		"Branding opportunities",
		"Selling opportunities",
		"Internal product improvement",
		"Horizontal opportunity pulse",
		"Vertical opportunity pulse",
		"Horizontal/vertical tension audit",
		"Wedge-vs-expansion tradeoffs",
		"Operating principles audit + build-vs-compose matrix drift",
		"Open strategic questions for Yuriy",
	];
	const pendingCandidateCount = (ledgerCandidates.data || []).filter(
		(candidate: StrategyLedgerCandidate) =>
			candidate.status === "pending_review",
	).length;
	const latestPulse = pulseRuns
		.slice()
		.sort((a, b) => String(b.modified_at || "").localeCompare(String(a.modified_at || "")))
		[0];
	const status: LDPStatusSummary = {
		kind: "read_model",
		label: "Strategy Pulse",
		state: ldp.state,
		sourcePath: latestPulse?.source_relative_path || strategyRole?.source_relative_path,
		lastUpdated: formatDate(latestPulse?.modified_at || strategyRole?.modified_at),
		primaryAgent: STRATEGY_AGENT.roleId,
		metrics: [
			{ label: "Pulse runs", value: pulseRuns.length },
			{ label: "Strategy lanes", value: lanes.length },
			{
				label: "Intake candidates",
				value: pendingCandidateCount,
				tone: pendingCandidateCount ? "warning" : "default",
			},
			{
				label: "Latest status",
				value: latestPulse?.status || "not run",
				tone: latestPulse ? "default" : "warning",
			},
			{
				label: "Role source",
				value: strategyRole ? "available" : "missing",
				tone: strategyRole ? "success" : "danger",
			},
		],
		flags: [{ label: `Active project: ${activeProjectId}` }],
	};

	const handleAskCandidate = (candidate: StrategyLedgerCandidate) => {
		ldp.setInputValue(
			`@${candidate.id} — what's the moat implication?\n\nFinding: ${candidate.finding}\nSource intake: ${candidate.source_intake}`,
		);
	};

	const handleDeclineCandidate = async (candidate: StrategyLedgerCandidate) => {
		const rationale = window.prompt(
			"Optional free-form rationale for declining this strategy candidate:",
			candidate.decline_reason || "",
		);
		if (rationale === null) return;
		try {
			await declineCandidate.mutateAsync({
				candidate_id: candidate.id,
				rationale,
			});
			await utils.factory.strategyPulse.listLedgerCandidates.invalidate();
			toast.success("Strategy candidate declined.");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Decline failed.");
		}
	};

	const readPane = (
		<div className="space-y-6">
			{pulseRuns.length === 0 ? (
				<EmptyFactoryState
					title="No strategy pulse available yet"
					body="STRATEGY_STEWARD runs weekly and on pre-build/post-build events after project work begins. The lanes below are ready for the first pulse."
					sourcePath={strategyRole?.source_relative_path}
					onOpenSource={setSelectedSource}
				/>
			) : (
				<FactorySection title="Latest strategy pulse">
					<div className="space-y-2">
						{pulseRuns.map((run: FactoryRow) => (
							<div
								key={run.id}
								className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
							>
								<div className="min-w-0">
									<div className="truncate text-sm font-medium">{run.title}</div>
									<SourceButton
										path={run.source_relative_path}
										onOpen={setSelectedSource}
									/>
								</div>
								<StatusBadge status={run.status} />
							</div>
						))}
					</div>
				</FactorySection>
			)}

			<FactorySection
				title="Strategy Ledger candidates"
				description="Intake-sourced strategic signals awaiting STRATEGY_STEWARD review."
			>
				<StrategyCandidateList
					candidates={(ledgerCandidates.data || []) as StrategyLedgerCandidate[]}
					isLoading={ledgerCandidates.isLoading}
					errorMessage={ledgerCandidates.error?.message}
					onAskCandidate={handleAskCandidate}
					onPromoteCandidate={setCandidateToPromote}
					onDeclineCandidate={handleDeclineCandidate}
					onOpenSource={setSelectedSource}
				/>
			</FactorySection>

			<div className="grid gap-4 lg:grid-cols-2">
				{lanes.map((lane) => (
					<FactorySection
						key={lane}
						title={lane}
						description="This lane renders cited Strategy Pulse claims once STRATEGY_STEWARD runs."
					>
						<p className="text-sm text-muted-foreground">
							Awaiting first STRATEGY_STEWARD pulse output.
						</p>
					</FactorySection>
				))}
			</div>
		</div>
	);

	return (
		<>
			<LDPSurface
				title="Strategy Pulse"
				description="Strategy Steward surface for the active project: moat, positioning, selling, product-improvement, and build-vs-compose drift signals."
				status={status}
				primaryAgent={STRATEGY_AGENT}
				turns={ldp.turns}
				readPane={readPane}
				inputValue={ldp.inputValue}
				inputPlaceholder="Ask STRATEGY_STEWARD about moat, positioning, drift, or strategy lanes..."
				isThinking={ldp.isThinking}
				thinkingLabel={ldp.thinkingLabel}
				onInputChange={ldp.setInputValue}
				onSubmit={ldp.submit}
			/>
			<DocumentSheet
				path={selectedSource}
				title="Strategy source"
				onOpenChange={(open) => !open && setSelectedSource(null)}
			/>
			<StrategyLedgerPromotePreview
				candidate={candidateToPromote}
				open={!!candidateToPromote}
				lastOperatorMessage={ldp.inputValue}
				onOpenChange={(open) => !open && setCandidateToPromote(null)}
				onOpenSource={setSelectedSource}
				onPromoted={() => setCandidateToPromote(null)}
			/>
			{ldp.streamElement}
		</>
	);
}
