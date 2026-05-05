import type {
	ArtifactReference,
	RightRailItem,
	RightRailItemKind,
	RightRailState,
	RunStatus,
	WorkOrderRunState,
} from "lib/types/factory-operator-console";
import { useCoordinatorSurfaceStore } from "lib/stores/coordinator-surface";
import { useFactoryWorkspaceStore } from "lib/stores/workspace";

export interface ChatWithProjectCoordinatorPayload {
	projectId: string;
	reference: ArtifactReference;
	suggestedPrompt?: string;
	sourceRoute?: string;
}

export type FactoryCoordinatorNavigate = (input: {
	to: "/factory/projects/$projectId";
	params: { projectId: string };
}) => void | Promise<void>;

export interface ActivateEntityMentionInput {
	projectId: string;
	reference: ArtifactReference;
	rightRailState: RightRailState;
	commitRightRailState: (state: RightRailState) => void;
}

export type RightRailLifecycleState =
	| "pending_action"
	| "running_work"
	| "recently_completed"
	| "reference"
	| "blocked_or_error"
	| "handoff";

const CHAT_WITH_PC_STORAGE_PREFIX = "factory:chat-with-pc";
const BLOCKER_ITEM_PREFIXES = [
	"blocker-run-",
	"blocker-gate-",
	"blocker-foundation-",
	"blocker-handoff-",
	"blocker-audit-",
];

function nowIso(): string {
	return new Date().toISOString();
}

function safeItemId(prefix: string, value: string): string {
	return `${prefix}${value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

function referenceItemId(reference: ArtifactReference): string {
	return safeItemId("reference-", `${reference.kind}-${reference.referenceId}`);
}

function sameReference(a: ArtifactReference, b: ArtifactReference): boolean {
	return a.kind === b.kind && a.referenceId === b.referenceId;
}

function mergeReferences(
	references: ArtifactReference[],
	reference: ArtifactReference,
): ArtifactReference[] {
	if (references.some((entry) => sameReference(entry, reference))) return references;
	return [reference, ...references];
}

function referenceSummary(reference: ArtifactReference): string {
	if (reference.summary) return reference.summary;
	if (reference.path) return reference.path;
	return `${reference.kind.replace(/_/g, " ")} reference`;
}

function storageKey(projectId: string): string {
	return `${CHAT_WITH_PC_STORAGE_PREFIX}:${projectId}`;
}

export function isBlockerSignalRightRailItem(item: RightRailItem): boolean {
	return BLOCKER_ITEM_PREFIXES.some((prefix) => item.itemId.startsWith(prefix));
}

export function mergeRightRailItems(
	currentItems: RightRailItem[],
	incomingItems: RightRailItem[],
): RightRailItem[] {
	const incomingIds = new Set(incomingItems.map((item) => item.itemId));
	const preserved = currentItems.filter(
		(item) => !incomingIds.has(item.itemId) && !isBlockerSignalRightRailItem(item),
	);
	return [...incomingItems, ...preserved].sort((a, b) => {
		const priorityRank: Record<RightRailItem["priority"], number> = {
			interrupting: 0,
			proactive: 1,
			ambient: 2,
		};
		const priority = priorityRank[a.priority] - priorityRank[b.priority];
		if (priority !== 0) return priority;
		return b.updatedAt.localeCompare(a.updatedAt);
	});
}

export function rightRailKindForRunStatus(status: RunStatus | WorkOrderRunState): RightRailItemKind {
	switch (status) {
		case "awaiting_approval":
		case "paused_for_gate":
		case "queued":
		case "ready":
			return "pending_action";
		case "running":
			return "running_work";
		case "completed":
			return "recently_completed";
		case "blocked":
		case "failed":
		case "canceled":
			return "blocked_or_error";
		default:
			return "reference";
	}
}

export function transitionRightRailItem(
	item: RightRailItem,
	nextLifecycle: RightRailLifecycleState,
): RightRailItem {
	return {
		...item,
		kind: nextLifecycle,
		priority:
			nextLifecycle === "blocked_or_error"
				? "interrupting"
				: nextLifecycle === "reference" || nextLifecycle === "recently_completed"
					? "ambient"
					: "proactive",
		updatedAt: nowIso(),
		expanded:
			nextLifecycle === "pending_action" ||
			nextLifecycle === "blocked_or_error" ||
			item.expanded,
	};
}

export function upsertReferenceRightRailItem(
	state: RightRailState,
	reference: ArtifactReference,
): { state: RightRailState; item: RightRailItem } {
	const itemId = referenceItemId(reference);
	const existing =
		state.items.find((item) => item.itemId === itemId) ??
		state.items.find((item) =>
			item.references.some((entry) => sameReference(entry, reference)),
		);
	const item: RightRailItem = {
		itemId,
		kind: "reference",
		title: reference.label,
		summary: referenceSummary(reference),
		priority: existing?.priority ?? "proactive",
		references: mergeReferences(existing?.references ?? [], reference),
		updatedAt: nowIso(),
		expanded: true,
		runState: existing?.runState,
		gate: existing?.gate,
		mockups: existing?.mockups,
		mergePacket: existing?.mergePacket,
		staleStateNotice: existing?.staleStateNotice,
		handoff: existing?.handoff,
	};
	const items = existing
		? state.items.map((entry) => (entry === existing ? item : entry))
		: [item, ...state.items];
	return {
		item,
		state: {
			...state,
			activeItemId: item.itemId,
			items,
			collapsed: false,
		},
	};
}

export function activateEntityMention({
	projectId,
	reference,
	rightRailState,
	commitRightRailState,
}: ActivateEntityMentionInput): RightRailItem {
	const { state, item } = upsertReferenceRightRailItem(rightRailState, reference);
	commitRightRailState(state);
	const workspace = useFactoryWorkspaceStore.getState();
	workspace.setRightRailActiveItemId(projectId, item.itemId);
	workspace.setRightRailCollapsed(false);
	useCoordinatorSurfaceStore
		.getState()
		.setActiveRightRailItemId(projectId, item.itemId);
	return item;
}

export function preloadComposerReference(
	projectId: string,
	reference: ArtifactReference,
): void {
	useCoordinatorSurfaceStore
		.getState()
		.setPreloadedComposerReference(projectId, reference);
	useCoordinatorSurfaceStore
		.getState()
		.setCurrentReferences(projectId, [reference]);
	useFactoryWorkspaceStore.getState().setActiveReferences([reference]);
}

export function chatWithProjectCoordinator(
	payload: ChatWithProjectCoordinatorPayload,
	navigate: FactoryCoordinatorNavigate,
): void {
	preloadComposerReference(payload.projectId, payload.reference);
	useFactoryWorkspaceStore.getState().setActiveProjectId(payload.projectId);
	useFactoryWorkspaceStore
		.getState()
		.setDraftComposerText(payload.projectId, payload.suggestedPrompt ?? "");
	if (typeof window !== "undefined") {
		window.sessionStorage.setItem(storageKey(payload.projectId), JSON.stringify(payload));
	}
	void navigate({
		to: "/factory/projects/$projectId",
		params: { projectId: payload.projectId },
	});
}

export function consumeChatWithProjectCoordinatorPayload(
	projectId: string,
): ChatWithProjectCoordinatorPayload | null {
	if (typeof window === "undefined") return null;
	const key = storageKey(projectId);
	const raw = window.sessionStorage.getItem(key);
	if (!raw) return null;
	window.sessionStorage.removeItem(key);
	try {
		const parsed = JSON.parse(raw) as ChatWithProjectCoordinatorPayload;
		if (!parsed?.projectId || !parsed?.reference?.referenceId) return null;
		return parsed;
	} catch {
		return null;
	}
}
