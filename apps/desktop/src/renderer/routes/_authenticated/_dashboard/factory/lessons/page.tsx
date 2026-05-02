import { Button } from "@superset/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	projectFoundationPath,
	useActiveProjectId,
} from "renderer/stores/active-project";
import {
	EmptyFactoryState,
	FactoryPage,
	FactorySection,
	formatDate,
} from "../components/FactoryView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/lessons/",
)({
	component: LessonsPage,
});

function LessonsPage() {
	const activeProjectId = useActiveProjectId();
	const path = projectFoundationPath(activeProjectId, "lessons.md");
	const documentQuery = electronTrpc.factory.document.useQuery({ path });
	const candidates = electronTrpc.factory.lessons.listIntakeCandidates.useQuery(
		{ status: "all" },
		{ refetchInterval: 5000 },
	);
	const pendingCount = (candidates.data || []).filter(
		(candidate) => candidate.status === "pending_review",
	).length;
	const content = documentQuery.data?.content.trim() || "";

	return (
		<FactoryPage
			title="Lessons"
			description="Document-backed lesson surface plus intake-derived lesson candidates awaiting promotion."
		>
			<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
				<div className="space-y-6">
					<FactorySection
						title="Intake candidates"
						description="Layer 2 lesson candidates waiting for Tier 1, Tier 2, or Tier 3 routing."
					>
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<div className="text-2xl font-semibold">{pendingCount}</div>
								<p className="text-sm text-muted-foreground">
									pending review · {(candidates.data || []).length} total
								</p>
							</div>
							<Button asChild size="sm" variant="outline">
								<Link to="/factory/lessons/intake-candidates">
									Review candidates
									<ArrowRight className="size-4" />
								</Link>
							</Button>
						</div>
					</FactorySection>

					{documentQuery.isLoading ? (
						<div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
							Loading {path}...
						</div>
					) : documentQuery.isError ? (
						<EmptyFactoryState
							title="Lessons source is empty"
							body={`The cockpit expected to render ${path}. Intake lesson candidates remain available above.`}
						/>
					) : !content ? (
						<EmptyFactoryState
							title="Lessons source is empty"
							body="The Lessons view is wired to the active project's foundations/lessons.md. Intake candidates are reviewed from the top section."
						/>
					) : (
						<div className="space-y-4">
							<div className="border-b pb-4">
								<p className="font-mono text-xs text-muted-foreground">
									{documentQuery.data?.source_relative_path || path}
								</p>
								{documentQuery.data && (
									<p className="mt-1 text-xs text-muted-foreground">
										Modified {formatDate(documentQuery.data.modified_at)} ·{" "}
										{documentQuery.data.bytes} bytes
									</p>
								)}
							</div>
							<MarkdownRenderer
								content={content}
								className="h-auto overflow-visible"
							/>
						</div>
					)}
				</div>
			</div>
		</FactoryPage>
	);
}
