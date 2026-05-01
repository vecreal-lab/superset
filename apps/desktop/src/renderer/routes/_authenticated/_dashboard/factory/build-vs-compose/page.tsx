import { createFileRoute } from "@tanstack/react-router";
import { FactoryPlaceholderPage } from "../components/FactoryPlaceholderPage";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/build-vs-compose/",
)({
	component: BuildVsComposePage,
});

function BuildVsComposePage() {
	return (
		<FactoryPlaceholderPage
			title="Build-vs-Compose Matrix"
			description="Landscape research and vendor-as-input gate placeholder. Matrix rendering lands in substage 5."
			dataset="foundations"
		/>
	);
}
