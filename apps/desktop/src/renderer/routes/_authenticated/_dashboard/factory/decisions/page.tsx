import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
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
	FactoryPage,
	FactorySearch,
	SourceButton,
	type FactoryRow,
} from "../components/FactoryView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/decisions/",
)({
	component: DecisionsPage,
});

function valueText(value: unknown): string {
	return typeof value === "string" && value.trim() ? value : "unknown";
}

function DecisionsPage() {
	const [query, setQuery] = useState("");
	const [projectFilter, setProjectFilter] = useState("all");
	const [statusFilter, setStatusFilter] = useState("all");
	const [selectedSource, setSelectedSource] = useState<string | null>(null);
	const decisions = electronTrpc.factory.dataset.useQuery(
		{ dataset: "decisions" },
		{ refetchInterval: 5000 },
	);
	const rows = decisions.data || [];
	const projects = useMemo(
		() => [
			"all",
			...new Set(rows.map((row: FactoryRow) => valueText(row.data.project_id))),
		],
		[rows],
	);
	const statuses = useMemo(
		() => ["all", ...new Set(rows.map((row: FactoryRow) => row.status || "unknown"))],
		[rows],
	);
	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return rows.filter((row: FactoryRow) => {
			const project = valueText(row.data.project_id);
			const status = row.status || "unknown";
			if (projectFilter !== "all" && project !== projectFilter) return false;
			if (statusFilter !== "all" && status !== statusFilter) return false;
			if (!needle) return true;
			return `${row.id} ${row.title} ${row.status} ${row.data.summary} ${row.source_relative_path}`
				.toLowerCase()
				.includes(needle);
		});
	}, [projectFilter, query, rows, statusFilter]);

	return (
		<FactoryPage
			title="Decision Log"
			description="Cross-project decision files and proposed decision_contract entries from work orders."
			actions={
				<div className="w-80">
					<FactorySearch
						value={query}
						placeholder="Search decisions"
						onChange={setQuery}
					/>
				</div>
			}
		>
			<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
				<div className="mb-4 flex flex-wrap gap-2">
					{projects.map((project) => (
						<Button
							key={project}
							size="sm"
							variant={projectFilter === project ? "secondary" : "outline"}
							onClick={() => setProjectFilter(project)}
						>
							{project}
						</Button>
					))}
				</div>
				<div className="mb-4 flex flex-wrap gap-2">
					{statuses.map((status) => (
						<Button
							key={status}
							size="sm"
							variant={statusFilter === status ? "secondary" : "outline"}
							onClick={() => setStatusFilter(status)}
						>
							{status}
						</Button>
					))}
				</div>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>ID</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Project</TableHead>
							<TableHead>Summary</TableHead>
							<TableHead>Source</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{filtered.map((row: FactoryRow) => (
							<TableRow key={`${row.id}-${row.source_relative_path}`}>
								<TableCell className="max-w-64 whitespace-normal">
									<div className="font-medium">{row.title}</div>
									<div className="mt-1 font-mono text-xs text-muted-foreground">
										{row.id}
									</div>
								</TableCell>
								<TableCell>
									<Badge variant="outline">{row.status || "unknown"}</Badge>
								</TableCell>
								<TableCell className="font-mono text-xs">
									{valueText(row.data.project_id)}
								</TableCell>
								<TableCell className="max-w-xl whitespace-normal text-sm">
									{valueText(row.data.summary)}
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
			</div>
			<DocumentSheet
				path={selectedSource}
				title="Decision source"
				onOpenChange={(open) => !open && setSelectedSource(null)}
			/>
		</FactoryPage>
	);
}
