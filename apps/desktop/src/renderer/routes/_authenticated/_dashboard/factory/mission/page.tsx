import { createFileRoute } from "@tanstack/react-router";
import {
	projectFoundationPath,
	useActiveProjectId,
} from "renderer/stores/active-project";
import { MarkdownDocumentView } from "../components/MarkdownDocumentView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/mission/",
)({
	component: MissionPage,
});

function MissionPage() {
	const activeProjectId = useActiveProjectId();
	return (
		<MarkdownDocumentView
			title="Mission"
			description="Project mission, identity, v0 demo line, decision filter, and operating principles."
			path={projectFoundationPath(activeProjectId, "mission.md")}
			emptyTitle="Mission source is empty"
			emptyBody="The Mission view is wired to the active project's foundations/mission.md. DOMAIN_KNOWLEDGE_STEWARD intake will populate placeholder sections."
		/>
	);
}
