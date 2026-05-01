import { createFileRoute } from "@tanstack/react-router";
import { MarkdownDocumentView } from "../components/MarkdownDocumentView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/mission/",
)({
	component: MissionPage,
});

function MissionPage() {
	return (
		<MarkdownDocumentView
			title="Mission"
			description="Factory mission, locked identity line, v0 demo line, decision filter, and operating principles."
			path="docs/factory/mission.md"
			emptyTitle="Mission source is empty"
			emptyBody="The Mission view is wired to docs/factory/mission.md. DOMAIN_KNOWLEDGE_STEWARD intake will populate the placeholder sections."
		/>
	);
}
