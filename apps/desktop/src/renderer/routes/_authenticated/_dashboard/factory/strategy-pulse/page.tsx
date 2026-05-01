import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	DocumentSheet,
	EmptyFactoryState,
	FactoryPage,
	FactorySection,
	SourceButton,
	StatusBadge,
	type FactoryRow,
} from "../components/FactoryView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/strategy-pulse/",
)({
	component: StrategyPulsePage,
});

function StrategyPulsePage() {
	const [selectedSource, setSelectedSource] = useState<string | null>(null);
	const roles = electronTrpc.factory.dataset.useQuery({ dataset: "roles" });
	const runs = electronTrpc.factory.dataset.useQuery(
		{ dataset: "runs" },
		{ refetchInterval: 5000 },
	);
	const strategyRole = roles.data?.find(
		(row: FactoryRow) => row.id === "STRATEGY_STEWARD",
	);
	const pulseRuns = useMemo(
		() =>
			(runs.data || []).filter((row: FactoryRow) =>
				`${row.id} ${row.title} ${row.source_relative_path}`.includes(
					"STRATEGY_STEWARD",
				),
			),
		[runs.data],
	);
	const lanes = [
		"Moat health",
		"Positioning drift",
		"Branding opportunities",
		"Selling opportunities",
		"Internal product improvement",
		"Horizontal opportunity pulse",
		"Vertical opportunity pulse",
		"Horizontal/vertical tension audit",
		"Wedge-vs-expansion tradeoffs",
		"Operating principles audit + build-vs-compose matrix drift",
		"Open strategic questions for Yuriy",
	];

	return (
		<FactoryPage
			title="Strategy Pulse"
			description="Strategy Steward surface for moat, positioning, selling, product-improvement, and build-vs-compose drift signals."
		>
			<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
				{pulseRuns.length === 0 ? (
					<EmptyFactoryState
						title="No strategy pulse available yet"
						body="STRATEGY_STEWARD runs weekly and on pre-build/post-build events after project work begins. The lanes below are ready for the first pulse."
						sourcePath={strategyRole?.source_relative_path}
						onOpenSource={setSelectedSource}
					/>
				) : (
					<FactorySection title="Latest strategy pulse">
						<div className="space-y-2">
							{pulseRuns.map((run: FactoryRow) => (
								<div
									key={run.id}
									className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
								>
									<div className="min-w-0">
										<div className="truncate text-sm font-medium">{run.title}</div>
										<SourceButton
											path={run.source_relative_path}
											onOpen={setSelectedSource}
										/>
									</div>
									<StatusBadge status={run.status} />
								</div>
							))}
						</div>
					</FactorySection>
				)}

				<div className="mt-6 grid gap-4 lg:grid-cols-2">
					{lanes.map((lane) => (
						<FactorySection
							key={lane}
							title={lane}
							description="This lane renders cited Strategy Pulse claims once STRATEGY_STEWARD runs."
						>
							<p className="text-sm text-muted-foreground">
								Awaiting first STRATEGY_STEWARD pulse output.
							</p>
						</FactorySection>
					))}
				</div>
			</div>
			<DocumentSheet
				path={selectedSource}
				title="Strategy source"
				onOpenChange={(open) => !open && setSelectedSource(null)}
			/>
		</FactoryPage>
	);
}
