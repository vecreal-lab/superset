import { createFileRoute } from "@tanstack/react-router";

import { EmptyFactoryState, FactoryPage } from "../../components/FactoryView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/intake/$intakeId/",
)({
	component: IntakeDetailPlaceholderPage,
});

function IntakeDetailPlaceholderPage() {
	const { intakeId } = Route.useParams();
	const decodedId = decodeURIComponent(intakeId);

	return (
		<FactoryPage
			title="Intake detail"
			description="Per-intake LDP surface ships in WO-C21.4."
		>
			<div className="p-6">
				<EmptyFactoryState
					title="Per-intake surface queued"
					body={`WO-C21.4 replaces this placeholder with the full INTAKE_STEWARD LDP surface for ${decodedId}.`}
				/>
			</div>
		</FactoryPage>
	);
}
