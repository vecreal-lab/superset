import { createFileRoute } from "@tanstack/react-router";
import { FactoryPlaceholderPage } from "../components/FactoryPlaceholderPage";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/projects/",
)({
	component: ProjectsPage,
});

function ProjectsPage() {
	return (
		<FactoryPlaceholderPage
			title="Project Hierarchy"
			description="Factory project hierarchy placeholder. Software Factory stays separate from Construction PM product work."
			dataset="foundations"
		/>
	);
}
