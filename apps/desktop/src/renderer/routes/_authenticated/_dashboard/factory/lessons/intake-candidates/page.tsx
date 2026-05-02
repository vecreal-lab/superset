import { toast } from "@superset/ui/sonner";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { DocumentSheet, FactoryPage, FactorySection } from "../../components/FactoryView";
import {
	IntakeLessonCandidateList,
	type IntakeLessonCandidate,
} from "../../components/IntakeLessonCandidateList";
import { LessonPromotePreview } from "../../components/LessonPromotePreview";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/lessons/intake-candidates/",
)({
	component: IntakeLessonCandidatesPage,
});

function IntakeLessonCandidatesPage() {
	const [selectedSource, setSelectedSource] = useState<string | null>(null);
	const [selectedCandidate, setSelectedCandidate] =
		useState<IntakeLessonCandidate | null>(null);
	const utils = electronTrpc.useUtils();
	const candidates = electronTrpc.factory.lessons.listIntakeCandidates.useQuery(
		{ status: "all" },
		{ refetchInterval: 5000 },
	);
	const declineCandidate = electronTrpc.factory.lessons.declineCandidate.useMutation();

	const handleDecline = async (candidate: IntakeLessonCandidate) => {
		const rationale = window.prompt(
			"Optional free-form rationale for declining this lesson candidate:",
			candidate.decline_rationale || "",
		);
		if (rationale === null) return;
		try {
			await declineCandidate.mutateAsync({
				candidate_id: candidate.id,
				rationale,
			});
			await utils.factory.lessons.listIntakeCandidates.invalidate();
			toast.success("Lesson candidate declined.");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Decline failed.");
		}
	};

	const pendingCount = (candidates.data || []).filter(
		(candidate: IntakeLessonCandidate) => candidate.status === "pending_review",
	).length;

	return (
		<>
			<FactoryPage
				title="Intake Lesson Candidates"
				description="Review intake-derived lesson candidates and promote them to the right lesson tier."
			>
				<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
					<FactorySection
						title={`${pendingCount} pending review`}
						description="Default promotion target is Tier 2. Tier 3 promotion invokes AUDIT before writing."
					>
						<IntakeLessonCandidateList
							candidates={(candidates.data || []) as IntakeLessonCandidate[]}
							isLoading={candidates.isLoading}
							errorMessage={candidates.error?.message}
							onReview={setSelectedCandidate}
							onDecline={handleDecline}
							onOpenSource={setSelectedSource}
						/>
					</FactorySection>
				</div>
			</FactoryPage>
			<LessonPromotePreview
				candidate={selectedCandidate}
				open={!!selectedCandidate}
				onOpenChange={(open) => !open && setSelectedCandidate(null)}
				onOpenSource={setSelectedSource}
				onPromoted={() => setSelectedCandidate(null)}
			/>
			<DocumentSheet
				path={selectedSource}
				title="Lesson source"
				onOpenChange={(open) => !open && setSelectedSource(null)}
			/>
		</>
	);
}
