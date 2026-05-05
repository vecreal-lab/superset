import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, type ReactNode } from "react";
import {
	CoordinatorSurface,
	RightRailContextPanel,
} from "renderer/components/factory-primitives";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { useSetActiveProjectId } from "renderer/stores/active-project";
import type {
	ArtifactReference,
	CoordinatorSurfaceContext,
	DialogueTurn,
	RightRailItem,
	RightRailState,
} from "lib/types/factory-operator-console";
import type { ElectronRouterOutputs } from "renderer/lib/electron-trpc";
import {
	formatDate,
	rowMatchesProject,
	type FactoryRow,
} from "../../components/FactoryView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/projects/$projectId/",
)({
	loader: async ({ params }) => loadProjectCoordinatorRoute(params.projectId),
	component: ProjectCoordinatorPage,
});

type PendingApproval = ElectronRouterOutputs["factory"]["pendingApprovals"][number];

interface ProjectCoordinatorRouteData {
	projectId: string;
	projects: FactoryRow[];
	workOrders: FactoryRow[];
	runs: FactoryRow[];
	pendingApprovals: PendingApproval[];
	loadError?: string;
}

const ACTIVE_WORK_ORDER_STATES = new Set([
	"queued",
	"ready",
	"blocked",
	"running",
	"in_flight",
	"awaiting_approval",
	"paused_for_gate",
	"failed",
]);

async function loadProjectCoordinatorRoute(
	projectId: string,
): Promise<ProjectCoordinatorRouteData> {
	try {
		const [projects, workOrders, runs, pendingApprovals] = await Promise.all([
			trpcClient.factory.dataset.query({ dataset: "projects" }),
			trpcClient.factory.dataset.query({ dataset: "work_orders" }),
			trpcClient.factory.dataset.query({ dataset: "runs" }),
			trpcClient.factory.pendingApprovals.query(),
		]);

		return { projectId, projects, workOrders, runs, pendingApprovals };
	} catch (error) {
		const loadError = error instanceof Error ? error.message : "Unknown load error";
		return {
			projectId,
			projects: [],
			workOrders: [],
			runs: [],
			pendingApprovals: [],
			loadError,
		};
	}
}

function dataText(row: FactoryRow | null | undefined, key: string): string | null {
	const value = row?.data[key];
	return typeof value === "string" && value ? value : null;
}

function rowState(row: FactoryRow): string {
	return (
		dataText(row, "gate_state") ||
		dataText(row, "state") ||
		dataText(row, "run_state") ||
		row.status ||
		"unknown"
	).toLowerCase();
}

function rowProjectId(row: FactoryRow): string | null {
	return dataText(row, "project_id");
}

function rowReference(row: FactoryRow, kind: ArtifactReference["kind"]): ArtifactReference {
	return {
		referenceId: row.id,
		kind,
		label: row.title || row.id,
		projectId: rowProjectId(row) ?? undefined,
		path: row.source_relative_path,
		route:
			kind === "work_order"
				? `/factory/work-orders/${row.id}`
				: row.source_relative_path,
		summary: row.status ?? undefined,
	};
}

function projectReference(project: FactoryRow | undefined, projectId: string): ArtifactReference {
	return {
		referenceId: projectId,
		kind: "project",
		label: project?.title || projectId,
		projectId,
		path: project?.source_relative_path,
		route: `/factory/projects/${projectId}`,
		summary:
			dataText(project, "identity_summary") ||
			dataText(project, "summary") ||
			"Project metadata is available from the factory read model.",
	};
}

function sortRecentRows(rows: FactoryRow[]): FactoryRow[] {
	return [...rows].sort((a, b) => {
		const aTime = a.modified_at ? new Date(a.modified_at).getTime() : 0;
		const bTime = b.modified_at ? new Date(b.modified_at).getTime() : 0;
		return bTime - aTime;
	});
}

function buildRightRailState({
	projectId,
	project,
	activeWorkOrders,
	recentRuns,
	pendingApprovals,
	loadError,
}: {
	projectId: string;
	project?: FactoryRow;
	activeWorkOrders: FactoryRow[];
	recentRuns: FactoryRow[];
	pendingApprovals: PendingApproval[];
	loadError?: string;
}): RightRailState {
	const updatedAt = new Date().toISOString();
	const items: RightRailItem[] = [];

	if (loadError) {
		items.push({
			itemId: "stream-a-load-error",
			kind: "blocked_or_error",
			title: "Read-model load issue",
			summary: loadError,
			priority: "interrupting",
			references: [],
			updatedAt,
			expanded: true,
		});
	}

	items.push({
		itemId: "stream-a-project-context",
		kind: "reference",
		title: project?.title || projectId,
		summary:
			dataText(project, "identity_summary") ||
			dataText(project, "summary") ||
			"Project metadata loaded from factory.dataset('projects').",
		priority: "ambient",
		references: [projectReference(project, projectId)],
		updatedAt,
		expanded: true,
	});

	for (const approval of pendingApprovals.slice(0, 3)) {
		items.push({
			itemId: `approval-${approval.id}`,
			kind: "pending_action",
			title: approval.title || approval.work_order_id,
			summary: `${approval.gate} is waiting for operator review.`,
			priority: "interrupting",
			references: [
				{
					referenceId: approval.work_order_id,
					kind: "work_order",
					label: approval.work_order_id,
					projectId,
					route: `/factory/work-orders/${approval.work_order_id}`,
					path: approval.run_relative_path,
				},
			],
			updatedAt,
			expanded: true,
		});
	}

	for (const workOrder of activeWorkOrders.slice(0, 4)) {
		const state = rowState(workOrder);
		items.push({
			itemId: `wo-${workOrder.id}`,
			kind:
				state.includes("blocked") || state.includes("failed")
					? "blocked_or_error"
					: "running_work",
			title: workOrder.title || workOrder.id,
			summary: `${state} - ${formatDate(workOrder.modified_at)}`,
			priority:
				state.includes("blocked") || state.includes("failed")
					? "interrupting"
					: "proactive",
			references: [rowReference(workOrder, "work_order")],
			updatedAt,
			expanded: items.length < 3,
		});
	}

	for (const run of recentRuns.slice(0, 4)) {
		items.push({
			itemId: `run-${run.id}`,
			kind: rowState(run).includes("failed")
				? "blocked_or_error"
				: "recently_completed",
			title: run.title || run.id,
			summary: `${rowState(run)} - ${formatDate(run.modified_at)}`,
			priority: rowState(run).includes("failed") ? "interrupting" : "ambient",
			references: [rowReference(run, "run")],
			updatedAt,
			expanded: false,
		});
	}

	if (items.length === 1) {
		items.push({
			itemId: "stream-bc-contract-gap",
			kind: "reference",
			title: "Coordinator runtime pending",
			summary:
				"Stream A renders the shell and route; Streams B and C will replace stubs with coordinator context, history, and durable rail state.",
			priority: "ambient",
			references: [],
			updatedAt,
			expanded: true,
		});
	}

	return {
		projectId,
		coordinatorRole: "PROJECT_COORDINATOR",
		activeItemId: items[0]?.itemId,
		items,
		collapsed: false,
		persistsAcrossModes: true,
	};
}

function ProjectCoordinatorPage() {
	const routeData = Route.useLoaderData();
	const setActiveProjectId = useSetActiveProjectId();

	useEffect(() => {
		setActiveProjectId(routeData.projectId);
	}, [routeData.projectId, setActiveProjectId]);

	const project = useMemo(
		() =>
			routeData.projects.find(
				(row) =>
					row.id === routeData.projectId ||
					rowProjectId(row) === routeData.projectId,
			),
		[routeData.projectId, routeData.projects],
	);
	const activeWorkOrders = useMemo(
		() =>
			routeData.workOrders.filter(
				(row) =>
					rowMatchesProject(row, routeData.projectId) &&
					ACTIVE_WORK_ORDER_STATES.has(rowState(row)),
			),
		[routeData.projectId, routeData.workOrders],
	);
	const recentRuns = useMemo(
		() =>
			sortRecentRows(
				routeData.runs.filter((row) =>
					rowMatchesProject(row, routeData.projectId),
				),
			),
		[routeData.projectId, routeData.runs],
	);
	const projectPendingApprovals = useMemo(() => {
		const projectWorkOrderIds = new Set(
			routeData.workOrders
				.filter((row) => rowMatchesProject(row, routeData.projectId))
				.map((row) => row.id),
		);
		return routeData.pendingApprovals.filter(
			(approval) =>
				projectWorkOrderIds.has(approval.work_order_id) ||
				approval.run_relative_path.includes(routeData.projectId),
		);
	}, [routeData.pendingApprovals, routeData.projectId, routeData.workOrders]);

	// TODO(C26.3 Stream B): Replace this stub with factory.coordinator.context({ projectId }).
	const rightRailState = useMemo(
		() =>
			buildRightRailState({
				projectId: routeData.projectId,
				project,
				activeWorkOrders,
				recentRuns,
				pendingApprovals: projectPendingApprovals,
				loadError: routeData.loadError,
			}),
		[
			activeWorkOrders,
			project,
			projectPendingApprovals,
			recentRuns,
			routeData.loadError,
			routeData.projectId,
		],
	);

	// TODO(C26.3 Stream B): Replace with coordinator runtime context.
	const coordinatorContext: CoordinatorSurfaceContext = useMemo(
		() => ({
			projectId: routeData.projectId,
			coordinatorRole: "PROJECT_COORDINATOR",
			activeMode: "general",
			activeDialogueId: `${routeData.projectId}-coordinator-stream-a`,
			historyPath: `runs/dialogues/${routeData.projectId}/coordinator/messages.jsonl`,
			rightRail: rightRailState,
			currentReferences: [projectReference(project, routeData.projectId)],
		}),
		[project, rightRailState, routeData.projectId],
	);

	// TODO(C26.3 Stream C): Hydrate turns from coordinator persistence.
	const turns: DialogueTurn[] = [];
	// TODO(C26.3 Stream B+C): Inline cards will be generated from stream events and persisted tool calls.
	const inlineCards: Record<string, ReactNode> = {};
	// TODO(C26.3 Stream B): Wire to factory.coordinator.sendTurn observable subscription.
	const sendCoordinatorTurn = (_message: string) => undefined;
	// TODO(C26.3 Stream C): Wire attachments to coordinator references and draft composer state.
	const attachReference = () => undefined;

	const rightRail = (
		<RightRailContextPanel
			state={rightRailState}
			onCollapse={() => undefined}
			onExpandItem={() => undefined}
			onOpenReference={() => undefined}
		/>
	);

	return (
		<div className="h-full min-h-0 w-full overflow-hidden" data-factory-project-route>
			<CoordinatorSurface
				context={coordinatorContext}
				turns={turns}
				rightRail={rightRail}
				inlineCards={inlineCards}
				onSend={sendCoordinatorTurn}
				onAttach={attachReference}
			/>
		</div>
	);
}
