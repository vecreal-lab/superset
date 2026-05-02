import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { BookOpen, CheckCircle2, XCircle } from "lucide-react";
import { EmptyFactoryState, SourceButton, StatusBadge, formatDate } from "../FactoryView";

export interface IntakeLessonCandidate {
	id: string;
	title: string;
	body: string;
	source_intake: string;
	source_intake_summary: string;
	recommended_tier: 1 | 2 | 3;
	recommended_target_role?: string;
	recommended_target_project?: string;
	status: string;
	created_at?: string;
	updated_at?: string;
	promoted_at?: string;
	declined_at?: string;
	decline_rationale?: string;
	audit_rationale?: string;
	target_path?: string;
	source_relative_path: string;
}

interface IntakeLessonCandidateListProps {
	candidates: IntakeLessonCandidate[];
	isLoading?: boolean;
	errorMessage?: string;
	onReview: (candidate: IntakeLessonCandidate) => void;
	onDecline: (candidate: IntakeLessonCandidate) => void;
	onOpenSource: (path: string) => void;
}

export function IntakeLessonCandidateList({
	candidates,
	isLoading,
	errorMessage,
	onReview,
	onDecline,
	onOpenSource,
}: IntakeLessonCandidateListProps) {
	if (isLoading) {
		return (
			<EmptyFactoryState
				title="Loading intake lesson candidates"
				body="Scanning projects/_shared/lessons/_intake-candidates for pending lessons."
			/>
		);
	}
	if (errorMessage) {
		return (
			<EmptyFactoryState title="Lesson candidate read failed" body={errorMessage} />
		);
	}
	if (!candidates.length) {
		return (
			<EmptyFactoryState
				title="No intake lesson candidates yet"
				body="Layer 2 propagation writes lesson candidates here after an intake digest is approved."
			/>
		);
	}

	return (
		<div className="space-y-3">
			{candidates.map((candidate) => (
				<article key={candidate.id} className="rounded-md border p-4">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-center gap-2">
								<StatusBadge status={candidate.status} />
								<Badge variant="outline">Tier {candidate.recommended_tier}</Badge>
								{candidate.recommended_target_role && (
									<Badge variant="secondary">
										{candidate.recommended_target_role}
									</Badge>
								)}
								{candidate.recommended_target_project && (
									<Badge variant="secondary">
										{candidate.recommended_target_project}
									</Badge>
								)}
							</div>
							<h2 className="mt-3 text-sm font-medium">{candidate.title}</h2>
							<p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
								{candidate.body}
							</p>
							<div className="mt-3 flex flex-wrap items-center gap-2">
								<SourceButton
									path={candidate.source_relative_path}
									onOpen={onOpenSource}
								>
									Candidate file
								</SourceButton>
								<SourceButton path={candidate.source_intake} onOpen={onOpenSource}>
									Source intake
								</SourceButton>
								{candidate.target_path && (
									<SourceButton path={candidate.target_path} onOpen={onOpenSource}>
										Promoted target
									</SourceButton>
								)}
							</div>
							<p className="mt-2 text-xs text-muted-foreground">
								Updated {formatDate(candidate.updated_at || candidate.created_at)}
							</p>
						</div>
						<div className="flex flex-wrap justify-end gap-2">
							<Button
								type="button"
								size="xs"
								variant="outline"
								onClick={() => onReview(candidate)}
							>
								<BookOpen className="size-3.5" />
								Review
							</Button>
							<Button
								type="button"
								size="xs"
								variant="outline"
								disabled={candidate.status === "promoted"}
								onClick={() => onReview(candidate)}
							>
								<CheckCircle2 className="size-3.5" />
								Promote
							</Button>
							<Button
								type="button"
								size="xs"
								variant="ghost"
								disabled={candidate.status === "declined"}
								onClick={() => onDecline(candidate)}
							>
								<XCircle className="size-3.5" />
								Decline
							</Button>
						</div>
					</div>
				</article>
			))}
		</div>
	);
}
