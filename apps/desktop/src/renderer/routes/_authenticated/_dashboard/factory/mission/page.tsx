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
	"/_authenticated/_dashboard/factory/mission/",
)({
	component: MissionPage,
});

function MissionPage() {
	const [selectedSource, setSelectedSource] = useState<string | null>(null);
	const roles = electronTrpc.factory.dataset.useQuery({ dataset: "roles" });
	const runs = electronTrpc.factory.dataset.useQuery(
		{ dataset: "runs" },
		{ refetchInterval: 5000 },
	);
	const missionRole = roles.data?.find((row: FactoryRow) => row.id === "MISSION_STEWARD");
	const synthesisRuns = useMemo(
		() =>
			(runs.data || []).filter((row: FactoryRow) =>
				`${row.id} ${row.title} ${row.source_relative_path}`.includes(
					"MISSION_STEWARD",
				),
			),
		[runs.data],
	);
	const sections = [
		"TL;DR",
		"What's on track",
		"What's drifting",
		"Cross-stream propagation opportunities",
		"Foundation gap signals",
		"Forward critical path",
		"Owner attention items",
		"Decisions recommended",
		"Tech radar",
		"Landscape watch",
	];

	return (
		<FactoryPage
			title="Mission State Report"
			description="Weekly strategic synthesis from MISSION_STEWARD, with cited drift, owner-attention, tech radar, and landscape watch signals."
		>
			<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
				{synthesisRuns.length === 0 ? (
					<EmptyFactoryState
						title="No mission synthesis available yet"
						body="MISSION_STEWARD runs on weekly cadence after Phase D begins. Until then, this view shows the exact section structure the synthesis will render against."
						sourcePath={missionRole?.source_relative_path}
						onOpenSource={setSelectedSource}
					/>
				) : (
					<FactorySection title="Latest mission synthesis">
						<div className="space-y-2">
							{synthesisRuns.map((run: FactoryRow) => (
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
					{sections.map((section) => (
						<FactorySection
							key={section}
							title={section}
							description="Claims in this lane will carry source citations and confidence indicators."
						>
							<p className="text-sm text-muted-foreground">
								Awaiting first MISSION_STEWARD synthesis output.
							</p>
						</FactorySection>
					))}
				</div>
			</div>
			<DocumentSheet
				path={selectedSource}
				title="Mission source"
				onOpenChange={(open) => !open && setSelectedSource(null)}
			/>
		</FactoryPage>
	);
}
