import { createFileRoute } from "@tanstack/react-router";
import { FactoryPlaceholderPage } from "../../components/FactoryPlaceholderPage";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/work-orders/$workOrderId/",
)({
	component: WorkOrderDetailPage,
});

function WorkOrderDetailPage() {
	const { workOrderId } = Route.useParams();
	return (
		<FactoryPlaceholderPage
			title={`Work Order: ${workOrderId}`}
			description="Work-order detail placeholder. Receipts, approvals, artifacts, and attachment surface land in substage 5."
			dataset="runs"
		/>
	);
}
