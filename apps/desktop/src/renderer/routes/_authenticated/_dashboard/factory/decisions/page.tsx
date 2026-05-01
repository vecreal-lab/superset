import { createFileRoute } from "@tanstack/react-router";
import { MarkdownDocumentView } from "../components/MarkdownDocumentView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/decisions/",
)({
	component: DecisionsPage,
});

function DecisionsPage() {
	return (
		<MarkdownDocumentView
			title="Decisions"
			description="Document-backed decision surface for owner-readable active, pending, and superseded decision notes."
			path="docs/factory/decisions.md"
			emptyTitle="Decisions source is empty"
			emptyBody="The Decisions view is wired to docs/factory/decisions.md. Intake work will replace the placeholder sections."
		/>
	);
}
