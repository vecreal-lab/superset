import { createFileRoute } from "@tanstack/react-router";
import {
	projectFoundationPath,
	useActiveProjectId,
} from "renderer/stores/active-project";
import { MarkdownDocumentView } from "../components/MarkdownDocumentView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/foundations/",
)({
	component: FoundationsPage,
});

function FoundationsPage() {
	const activeProjectId = useActiveProjectId();
	return (
		<MarkdownDocumentView
			title="Foundations"
			description="Document-backed foundation surface for the next DOMAIN_KNOWLEDGE_STEWARD intake pass."
			path={projectFoundationPath(
				activeProjectId,
				activeProjectId === "software-factory"
					? "foundations-summary.md"
					: "foundations.md",
			)}
			emptyTitle="Foundations source is empty"
			emptyBody="The Foundations view is wired to the active project's foundations document. Intake work will replace placeholder sections."
		/>
	);
}
