import { createFileRoute } from "@tanstack/react-router";
import { FactoryPlaceholderPage } from "../components/FactoryPlaceholderPage";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/work-orders/",
)({
	component: WorkOrdersPage,
});

function WorkOrdersPage() {
	return (
		<FactoryPlaceholderPage
			title="Work Orders"
			description="Work-order queue, blocked runs, active runs, and review gates render here in substage 5."
			dataset="work_orders"
		/>
	);
}
