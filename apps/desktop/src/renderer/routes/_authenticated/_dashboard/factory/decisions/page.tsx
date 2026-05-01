import { createFileRoute } from "@tanstack/react-router";
import { FactoryPlaceholderPage } from "../components/FactoryPlaceholderPage";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/decisions/",
)({
	component: DecisionsPage,
});

function DecisionsPage() {
	return (
		<FactoryPlaceholderPage
			title="Decision Log"
			description="Cross-project and project-scoped decision log placeholder."
			dataset="decisions"
		/>
	);
}
