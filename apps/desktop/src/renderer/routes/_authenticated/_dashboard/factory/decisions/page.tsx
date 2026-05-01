import { createFileRoute } from "@tanstack/react-router";
import {
	projectFoundationPath,
	useActiveProjectId,
} from "renderer/stores/active-project";
import { MarkdownDocumentView } from "../components/MarkdownDocumentView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/decisions/",
)({
	component: DecisionsPage,
});

function DecisionsPage() {
	const activeProjectId = useActiveProjectId();
	return (
		<MarkdownDocumentView
			title="Decisions"
			description="Document-backed decision surface for owner-readable active, pending, and superseded decision notes."
			path={projectFoundationPath(activeProjectId, "decisions.md")}
			emptyTitle="Decisions source is empty"
			emptyBody="The Decisions view is wired to the active project's foundations/decisions.md. Intake work will replace placeholder sections."
		/>
	);
}
