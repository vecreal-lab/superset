import { createFileRoute } from "@tanstack/react-router";
import { FactoryPlaceholderPage } from "../components/FactoryPlaceholderPage";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/strategy-pulse/",
)({
	component: StrategyPulsePage,
});

function StrategyPulsePage() {
	return (
		<FactoryPlaceholderPage
			title="Strategy Pulse"
			description="Strategy Steward pulse and ledger placeholder. Rendering comes after the machinery integration gate."
			dataset="foundations"
		/>
	);
}
