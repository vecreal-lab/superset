import { Badge } from "@superset/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	DocumentSheet,
	EmptyFactoryState,
	FactoryPage,
	FactorySearch,
	SourceButton,
	formatDate,
	type FactoryRow,
} from "../components/FactoryView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/lessons/",
)({
	component: LessonsPage,
});

function originRun(row: FactoryRow): string {
	const parts = row.source_relative_path.split("/");
	const runsIndex = parts.indexOf("runs");
	return runsIndex >= 0 && parts[runsIndex + 1] ? parts[runsIndex + 1] : "unknown";
}

function LessonsPage() {
	const [query, setQuery] = useState("");
	const [selectedSource, setSelectedSource] = useState<string | null>(null);
	const lessons = electronTrpc.factory.dataset.useQuery(
		{ dataset: "lessons" },
		{ refetchInterval: 5000 },
	);
	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return (lessons.data || []).filter((row: FactoryRow) =>
			needle
				? `${row.title} ${row.source_relative_path} ${originRun(row)}`
						.toLowerCase()
						.includes(needle)
				: true,
		);
	}, [lessons.data, query]);

	return (
		<FactoryPage
			title="Lessons"
			description="Lessons-pending artifacts accumulated across runs, shown as Tier 3 promotion candidates until WO-B16 installs the universal lessons system."
			actions={
				<div className="w-80">
					<FactorySearch value={query} placeholder="Search lessons" onChange={setQuery} />
				</div>
			}
		>
			<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
				{filtered.length ? (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Lesson</TableHead>
								<TableHead>Promotion tier</TableHead>
								<TableHead>Origin run</TableHead>
								<TableHead>Recorded</TableHead>
								<TableHead>Source</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filtered.map((row: FactoryRow) => (
								<TableRow key={row.source_relative_path}>
									<TableCell className="max-w-xl whitespace-normal">
										<div className="font-medium">{row.title}</div>
										<div className="mt-1 text-xs text-muted-foreground">
											Occurrence count: pending curation by WO-B16
										</div>
									</TableCell>
									<TableCell>
										<Badge variant="outline">Pending Tier 3 candidate</Badge>
									</TableCell>
									<TableCell className="font-mono text-xs">{originRun(row)}</TableCell>
									<TableCell className="text-xs text-muted-foreground">
										{formatDate(row.modified_at)}
									</TableCell>
									<TableCell className="max-w-sm">
										<SourceButton
											path={row.source_relative_path}
											onOpen={setSelectedSource}
										/>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				) : (
					<EmptyFactoryState
						title="No pending lessons yet"
						body="Universal lessons system arrives with WO-B16. Until then, this surface shows lessons-pending.md files accumulated across runs as Tier 3 promotion candidates."
						sourcePath="work-orders/WO-B16-UNIVERSAL-LESSONS-SYSTEM.yml"
						onOpenSource={setSelectedSource}
					/>
				)}
			</div>
			<DocumentSheet
				path={selectedSource}
				title="Lesson source"
				onOpenChange={(open) => !open && setSelectedSource(null)}
			/>
		</FactoryPage>
	);
}
