import { createFileRoute } from "@tanstack/react-router";
import { HomePriorityPanel } from "./components/HomePriorityPanel";
import { FactoryPage, FactorySection } from "./components/FactoryView";

export const Route = createFileRoute("/_authenticated/_dashboard/factory/")({
	component: FactoryHomePage,
});

function FactoryHomePage() {
	return (
		<FactoryPage
			title="Factory Home"
			description="Active-project command surface for living-document dialogue attention, current run state, and the next operator decisions."
		>
			<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
				<div className="grid gap-4">
					<HomePriorityPanel />
					<FactorySection
						title="Run State"
						description="Mission synthesis and run-state summaries stay visible here as the factory runner produces receipts."
					>
						<p className="text-sm text-muted-foreground">
							No synthesized morning digest is available yet. Use the priority
							dialogues panel above for the active-project LDP items that need
							Yuriy attention now.
						</p>
					</FactorySection>
				</div>
			</div>
		</FactoryPage>
	);
}
