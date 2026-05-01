import { createFileRoute } from "@tanstack/react-router";
import { FactoryPlaceholderPage } from "../components/FactoryPlaceholderPage";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/mission/",
)({
	component: MissionPage,
});

function MissionPage() {
	return (
		<FactoryPlaceholderPage
			title="Mission State Report"
			description="Strategic mission synthesis placeholder. MISSION_STEWARD output becomes the primary data source in substage 5."
			dataset="missions"
		/>
	);
}
