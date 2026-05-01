import { createFileRoute } from "@tanstack/react-router";
import {
	projectFoundationPath,
	useActiveProjectId,
} from "renderer/stores/active-project";
import { MarkdownDocumentView } from "../components/MarkdownDocumentView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/lessons/",
)({
	component: LessonsPage,
});

function LessonsPage() {
	const activeProjectId = useActiveProjectId();
	return (
		<MarkdownDocumentView
			title="Lessons"
			description="Document-backed lesson surface for pending and promoted learning from factory runs."
			path={projectFoundationPath(activeProjectId, "lessons.md")}
			emptyTitle="Lessons source is empty"
			emptyBody="The Lessons view is wired to the active project's foundations/lessons.md. Intake work will replace placeholder sections."
		/>
	);
}
