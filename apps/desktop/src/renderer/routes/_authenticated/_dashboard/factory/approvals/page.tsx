import { createFileRoute } from "@tanstack/react-router";
import { FactoryPlaceholderPage } from "../components/FactoryPlaceholderPage";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/approvals/",
)({
	component: ApprovalsPage,
});

function ApprovalsPage() {
	return (
		<FactoryPlaceholderPage
			title="Approval Queue"
			description="Filesystem approval queue placeholder. Approval write-side remains file-based for now."
			dataset="approvals"
		/>
	);
}
