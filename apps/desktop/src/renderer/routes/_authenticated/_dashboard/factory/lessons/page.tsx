import { createFileRoute } from "@tanstack/react-router";
import { FactoryPlaceholderPage } from "../components/FactoryPlaceholderPage";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/lessons/",
)({
	component: LessonsPage,
});

function LessonsPage() {
	return (
		<FactoryPlaceholderPage
			title="Lessons"
			description="Pending lessons surface placeholder until WO-B16 promotes the universal lessons system."
			dataset="lessons"
		/>
	);
}
