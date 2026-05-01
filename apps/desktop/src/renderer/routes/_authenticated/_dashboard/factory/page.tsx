import { createFileRoute } from "@tanstack/react-router";
import { FactoryPlaceholderPage } from "./components/FactoryPlaceholderPage";

export const Route = createFileRoute("/_authenticated/_dashboard/factory/")({
	component: FactoryHomePage,
});

function FactoryHomePage() {
	return (
		<FactoryPlaceholderPage
			title="Factory Home"
			description="Landing shell for the Software Factory cockpit. Morning Digest and run-state synthesis render here in substage 5."
			dataset="runs"
		/>
	);
}
