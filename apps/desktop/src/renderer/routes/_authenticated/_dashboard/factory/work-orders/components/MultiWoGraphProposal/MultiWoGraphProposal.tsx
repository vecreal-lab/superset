import { GitBranch, Save } from "lucide-react";
import type { DependencyGraph as DependencyGraphModel } from "lib/types/factory-operator-console";
import {
	Button,
	Card,
	Chip,
	StatusBadge,
} from "renderer/components/vecreal";
import { DependencyGraph } from "renderer/components/factory-primitives";
import type { ElectronRouterOutputs } from "renderer/lib/electron-trpc";

type DraftProposal =
	ElectronRouterOutputs["factory"]["workOrders"]["draftWorkOrders"];
type DraftItem = DraftProposal["workOrders"][number];

export interface MultiWoGraphProposalProps {
	proposal: DraftProposal;
	savedIds: string[];
	isSaving?: boolean;
	onApproveAll: () => void;
	onApproveCohort: (ids: string[]) => void;
}

function graphForProposal(proposal: DraftProposal): DependencyGraphModel {
	return {
		nodes: proposal.workOrders.map((draft) => ({
			id: draft.id,
			title: draft.title,
			status: "queued",
			rigorTier: draft.rigorTier === "T3" ? 3 : draft.rigorTier === "T2" ? 2 : 1,
			riskClassification: draft.riskClassification,
			author: {
				user: proposal.author.user,
				displayName: proposal.author.displayName,
				role: proposal.author.role,
				isAgent: Boolean(proposal.author.isAgent),
			},
			assignedTo: {
				user: proposal.assignedTo.user,
				displayName: proposal.assignedTo.displayName,
				role: proposal.assignedTo.role,
				isAgent: Boolean(proposal.assignedTo.isAgent),
			},
			projectId: draft.projectId,
			scope: "dashboard",
			state: "queued",
			blockedBy: draft.dependsOn,
			lastActivityAt: proposal.createdAt,
			hasOpenGate: false,
		})),
		edges: proposal.workOrders.flatMap((draft) =>
			draft.dependsOn.map((dependency) => ({
				from: dependency,
				to: draft.id,
				state: "pending" as const,
				reason: "Composer dependency",
			})),
		),
		parallelCohorts: proposal.cohorts,
		blockedQueue: proposal.workOrders
			.filter((draft) => draft.dependsOn.length > 0)
			.map((draft) => draft.id),
	};
}

function DraftCard({ draft, saved }: { draft: DraftItem; saved: boolean }) {
	return (
		<Card variant="compact">
			<div className="grid gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<Chip tone="neutral" size="sm">
						{draft.id}
					</Chip>
					<StatusBadge variant={saved ? "success" : "neutral"} size="sm">
						{saved ? "saved" : "draft"}
					</StatusBadge>
				</div>
				<div>
					<div className="text-sm font-medium">{draft.title}</div>
					<p className="m-0 mt-1 line-clamp-3 text-xs text-muted-foreground">
						{draft.intent}
					</p>
				</div>
				{draft.dependsOn.length > 0 ? (
					<div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
						Depends on:
						{draft.dependsOn.map((dependency) => (
							<Chip key={dependency} tone="neutral" size="xs">
								{dependency}
							</Chip>
						))}
					</div>
				) : null}
			</div>
		</Card>
	);
}

export function MultiWoGraphProposal({
	proposal,
	savedIds,
	isSaving,
	onApproveAll,
	onApproveCohort,
}: MultiWoGraphProposalProps) {
	const saved = new Set(savedIds);
	const graph = graphForProposal(proposal);
	return (
		<section className="grid gap-4" aria-label="Multi-work-order graph proposal">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h3 className="m-0 flex items-center gap-2 text-sm font-medium">
						<GitBranch className="size-4" />
						Proposed work-order graph
					</h3>
					<p className="m-0 mt-1 text-xs text-muted-foreground">
						Approve the full graph, or save one ready cohort at a time.
					</p>
				</div>
				<Button
					variant="primary"
					size="sm"
					loading={isSaving}
					disabled={isSaving || saved.size === proposal.workOrders.length}
					onClick={onApproveAll}
				>
					<Save className="size-3.5" />
					Save all
				</Button>
			</div>
			<DependencyGraph graph={graph} layout="tree" />
			<div className="grid gap-3">
				{proposal.cohorts.map((cohort, index) => {
					const allSaved = cohort.every((id) => saved.has(id));
					return (
						<Card key={`${index}-${cohort.join("-")}`} variant="compact">
							<div className="grid gap-3">
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div className="flex items-center gap-2">
										<Chip tone="clay" size="sm">
											Cohort {index + 1}
										</Chip>
										<span className="text-xs text-muted-foreground">
											{cohort.length} work order(s)
										</span>
									</div>
									<Button
										variant={allSaved ? "ghost" : "secondary"}
										size="sm"
										disabled={allSaved || isSaving}
										loading={isSaving}
										onClick={() => onApproveCohort(cohort)}
									>
										{allSaved ? "Saved" : "Save cohort"}
									</Button>
								</div>
								<div className="grid gap-2 md:grid-cols-2">
									{cohort
										.map((id) => proposal.workOrders.find((draft) => draft.id === id))
										.filter((draft): draft is DraftItem => Boolean(draft))
										.map((draft) => (
											<DraftCard
												key={draft.id}
												draft={draft}
												saved={saved.has(draft.id)}
											/>
										))}
								</div>
							</div>
						</Card>
					);
				})}
			</div>
		</section>
	);
}
