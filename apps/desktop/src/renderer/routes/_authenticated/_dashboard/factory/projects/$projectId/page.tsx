import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import {
	CoordinatorSurface,
	RightRailContextPanel,
} from "renderer/components/factory-primitives";
import { env } from "renderer/env.renderer";
import {
	activateEntityMention,
	chatWithProjectCoordinator,
	consumeChatWithProjectCoordinatorPayload,
	mergeRightRailItems,
	preloadComposerReference,
	type FactoryCoordinatorNavigate,
} from "renderer/lib/factory-coordinator/chat-with-pc";
import { electronTrpc, type ElectronRouterOutputs } from "renderer/lib/electron-trpc";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { useSetActiveProjectId } from "renderer/stores/active-project";
import {
	useCoordinatorActiveRightRailItemId,
	useCoordinatorPreloadedComposerReference,
	useCoordinatorSurfaceStore,
} from "lib/stores/coordinator-surface";
import { useFactoryWorkspaceStore } from "lib/stores/workspace";
import type {
	ArtifactReference,
	AuthorAttribution,
	CoordinatorDialogueTurn,
	CoordinatorMode,
	CoordinatorSurfaceContext,
	CoordinatorToolCall,
	RightRailItem,
	RightRailState,
} from "lib/types/factory-operator-console";
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
type CoordinatorRecentActivity =
	ElectronRouterOutputs["factory"]["coordinator"]["recentActivity"];

type CoordinatorStreamEvent =
	| {
			type: "turn_started";
			turnId: string;
			context: CoordinatorSurfaceContext;
	  }
	| { type: "chunk"; turnId: string; text: string }
	| {
			type: "tool_call_proposed";
			turnId: string;
			toolCall: CoordinatorToolCall;
	  }
	| {
			type: "right_rail_updated";
			projectId: string;
			rightRail: RightRailState;
	  }
	| {
			type: "message_persisted";
			turnId: string;
			messagePath: string;
			message: CoordinatorDialogueTurn;
	  }
	| {
			type: "complete";
			turnId: string;
			context: CoordinatorSurfaceContext;
	  }
	| {
			type: "error";
			turnId: string;
			plainEnglishSummary: string;
			detailsRef?: ArtifactReference;
	  };

interface ProjectCoordinatorRouteData {
	projectId: string;
	projects: FactoryRow[];
	workOrders: FactoryRow[];
	runs: FactoryRow[];
	pendingApprovals: PendingApproval[];
	coordinatorContext?: CoordinatorSurfaceContext;
	coordinatorHistory: CoordinatorDialogueTurn[];
	coordinatorRightRail?: RightRailState;
	coordinatorRecentActivity: CoordinatorRecentActivity;
	loadErrors: string[];
}

interface PendingTurn {
	key: string;
	message: string;
	references: ArtifactReference[];
	activeMode: CoordinatorMode;
	mockResponse?: string;
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

const OPERATOR_AUTHOR: AuthorAttribution = {
	user: "yuriy",
	isAgent: false,
	displayName: "Yuriy",
};
const EMPTY_RIGHT_RAIL_ITEMS: RightRailItem[] = [];

function localOnlyMockResponse(message: string): string | undefined {
	if (env.FACTORY_LOCAL_ONLY !== "true") return undefined;
	if (/spawn|run|approve|handoff|blocker/i.test(message)) {
		return "I found a high-stakes action in that request, so I prepared it for operator approval instead of running it directly.";
	}
	return "The project is active. I see current work orders, recent run evidence, and right-rail context loaded for this coordinator surface.";
}

async function guarded<T>(
	label: string,
	promise: Promise<T>,
	fallback: T,
	errors: string[],
): Promise<T> {
	try {
		return await promise;
	} catch (error) {
		errors.push(
			`${label}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return fallback;
	}
}

async function loadProjectCoordinatorRoute(
	projectId: string,
): Promise<ProjectCoordinatorRouteData> {
	const loadErrors: string[] = [];
	const [
		projects,
		workOrders,
		runs,
		pendingApprovals,
		coordinatorContext,
		coordinatorHistory,
		coordinatorRightRail,
		coordinatorRecentActivity,
	] = await Promise.all([
		guarded(
			"factory.dataset(projects)",
			trpcClient.factory.dataset.query({ dataset: "projects" }),
			[],
			loadErrors,
		),
		guarded(
			"factory.dataset(work_orders)",
			trpcClient.factory.dataset.query({ dataset: "work_orders" }),
			[],
			loadErrors,
		),
		guarded(
			"factory.dataset(runs)",
			trpcClient.factory.dataset.query({ dataset: "runs" }),
			[],
			loadErrors,
		),
		guarded(
			"factory.pendingApprovals",
			trpcClient.factory.pendingApprovals.query(),
			[],
			loadErrors,
		),
		guarded<CoordinatorSurfaceContext | undefined>(
			"factory.coordinator.context",
			trpcClient.factory.coordinator.context.query({ projectId }),
			undefined,
			loadErrors,
		),
		guarded<CoordinatorDialogueTurn[]>(
			"factory.coordinator.history",
			trpcClient.factory.coordinator.history.query({ projectId }),
			[],
			loadErrors,
		),
		guarded<RightRailState | undefined>(
			"factory.coordinator.rightRail",
			trpcClient.factory.coordinator.rightRail.query({ projectId }),
			undefined,
			loadErrors,
		),
		guarded<CoordinatorRecentActivity>(
			"factory.coordinator.recentActivity",
			trpcClient.factory.coordinator.recentActivity.query({ projectId }),
			[],
			loadErrors,
		),
	]);

	return {
		projectId,
		projects,
		workOrders,
		runs,
		pendingApprovals,
		coordinatorContext,
		coordinatorHistory,
		coordinatorRightRail,
		coordinatorRecentActivity,
		loadErrors,
	};
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

function upsertTurn(
	turns: CoordinatorDialogueTurn[],
	turn: CoordinatorDialogueTurn,
): CoordinatorDialogueTurn[] {
	if (turns.some((entry) => entry.turnId === turn.turnId)) {
		return turns.map((entry) => (entry.turnId === turn.turnId ? turn : entry));
	}
	return [...turns, turn].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function rightRailItemsSignature(items: RightRailItem[]): string {
	return items
		.map(
			(item) =>
				`${item.itemId}:${item.kind}:${item.priority}:${item.updatedAt}:${item.expanded ? "1" : "0"}`,
		)
		.join("|");
}

function railAcknowledgementKey(item: RightRailItem): string {
	return `${item.itemId}:${item.updatedAt}`;
}

function sameRightRailState(a: RightRailState, b: RightRailState): boolean {
	return (
		a.projectId === b.projectId &&
		a.activeItemId === b.activeItemId &&
		a.collapsed === b.collapsed &&
		rightRailItemsSignature(a.items) === rightRailItemsSignature(b.items)
	);
}

function buildRightRailState({
	projectId,
	project,
	activeWorkOrders,
	recentRuns,
	pendingApprovals,
	loadErrors,
}: {
	projectId: string;
	project?: FactoryRow;
	activeWorkOrders: FactoryRow[];
	recentRuns: FactoryRow[];
	pendingApprovals: PendingApproval[];
	loadErrors: string[];
}): RightRailState {
	const updatedAt = new Date().toISOString();
	const items: RightRailItem[] = [];

	if (loadErrors.length > 0) {
		items.push({
			itemId: "integration-load-errors",
			kind: "blocked_or_error",
			title: "Read-model load issue",
			summary: loadErrors.join(" | "),
			priority: "interrupting",
			references: [],
			updatedAt,
			expanded: true,
		});
	}

	items.push({
		itemId: "project-context",
		kind: "reference",
		title: project?.title || projectId,
		summary:
			dataText(project, "identity_summary") ||
			dataText(project, "summary") ||
			"Project metadata loaded from factory read models.",
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

	return {
		projectId,
		coordinatorRole: "PROJECT_COORDINATOR",
		activeItemId: items[0]?.itemId,
		items,
		collapsed: false,
		persistsAcrossModes: true,
	};
}

function fallbackContext(
	projectId: string,
	project: FactoryRow | undefined,
	rightRail: RightRailState,
): CoordinatorSurfaceContext {
	return {
		projectId,
		coordinatorRole: "PROJECT_COORDINATOR",
		activeMode: "general",
		activeDialogueId: `coordinator-${projectId}`,
		historyPath: `runs/dialogues/${projectId}/coordinator/`,
		rightRail,
		currentReferences: [projectReference(project, projectId)],
	};
}

function CoordinatorTurnSubscription({
	turn,
	projectId,
	onEvent,
	onError,
}: {
	turn: PendingTurn;
	projectId: string;
	onEvent: (event: CoordinatorStreamEvent) => void;
	onError: (error: unknown) => void;
}) {
	electronTrpc.factory.coordinator.sendTurn.useSubscription(
		{
			projectId,
			message: turn.message,
			author: OPERATOR_AUTHOR,
			references: turn.references,
			activeMode: turn.activeMode,
			mockResponse: turn.mockResponse,
		},
		{
			onData: (event) => onEvent(event as CoordinatorStreamEvent),
			onError,
		},
	);
	return null;
}

function ProjectCoordinatorPage() {
	const routeData = Route.useLoaderData();
	const navigate = useNavigate();
	const setActiveProjectId = useSetActiveProjectId();
	const utils = electronTrpc.useUtils();
	const rightRailCollapsed = useFactoryWorkspaceStore(
		(state) => state.rightRailCollapsed,
	);
	const rightRailWidthPx = useFactoryWorkspaceStore(
		(state) => state.rightRailWidthPx,
	);
	const setRightRailCollapsed = useFactoryWorkspaceStore(
		(state) => state.setRightRailCollapsed,
	);
	const setRightRailWidthPx = useFactoryWorkspaceStore(
		(state) => state.setRightRailWidthPx,
	);
	const setRightRailItems = useCoordinatorSurfaceStore(
		(state) => state.setRightRailItems,
	);
	const setActiveRightRailItemId = useCoordinatorSurfaceStore(
		(state) => state.setActiveRightRailItemId,
	);
	const setCurrentReferences = useCoordinatorSurfaceStore(
		(state) => state.setCurrentReferences,
	);
	const setStreamingTurnId = useCoordinatorSurfaceStore(
		(state) => state.setStreamingTurnId,
	);
	const upsertPendingToolCall = useCoordinatorSurfaceStore(
		(state) => state.upsertPendingToolCall,
	);
	const setPreloadedComposerReference = useCoordinatorSurfaceStore(
		(state) => state.setPreloadedComposerReference,
	);
	const rightRailItems = useCoordinatorSurfaceStore(
		(state) =>
			state.rightRailItemsByProject[routeData.projectId] ??
			EMPTY_RIGHT_RAIL_ITEMS,
	);
	const activeRightRailItemId = useCoordinatorActiveRightRailItemId(
		routeData.projectId,
	);
	const preloadedComposerReference = useCoordinatorPreloadedComposerReference(
		routeData.projectId,
	);
	const draftComposerText = useFactoryWorkspaceStore(
		(state) => state.draftComposerTextByProject[routeData.projectId] ?? "",
	);
	const setDraftComposerText = useFactoryWorkspaceStore(
		(state) => state.setDraftComposerText,
	);
	const activeCoordinatorMode = useFactoryWorkspaceStore(
		(state) => state.activeCoordinatorMode,
	);
	const approveToolCall = electronTrpc.factory.coordinator.approveToolCall.useMutation();

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

	const fallbackRightRailState = useMemo(
		() =>
			buildRightRailState({
				projectId: routeData.projectId,
				project,
				activeWorkOrders,
				recentRuns,
				pendingApprovals: projectPendingApprovals,
				loadErrors: routeData.loadErrors,
			}),
		[
			activeWorkOrders,
			project,
			projectPendingApprovals,
			recentRuns,
			routeData.loadErrors,
			routeData.projectId,
		],
	);
	const initialRightRail = routeData.coordinatorRightRail ?? fallbackRightRailState;
	const initialContext =
		routeData.coordinatorContext ??
		fallbackContext(routeData.projectId, project, initialRightRail);
	const [coordinatorContext, setCoordinatorContext] =
		useState<CoordinatorSurfaceContext>(initialContext);
	const [baseRightRailState, setBaseRightRailState] =
		useState<RightRailState>(initialRightRail);
	const [turns, setTurns] = useState<CoordinatorDialogueTurn[]>(
		routeData.coordinatorHistory,
	);
	const [streamingTurn, setStreamingTurn] =
		useState<CoordinatorDialogueTurn | null>(null);
	const [pendingTurn, setPendingTurn] = useState<PendingTurn | null>(null);
	const [acknowledgedRailItemKeys, setAcknowledgedRailItemKeys] = useState<
		Set<string>
	>(() => new Set());

	useEffect(() => {
		const nextRightRail = routeData.coordinatorRightRail ?? fallbackRightRailState;
		const nextContext =
			routeData.coordinatorContext ??
			fallbackContext(routeData.projectId, project, nextRightRail);
		setBaseRightRailState(nextRightRail);
		setCoordinatorContext(nextContext);
		setTurns(routeData.coordinatorHistory);
		setRightRailItems(routeData.projectId, nextRightRail.items);
		setActiveRightRailItemId(
			routeData.projectId,
			nextRightRail.activeItemId ?? null,
		);
		setCurrentReferences(routeData.projectId, nextContext.currentReferences);
	}, [
		fallbackRightRailState,
		project,
		routeData.coordinatorContext,
		routeData.coordinatorHistory,
		routeData.coordinatorRightRail,
		routeData.projectId,
		setActiveRightRailItemId,
		setCurrentReferences,
		setRightRailItems,
	]);

	useEffect(() => {
		const payload = consumeChatWithProjectCoordinatorPayload(routeData.projectId);
		if (!payload) return;
		preloadComposerReference(routeData.projectId, payload.reference);
		setDraftComposerText(routeData.projectId, payload.suggestedPrompt ?? "");
	}, [routeData.projectId, setDraftComposerText]);

	const sourceRightRailItems =
		rightRailItems.length > 0 ? rightRailItems : baseRightRailState.items;
	const liveRightRailItems = useMemo(
		() =>
			sourceRightRailItems.filter(
				(item) => !acknowledgedRailItemKeys.has(railAcknowledgementKey(item)),
			),
		[sourceRightRailItems, acknowledgedRailItemKeys],
	);
	const liveRightRailState: RightRailState = useMemo(
		() => ({
			...baseRightRailState,
			activeItemId: activeRightRailItemId ?? baseRightRailState.activeItemId,
			items: liveRightRailItems,
			collapsed: rightRailCollapsed,
		}),
		[
			activeRightRailItemId,
			baseRightRailState,
			liveRightRailItems,
			rightRailCollapsed,
		],
	);
	const liveRightRailStateRef = useRef(liveRightRailState);

	useEffect(() => {
		liveRightRailStateRef.current = liveRightRailState;
	}, [liveRightRailState]);

	const commitRightRailState = useCallback(
		(nextState: RightRailState) => {
			setBaseRightRailState((previous) =>
				sameRightRailState(previous, nextState) ? previous : nextState,
			);
			const storeState = useCoordinatorSurfaceStore.getState();
			const currentItems =
				storeState.rightRailItemsByProject[routeData.projectId] ?? [];
			if (rightRailItemsSignature(currentItems) !== rightRailItemsSignature(nextState.items)) {
				setRightRailItems(routeData.projectId, nextState.items);
			}
			const currentActiveItem =
				storeState.activeRightRailItemIdByProject[routeData.projectId] ?? null;
			const nextActiveItem = nextState.activeItemId ?? null;
			if (currentActiveItem !== nextActiveItem) {
				setActiveRightRailItemId(routeData.projectId, nextActiveItem);
			}
		},
		[routeData.projectId, setActiveRightRailItemId, setRightRailItems],
	);

	const coordinatorSubscriptionInput = useMemo(
		() => ({ projectId: routeData.projectId }),
		[routeData.projectId],
	);
	const handleRightRailSubscription = useCallback(
		(state: RightRailState) => commitRightRailState(state),
		[commitRightRailState],
	);
	const handleBlockerSubscription = useCallback(
		(items: RightRailItem[]) => {
			const current = liveRightRailStateRef.current;
			commitRightRailState({
				...current,
				items: mergeRightRailItems(current.items, items),
			});
		},
		[commitRightRailState],
	);
	const rightRailSubscriptionOptions = useMemo(
		() => ({ onData: handleRightRailSubscription }),
		[handleRightRailSubscription],
	);
	const blockerSubscriptionOptions = useMemo(
		() => ({ onData: handleBlockerSubscription }),
		[handleBlockerSubscription],
	);

	electronTrpc.factory.coordinator.subscribeBlockers.useSubscription(
		coordinatorSubscriptionInput,
		blockerSubscriptionOptions,
	);

	electronTrpc.factory.coordinator.subscribeRightRail.useSubscription(
		coordinatorSubscriptionInput,
		rightRailSubscriptionOptions,
	);

	const navigateToCoordinator = useCallback<FactoryCoordinatorNavigate>(
		(input) => {
			void navigate(input);
		},
		[navigate],
	);

	const activateReference = useCallback(
		(reference: ArtifactReference) => {
			activateEntityMention({
				projectId: routeData.projectId,
				reference,
				rightRailState: liveRightRailState,
				commitRightRailState,
			});
		},
		[commitRightRailState, liveRightRailState, routeData.projectId],
	);

	const chatAboutReference = useCallback(
		(reference: ArtifactReference) => {
			chatWithProjectCoordinator(
				{
					projectId: routeData.projectId,
					reference,
					suggestedPrompt: `Let's look at ${reference.label}.`,
					sourceRoute:
						typeof window !== "undefined" ? window.location.pathname : undefined,
				},
				navigateToCoordinator,
			);
		},
		[navigateToCoordinator, routeData.projectId],
	);

	const toggleRailItem = useCallback(
		(itemId: string) => {
			const nextItems = liveRightRailState.items.map((item) =>
				item.itemId === itemId ? { ...item, expanded: !item.expanded } : item,
			);
			commitRightRailState({
				...liveRightRailState,
				activeItemId: itemId,
				items: nextItems,
			});
		},
		[commitRightRailState, liveRightRailState],
	);

	const acknowledgeRailItem = useCallback(
		(itemId: string) => {
			const item = liveRightRailState.items.find((entry) => entry.itemId === itemId);
			if (!item) return;
			const acknowledgementKey = railAcknowledgementKey(item);
			setAcknowledgedRailItemKeys((current) => {
				if (current.has(acknowledgementKey)) return current;
				const next = new Set(current);
				next.add(acknowledgementKey);
				return next;
			});
			const nextItems = liveRightRailState.items.filter(
				(entry) => railAcknowledgementKey(entry) !== acknowledgementKey,
			);
			commitRightRailState({
				...liveRightRailState,
				activeItemId: nextItems[0]?.itemId,
				items: nextItems,
			});
		},
		[commitRightRailState, liveRightRailState],
	);

	const approveRailGate = useCallback(
		(item: RightRailItem) => {
			const toolCallId =
				item.gate?.gateId.replace(/^gate-/, "") ||
				item.itemId.replace(/^rail-/, "");
			if (!toolCallId) return;
			approveToolCall.mutate({
				projectId: routeData.projectId,
				toolCallId,
				approved: true,
				decidedBy: OPERATOR_AUTHOR,
			});
		},
		[approveToolCall, routeData.projectId],
	);

	const composerReferences = useMemo(() => {
		if (preloadedComposerReference) return [preloadedComposerReference];
		return [];
	}, [preloadedComposerReference]);

	const attachReference = useCallback(() => {
		const reference = projectReference(project, routeData.projectId);
		setPreloadedComposerReference(routeData.projectId, reference);
		setCurrentReferences(routeData.projectId, [reference]);
	}, [
		project,
		routeData.projectId,
		setCurrentReferences,
		setPreloadedComposerReference,
	]);

	const handleSend = useCallback(
		(message: string) => {
			if (pendingTurn) return;
			const createdAt = new Date().toISOString();
			const key = `${createdAt}-${Math.random().toString(16).slice(2)}`;
			const references = composerReferences;
			const operatorTurn: CoordinatorDialogueTurn = {
				turnId: `operator-${key}`,
				role: "operator",
				author: OPERATOR_AUTHOR,
				text: message,
				references,
				createdAt,
			};
			setTurns((previous) => upsertTurn(previous, operatorTurn));
			setPendingTurn({
				key,
				message,
				references,
				activeMode: activeCoordinatorMode,
				mockResponse: localOnlyMockResponse(message),
			});
			setDraftComposerText(routeData.projectId, "");
			setStreamingTurnId(routeData.projectId, operatorTurn.turnId);
		},
		[
			activeCoordinatorMode,
			composerReferences,
			pendingTurn,
			routeData.projectId,
			setDraftComposerText,
			setStreamingTurnId,
		],
	);

	const handleStreamEvent = useCallback(
		(event: CoordinatorStreamEvent) => {
			if (event.type === "turn_started") {
				setCoordinatorContext(event.context);
				setStreamingTurnId(routeData.projectId, event.turnId);
				return;
			}
			if (event.type === "chunk") {
				const createdAt = new Date().toISOString();
				setStreamingTurn((previous) => ({
					turnId: `${event.turnId}-streaming-agent`,
					role: "agent",
					author: {
						user: "PROJECT_COORDINATOR",
						role: "PROJECT_COORDINATOR",
						isAgent: true,
						displayName: "PROJECT_COORDINATOR",
					},
					agentRole: "PROJECT_COORDINATOR",
					text:
						previous?.turnId === `${event.turnId}-streaming-agent`
							? `${previous.text}${event.text}`
							: event.text,
					references: composerReferences,
					createdAt: previous?.createdAt ?? createdAt,
				}));
				return;
			}
			if (event.type === "tool_call_proposed") {
				upsertPendingToolCall(routeData.projectId, event.toolCall);
				return;
			}
			if (event.type === "right_rail_updated") {
				commitRightRailState(event.rightRail);
				return;
			}
			if (event.type === "message_persisted") {
				setTurns((previous) => upsertTurn(previous, event.message));
				setStreamingTurn(null);
				return;
			}
			if (event.type === "complete") {
				setCoordinatorContext(event.context);
				setPendingTurn(null);
				setStreamingTurn(null);
				setStreamingTurnId(routeData.projectId, null);
				void utils.factory.coordinator.history.invalidate({ projectId: routeData.projectId });
				void utils.factory.coordinator.rightRail.invalidate({ projectId: routeData.projectId });
				return;
			}
			if (event.type === "error") {
				setTurns((previous) =>
					upsertTurn(previous, {
						turnId: `error-${event.turnId}`,
						role: "system",
						author: {
							user: "factory",
							isAgent: false,
							displayName: "Factory",
						},
						text: event.plainEnglishSummary,
						references: event.detailsRef ? [event.detailsRef] : [],
						createdAt: new Date().toISOString(),
					}),
				);
				setPendingTurn(null);
				setStreamingTurn(null);
				setStreamingTurnId(routeData.projectId, null);
			}
		},
		[
			commitRightRailState,
			composerReferences,
			routeData.projectId,
			setStreamingTurnId,
			upsertPendingToolCall,
			utils.factory.coordinator.history,
			utils.factory.coordinator.rightRail,
		],
	);

	const handleStreamError = useCallback(
		(error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			setTurns((previous) =>
				upsertTurn(previous, {
					turnId: `error-${Date.now()}`,
					role: "system",
					author: { user: "factory", isAgent: false, displayName: "Factory" },
					text: message,
					references: [],
					createdAt: new Date().toISOString(),
				}),
			);
			setPendingTurn(null);
			setStreamingTurn(null);
			setStreamingTurnId(routeData.projectId, null);
		},
		[routeData.projectId, setStreamingTurnId],
	);

	const displayedTurns = useMemo(() => {
		if (!streamingTurn) return turns;
		if (turns.some((turn) => turn.turnId === streamingTurn.turnId)) return turns;
		return [...turns, streamingTurn];
	}, [streamingTurn, turns]);

	const inlineCards: Record<string, ReactNode> = {};
	const rightRail = (
		<RightRailContextPanel
			state={liveRightRailState}
			widthPx={rightRailWidthPx}
			onWidthChange={setRightRailWidthPx}
			onCollapse={() => setRightRailCollapsed(!rightRailCollapsed)}
			onExpandItem={toggleRailItem}
			onOpenReference={activateReference}
			onChatWithReference={chatAboutReference}
			onAcknowledgeItem={acknowledgeRailItem}
			onApproveGate={approveRailGate}
		/>
	);

	return (
		<div className="h-full min-h-0 w-full overflow-hidden" data-factory-project-route>
			<CoordinatorSurface
				context={{
					...coordinatorContext,
					activeMode: activeCoordinatorMode,
					rightRail: liveRightRailState,
					currentReferences: composerReferences,
				}}
				turns={displayedTurns}
				rightRail={rightRail}
				inlineCards={inlineCards}
				draftComposerText={draftComposerText}
				composerReferences={composerReferences}
				isPending={Boolean(pendingTurn)}
				onSend={handleSend}
				onAttach={attachReference}
				onDraftChange={(nextDraft) =>
					setDraftComposerText(routeData.projectId, nextDraft)
				}
				onMentionActivate={activateReference}
			/>
			{pendingTurn && (
				<CoordinatorTurnSubscription
					turn={pendingTurn}
					projectId={routeData.projectId}
					onEvent={handleStreamEvent}
					onError={handleStreamError}
				/>
			)}
		</div>
	);
}
