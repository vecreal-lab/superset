import { createFileRoute } from "@tanstack/react-router";
import { FactoryPlaceholderPage } from "../components/FactoryPlaceholderPage";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/foundations/",
)({
	component: FoundationsPage,
});

function FoundationsPage() {
	return (
		<FactoryPlaceholderPage
			title="Foundation Viewer"
			description="Shared and project foundation document shell. Inline Markdown rendering lands in substage 5."
			dataset="foundations"
		/>
	);
}
