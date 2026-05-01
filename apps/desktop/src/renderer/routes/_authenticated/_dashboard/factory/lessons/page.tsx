import { createFileRoute } from "@tanstack/react-router";
import { MarkdownDocumentView } from "../components/MarkdownDocumentView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/lessons/",
)({
	component: LessonsPage,
});

function LessonsPage() {
	return (
		<MarkdownDocumentView
			title="Lessons"
			description="Document-backed lesson surface for pending and promoted learning from factory runs."
			path="docs/factory/lessons.md"
			emptyTitle="Lessons source is empty"
			emptyBody="The Lessons view is wired to docs/factory/lessons.md. Intake work will replace the placeholder sections."
		/>
	);
}
