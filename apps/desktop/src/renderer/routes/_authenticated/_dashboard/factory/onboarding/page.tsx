import { createFileRoute } from "@tanstack/react-router";
import { FactoryPlaceholderPage } from "../components/FactoryPlaceholderPage";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/onboarding/",
)({
	component: FactoryOnboardingPage,
});

function FactoryOnboardingPage() {
	return (
		<FactoryPlaceholderPage
			title="Factory Onboarding"
			description="A stable cockpit route for onboarding handoffs, route smoke coverage, and future guided setup work."
			dataset="work_orders"
		/>
	);
}
