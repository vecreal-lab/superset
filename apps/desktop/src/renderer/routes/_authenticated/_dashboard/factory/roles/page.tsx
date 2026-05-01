import { createFileRoute } from "@tanstack/react-router";
import { FactoryPlaceholderPage } from "../components/FactoryPlaceholderPage";

export const Route = createFileRoute("/_authenticated/_dashboard/factory/roles/")({
	component: RolesPage,
});

function RolesPage() {
	return (
		<FactoryPlaceholderPage
			title="Role Catalog"
			description="Agent role catalog and provider policy placeholder."
			dataset="roles"
		/>
	);
}
