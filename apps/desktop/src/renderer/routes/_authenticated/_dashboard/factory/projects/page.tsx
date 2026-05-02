import { Badge } from "@superset/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useActiveProjectId } from "renderer/stores/active-project";
import {
	DocumentSheet,
	EmptyFactoryState,
	SourceButton,
	formatDate,
	type FactoryRow,
} from "../components/FactoryView";
import {
	LDPSurface,
	useLDPSurfaceDialogue,
	type LDPDialogueAgent,
	type LDPStatusSummary,
} from "../components/LDPSurface";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/projects/",
)({
	validateSearch: (search) => ({
		dialogueId:
			typeof search.dialogueId === "string" ? search.dialogueId : undefined,
	}),
	component: ProjectsPage,
});

const PROJECTS_AGENT: LDPDialogueAgent = {
	name: "PROJECT_HEALTH_MONITOR",
	roleId: "PROJECT_HEALTH_MONITOR",
	description: "Primary project hierarchy and health steward.",
};

function countForProject(rows: FactoryRow[], projectId: string): number {
	return rows.filter(
		(row) =>
			row.data.project_id === projectId ||
			row.source_relative_path.includes(`/${projectId}/`),
	).length;
}

type ProjectTreeNode = FactoryRow & { children: ProjectTreeNode[] };

function dataString(row: FactoryRow, key: string): string | null {
	const value = row.data[key];
	return typeof value === "string" && value ? value : null;
}

function dataNumber(row: FactoryRow, key: string): number {
	const value = row.data[key];
	return typeof value === "number" ? value : Number(value || 1000);
}

function projectIdFor(row: FactoryRow): string | null {
	return dataString(row, "project_id");
}

function buildProjectTree(rows: FactoryRow[]): ProjectTreeNode[] {
	const nodes = new Map<string, ProjectTreeNode>();
	for (const row of rows) {
		nodes.set(row.id, { ...row, children: [] });
	}

	const roots: ProjectTreeNode[] = [];
	for (const node of nodes.values()) {
		const parentId = dataString(node, "parent_id");
		const parent = parentId ? nodes.get(parentId) : null;
		if (parent) parent.children.push(node);
		else roots.push(node);
	}

	const sortNodes = (items: ProjectTreeNode[]) => {
		items.sort((a, b) => {
			const order = dataNumber(a, "display_order") - dataNumber(b, "display_order");
			return order || a.title.localeCompare(b.title);
		});
		for (const item of items) sortNodes(item.children);
	};
	sortNodes(roots);
	return roots;
}

function ProjectsPage() {
	const [selectedSource, setSelectedSource] = useState<string | null>(null);
	const activeProjectId = useActiveProjectId();
	const search = Route.useSearch();
	const navigate = useNavigate();
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
	const rows = useMemo(() => buildProjectTree(projects.data || []), [projects.data]);
	const flatRows = projects.data || [];
	const productNodes = flatRows.filter(
		(row: FactoryRow) => dataString(row, "node_type") === "product",
	).length;
	const activeProjectRow = flatRows.find(
		(row: FactoryRow) => dataString(row, "project_id") === activeProjectId,
	);
	const ldp = useLDPSurfaceDialogue({
		project: activeProjectId,
		surface: "projects",
		title: "Projects dialogue",
		initialDialogueId: search.dialogueId,
		onDialogueIdChange: (dialogueId) =>
			navigate({
				to: "/factory/projects",
				search: { dialogueId },
				replace: true,
			}),
	});
	const status: LDPStatusSummary = {
		kind: "read_model",
		label: "Projects",
		state: ldp.state,
		sourcePath:
			(activeProjectRow
				? dataString(activeProjectRow, "hierarchy_source_path")
				: null) ||
			"projects/project-hierarchy.yml",
		lastUpdated: formatDate(activeProjectRow?.modified_at),
		primaryAgent: PROJECTS_AGENT.roleId,
		metrics: [
			{ label: "Hierarchy nodes", value: flatRows.length },
			{ label: "Product nodes", value: productNodes },
			{
				label: "Active project WOs",
				value: countForProject(workOrders.data || [], activeProjectId),
			},
			{
				label: "Active project runs",
				value: countForProject(runs.data || [], activeProjectId),
			},
		],
		flags: [
			{ label: `Active project: ${activeProjectId}` },
			{
				label: activeProjectRow?.title || "Project row not found",
				tone: activeProjectRow ? "success" : "warning",
			},
		],
	};

	const renderRows = (nodes: ProjectTreeNode[], depth = 0): ReactNode[] =>
		nodes.flatMap((row) => {
			const projectId = projectIdFor(row);
			const nodeType = dataString(row, "node_type") || "project";
			const summary =
				dataString(row, "identity_summary") ||
				dataString(row, "summary") ||
				"Project identity or hierarchy summary not authored yet.";
			const hierarchySource = dataString(row, "hierarchy_source_path");
			return [
				<TableRow key={row.id}>
					<TableCell>
						<div
							className="min-w-0"
							style={{ paddingLeft: `${Math.max(0, depth) * 1.25}rem` }}
						>
							<div className="flex items-center gap-2">
								<div className="font-medium">{row.title}</div>
								<Badge variant="outline">{nodeType}</Badge>
								{projectId === activeProjectId && (
									<Badge variant="secondary">active</Badge>
								)}
							</div>
							<div className="font-mono text-xs text-muted-foreground">
								{row.id}
							</div>
						</div>
					</TableCell>
					<TableCell>
						<Badge variant="outline">{row.status || "active"}</Badge>
					</TableCell>
					<TableCell className="max-w-xl whitespace-normal text-sm">
						{summary}
						{typeof row.data.identity_path === "string" && (
							<div className="mt-1">
								<SourceButton path={row.data.identity_path} onOpen={setSelectedSource}>
									Identity foundation
								</SourceButton>
							</div>
						)}
					</TableCell>
					<TableCell>
						{projectId ? countForProject(workOrders.data || [], projectId) : "n/a"}
					</TableCell>
					<TableCell>{projectId ? countForProject(runs.data || [], projectId) : "n/a"}</TableCell>
					<TableCell className="max-w-sm">
						<SourceButton path={row.source_relative_path} onOpen={setSelectedSource} />
						{hierarchySource && hierarchySource !== row.source_relative_path && (
							<div>
								<SourceButton path={hierarchySource} onOpen={setSelectedSource}>
									Hierarchy source
								</SourceButton>
							</div>
						)}
					</TableCell>
				</TableRow>,
				...renderRows(row.children, depth + 1),
			];
		});

	const readPane = (
		<div className="space-y-4">
			{rows.length === 0 && (
				<EmptyFactoryState
					title="No project hierarchy found"
					body="Add projects/project-hierarchy.yml and project-pipeline hierarchy metadata to render the factory project tree."
					sourcePath="projects/_shared/foundations/project-hierarchy-policy.md"
					onOpenSource={setSelectedSource}
				/>
			)}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Hierarchy</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Identity / summary</TableHead>
						<TableHead>Work orders</TableHead>
						<TableHead>Recent runs</TableHead>
						<TableHead>Source</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>{renderRows(rows)}</TableBody>
			</Table>
		</div>
	);

	return (
		<>
			<LDPSurface
				title="Project Hierarchy"
				description="Organization and project tree from projects/project-hierarchy.yml, with the active cockpit project highlighted."
				status={status}
				primaryAgent={PROJECTS_AGENT}
				turns={ldp.turns}
				readPane={readPane}
				inputValue={ldp.inputValue}
				inputPlaceholder="Ask PROJECT_HEALTH_MONITOR about project health, hierarchy, or active-project focus..."
				isThinking={ldp.isThinking}
				thinkingLabel={ldp.thinkingLabel}
				onInputChange={ldp.setInputValue}
				onSubmit={ldp.submit}
			/>
			<DocumentSheet
				path={selectedSource}
				title="Project source"
				onOpenChange={(open) => !open && setSelectedSource(null)}
			/>
			{ldp.streamElement}
		</>
	);
}
