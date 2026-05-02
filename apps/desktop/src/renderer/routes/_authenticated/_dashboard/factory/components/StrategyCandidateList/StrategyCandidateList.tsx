import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { MessageSquare, TrendingUp, XCircle } from "lucide-react";
import { useMemo } from "react";
import {
	EmptyFactoryState,
	FactorySection,
	SourceButton,
	StatusBadge,
	formatDate,
} from "../FactoryView";

export interface StrategyLedgerCandidate {
	id: string;
	project_id: string;
	lane: string;
	finding: string;
	evidence: string[];
	confidence: string;
	priority: string;
	status: string;
	source_intake: string;
	source_intake_title: string;
	source_intake_type: string;
	source_ingested_at?: string;
	candidate_relative_path: string;
	intake_folder_relative_path: string;
	updated_at?: string;
	promoted_at?: string;
	declined_at?: string;
	decline_reason?: string;
	ledger_entry_id?: string;
	ledger_path?: string;
}

interface StrategyCandidateListProps {
	candidates: StrategyLedgerCandidate[];
	isLoading?: boolean;
	errorMessage?: string;
	onAskCandidate: (candidate: StrategyLedgerCandidate) => void;
	onPromoteCandidate: (candidate: StrategyLedgerCandidate) => void;
	onDeclineCandidate: (candidate: StrategyLedgerCandidate) => void;
	onOpenSource: (path: string) => void;
}

const confidenceScore = (candidate: StrategyLedgerCandidate) => {
	const confidence = candidate.confidence.toLowerCase();
	if (confidence.includes("verified")) return 4;
	if (confidence.includes("high")) return 3;
	if (confidence.includes("medium")) return 2;
	if (confidence.includes("low")) return 1;
	return 0;
};

function groupByLane(candidates: StrategyLedgerCandidate[]) {
	const grouped = new Map<string, StrategyLedgerCandidate[]>();
	for (const candidate of candidates) {
		const lane = candidate.lane || "Strategy Ledger candidates";
		grouped.set(lane, [...(grouped.get(lane) || []), candidate]);
	}
	return [...grouped.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([lane, rows]) => ({
			lane,
			rows: rows.slice().sort((a, b) => {
				const confidenceDelta = confidenceScore(b) - confidenceScore(a);
				if (confidenceDelta !== 0) return confidenceDelta;
				return String(b.source_ingested_at || b.updated_at || "").localeCompare(
					String(a.source_ingested_at || a.updated_at || ""),
				);
			}),
		}));
}

export function StrategyCandidateList({
	candidates,
	isLoading,
	errorMessage,
	onAskCandidate,
	onPromoteCandidate,
	onDeclineCandidate,
	onOpenSource,
}: StrategyCandidateListProps) {
	const grouped = useMemo(() => groupByLane(candidates), [candidates]);

	if (isLoading) {
		return (
			<EmptyFactoryState
				title="Loading strategy ledger candidates"
				body="Scanning propagated intakes for Strategy Pulse review candidates."
			/>
		);
	}

	if (errorMessage) {
		return (
			<EmptyFactoryState
				title="Strategy candidate read failed"
				body={errorMessage}
			/>
		);
	}

	if (!candidates.length) {
		return (
			<EmptyFactoryState
				title="No intake strategy candidates yet"
				body="Layer 2 propagation writes strategy-candidates.json files after an intake digest is approved. Those candidates will appear here for STRATEGY_STEWARD review."
			/>
		);
	}

	return (
		<div className="space-y-4">
			{grouped.map((group) => (
				<FactorySection
					key={group.lane}
					title={group.lane}
					description={`${group.rows.length} intake-sourced candidate${
						group.rows.length === 1 ? "" : "s"
					}`}
				>
					<div className="space-y-3">
						{group.rows.map((candidate) => (
							<article key={candidate.id} className="rounded-md border p-3">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<StatusBadge status={candidate.status} />
											<Badge variant="outline">
												confidence: {candidate.confidence}
											</Badge>
											<Badge variant="outline">priority: {candidate.priority}</Badge>
											<Badge variant="secondary">{candidate.project_id}</Badge>
										</div>
										<p className="mt-3 text-sm font-medium">{candidate.finding}</p>
										<div className="mt-2 text-xs text-muted-foreground">
											Source: {candidate.source_intake_title} ·{" "}
											{candidate.source_intake_type} ·{" "}
											{formatDate(candidate.source_ingested_at || candidate.updated_at)}
										</div>
										<div className="mt-2 flex flex-wrap gap-2">
											<SourceButton
												path={candidate.intake_folder_relative_path}
												onOpen={onOpenSource}
											>
												Intake folder
											</SourceButton>
											<SourceButton
												path={candidate.candidate_relative_path}
												onOpen={onOpenSource}
											>
												Candidate JSON
											</SourceButton>
											{candidate.ledger_path && (
												<SourceButton
													path={candidate.ledger_path}
													onOpen={onOpenSource}
												>
													Ledger entry
												</SourceButton>
											)}
										</div>
										{candidate.evidence.length > 0 && (
											<ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
												{candidate.evidence.slice(0, 3).map((evidence) => (
													<li key={evidence}>{evidence}</li>
												))}
											</ul>
										)}
									</div>
									<div className="flex flex-wrap justify-end gap-2">
										<Button
											type="button"
											size="xs"
											variant="outline"
											onClick={() => onAskCandidate(candidate)}
										>
											<MessageSquare className="size-3.5" />
											Ask
										</Button>
										<Button
											type="button"
											size="xs"
											variant="outline"
											disabled={candidate.status === "promoted"}
											onClick={() => onPromoteCandidate(candidate)}
										>
											<TrendingUp className="size-3.5" />
											Promote
										</Button>
										<Button
											type="button"
											size="xs"
											variant="ghost"
											disabled={candidate.status === "declined"}
											onClick={() => onDeclineCandidate(candidate)}
										>
											<XCircle className="size-3.5" />
											Decline
										</Button>
									</div>
								</div>
							</article>
						))}
					</div>
				</FactorySection>
			))}
		</div>
	);
}
