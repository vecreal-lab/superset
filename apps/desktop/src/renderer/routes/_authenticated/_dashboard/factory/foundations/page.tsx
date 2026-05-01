import { createFileRoute } from "@tanstack/react-router";
import { MarkdownDocumentView } from "../components/MarkdownDocumentView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/foundations/",
)({
	component: FoundationsPage,
});

function FoundationsPage() {
	return (
		<MarkdownDocumentView
			title="Foundations"
			description="Document-backed foundation surface for the next DOMAIN_KNOWLEDGE_STEWARD intake pass."
			path="docs/factory/foundations.md"
			emptyTitle="Foundations source is empty"
			emptyBody="The Foundations view is wired to docs/factory/foundations.md. Intake work will replace the placeholder sections."
		/>
	);
}
