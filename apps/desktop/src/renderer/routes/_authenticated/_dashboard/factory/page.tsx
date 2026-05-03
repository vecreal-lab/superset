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
					<div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
						<HomePriorityPanel />
						<FactorySection
							title="Active Runs"
							description="Run status stays beside priority dialogues on the factory home."
						>
							<div className="flex min-h-56 items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
								<div>
									<div className="font-medium text-foreground">
										Active run map
									</div>
									<p className="mt-2 max-w-sm">
										No active-run visualization is available yet.
									</p>
								</div>
							</div>
						</FactorySection>
					</div>
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
