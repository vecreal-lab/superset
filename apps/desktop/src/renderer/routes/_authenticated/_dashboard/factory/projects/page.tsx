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
	SourceButton,
	type FactoryRow,
} from "../components/FactoryView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/projects/",
)({
	component: ProjectsPage,
});

function countForProject(rows: FactoryRow[], projectId: string): number {
	return rows.filter(
		(row) =>
			row.data.project_id === projectId ||
			row.source_relative_path.includes(`/${projectId}/`),
	).length;
}

function ProjectsPage() {
	const [selectedSource, setSelectedSource] = useState<string | null>(null);
	const projects = electronTrpc.factory.dataset.useQuery(
		{ dataset: "projects" },
		{ refetchInterval: 5000 },
	);
	const workOrders = electronTrpc.factory.dataset.useQuery(
		{ dataset: "work_orders" },
		{ refetchInterval: 5000 },
	);
	const runs = electronTrpc.factory.dataset.useQuery(
		{ dataset: "runs" },
		{ refetchInterval: 5000 },
	);
	const rows = useMemo(
		() =>
			(projects.data || []).sort((a: FactoryRow, b: FactoryRow) =>
				a.id.localeCompare(b.id),
			),
		[projects.data],
	);

	return (
		<FactoryPage
			title="Project Hierarchy"
			description="Factory projects shown as a flat list until WO-B17 installs parent/child hierarchy policy."
		>
			<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
				<div className="mb-4">
					<EmptyFactoryState
						title="Hierarchy policy pending"
						body="Project hierarchy structure lands with WO-B17. Until then, Software Factory and Construction PM show as flat project nodes."
						sourcePath="projects/_shared/foundations/project-initiation-policy.md"
						onOpenSource={setSelectedSource}
					/>
				</div>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Project</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Identity</TableHead>
							<TableHead>Work orders</TableHead>
							<TableHead>Recent runs</TableHead>
							<TableHead>Source</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row: FactoryRow) => (
							<TableRow key={row.id}>
								<TableCell>
									<div className="font-medium">{row.title}</div>
									<div className="font-mono text-xs text-muted-foreground">
										{row.id}
									</div>
								</TableCell>
								<TableCell>
									<Badge variant="outline">{row.status || "active"}</Badge>
								</TableCell>
								<TableCell className="max-w-xl whitespace-normal text-sm">
									{typeof row.data.identity_summary === "string" &&
									row.data.identity_summary
										? row.data.identity_summary
										: "Identity foundation not authored yet."}
									{typeof row.data.identity_path === "string" && (
										<div className="mt-1">
											<SourceButton
												path={row.data.identity_path}
												onOpen={setSelectedSource}
											>
												Identity foundation
											</SourceButton>
										</div>
									)}
								</TableCell>
								<TableCell>{countForProject(workOrders.data || [], row.id)}</TableCell>
								<TableCell>{countForProject(runs.data || [], row.id)}</TableCell>
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
				title="Project source"
				onOpenChange={(open) => !open && setSelectedSource(null)}
			/>
		</FactoryPage>
	);
}
