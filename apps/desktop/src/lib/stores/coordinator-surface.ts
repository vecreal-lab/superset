import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
	ArtifactReference,
	CoordinatorToolCall,
	RightRailItem,
} from "lib/types/factory-operator-console";

interface CoordinatorSurfaceStoreState {
	rightRailItemsByProject: Record<string, RightRailItem[]>;
	activeRightRailItemIdByProject: Record<string, string | null>;
	currentReferencesByProject: Record<string, ArtifactReference[]>;
	streamingTurnIdByProject: Record<string, string | null>;
	pendingToolCallsByProject: Record<string, CoordinatorToolCall[]>;
	preloadedComposerReferenceByProject: Record<string, ArtifactReference | null>;
	lastCoordinatorEventCursorByProject: Record<string, string | null>;
	setRightRailItems: (projectId: string, items: RightRailItem[]) => void;
	upsertRightRailItem: (projectId: string, item: RightRailItem) => void;
	removeRightRailItem: (projectId: string, itemId: string) => void;
	setActiveRightRailItemId: (projectId: string, itemId: string | null) => void;
	setCurrentReferences: (
		projectId: string,
		references: ArtifactReference[],
	) => void;
	setStreamingTurnId: (projectId: string, turnId: string | null) => void;
	setPendingToolCalls: (
		projectId: string,
		toolCalls: CoordinatorToolCall[],
	) => void;
	upsertPendingToolCall: (
		projectId: string,
		toolCall: CoordinatorToolCall,
	) => void;
	clearPendingToolCall: (projectId: string, toolCallId: string) => void;
	setPreloadedComposerReference: (
		projectId: string,
		reference: ArtifactReference | null,
	) => void;
	setLastCoordinatorEventCursor: (
		projectId: string,
		cursor: string | null,
	) => void;
	resetProjectCoordinatorSurface: (projectId: string) => void;
}

function withoutProject<T>(
	record: Record<string, T>,
	projectId: string,
): Record<string, T> {
	const next = { ...record };
	delete next[projectId];
	return next;
}

export const useCoordinatorSurfaceStore =
	create<CoordinatorSurfaceStoreState>()(
		devtools(
			(set) => ({
				rightRailItemsByProject: {},
				activeRightRailItemIdByProject: {},
				currentReferencesByProject: {},
				streamingTurnIdByProject: {},
				pendingToolCallsByProject: {},
				preloadedComposerReferenceByProject: {},
				lastCoordinatorEventCursorByProject: {},
				setRightRailItems: (projectId, items) =>
					set((state) => ({
						rightRailItemsByProject: {
							...state.rightRailItemsByProject,
							[projectId]: items,
						},
					})),
				upsertRightRailItem: (projectId, item) =>
					set((state) => {
						const current = state.rightRailItemsByProject[projectId] ?? [];
						const existingIndex = current.findIndex(
							(currentItem) => currentItem.itemId === item.itemId,
						);
						const next =
							existingIndex >= 0
								? current.map((currentItem, index) =>
										index === existingIndex ? item : currentItem,
									)
								: [item, ...current];
						return {
							rightRailItemsByProject: {
								...state.rightRailItemsByProject,
								[projectId]: next,
							},
						};
					}),
				removeRightRailItem: (projectId, itemId) =>
					set((state) => ({
						rightRailItemsByProject: {
							...state.rightRailItemsByProject,
							[projectId]: (
								state.rightRailItemsByProject[projectId] ?? []
							).filter((item) => item.itemId !== itemId),
						},
						activeRightRailItemIdByProject: {
							...state.activeRightRailItemIdByProject,
							[projectId]:
								state.activeRightRailItemIdByProject[projectId] === itemId
									? null
									: state.activeRightRailItemIdByProject[projectId] ?? null,
						},
					})),
				setActiveRightRailItemId: (projectId, itemId) =>
					set((state) => ({
						activeRightRailItemIdByProject: {
							...state.activeRightRailItemIdByProject,
							[projectId]: itemId,
						},
					})),
				setCurrentReferences: (projectId, references) =>
					set((state) => ({
						currentReferencesByProject: {
							...state.currentReferencesByProject,
							[projectId]: references,
						},
					})),
				setStreamingTurnId: (projectId, turnId) =>
					set((state) => ({
						streamingTurnIdByProject: {
							...state.streamingTurnIdByProject,
							[projectId]: turnId,
						},
					})),
				setPendingToolCalls: (projectId, toolCalls) =>
					set((state) => ({
						pendingToolCallsByProject: {
							...state.pendingToolCallsByProject,
							[projectId]: toolCalls,
						},
					})),
				upsertPendingToolCall: (projectId, toolCall) =>
					set((state) => {
						const current = state.pendingToolCallsByProject[projectId] ?? [];
						const existingIndex = current.findIndex(
							(currentToolCall) =>
								currentToolCall.toolCallId === toolCall.toolCallId,
						);
						const next =
							existingIndex >= 0
								? current.map((currentToolCall, index) =>
										index === existingIndex ? toolCall : currentToolCall,
									)
								: [...current, toolCall];
						return {
							pendingToolCallsByProject: {
								...state.pendingToolCallsByProject,
								[projectId]: next,
							},
						};
					}),
				clearPendingToolCall: (projectId, toolCallId) =>
					set((state) => ({
						pendingToolCallsByProject: {
							...state.pendingToolCallsByProject,
							[projectId]: (
								state.pendingToolCallsByProject[projectId] ?? []
							).filter((toolCall) => toolCall.toolCallId !== toolCallId),
						},
					})),
				setPreloadedComposerReference: (projectId, reference) =>
					set((state) => ({
						preloadedComposerReferenceByProject: {
							...state.preloadedComposerReferenceByProject,
							[projectId]: reference,
						},
					})),
				setLastCoordinatorEventCursor: (projectId, cursor) =>
					set((state) => ({
						lastCoordinatorEventCursorByProject: {
							...state.lastCoordinatorEventCursorByProject,
							[projectId]: cursor,
						},
					})),
				resetProjectCoordinatorSurface: (projectId) =>
					set((state) => ({
						rightRailItemsByProject: withoutProject(
							state.rightRailItemsByProject,
							projectId,
						),
						activeRightRailItemIdByProject: withoutProject(
							state.activeRightRailItemIdByProject,
							projectId,
						),
						currentReferencesByProject: withoutProject(
							state.currentReferencesByProject,
							projectId,
						),
						streamingTurnIdByProject: withoutProject(
							state.streamingTurnIdByProject,
							projectId,
						),
						pendingToolCallsByProject: withoutProject(
							state.pendingToolCallsByProject,
							projectId,
						),
						preloadedComposerReferenceByProject: withoutProject(
							state.preloadedComposerReferenceByProject,
							projectId,
						),
						lastCoordinatorEventCursorByProject: withoutProject(
							state.lastCoordinatorEventCursorByProject,
							projectId,
						),
					})),
			}),
			{ name: "CoordinatorSurfaceStore" },
		),
	);

export const useCoordinatorRightRailItems = (projectId: string) =>
	useCoordinatorSurfaceStore(
		(state) => state.rightRailItemsByProject[projectId] ?? [],
	);

export const useCoordinatorActiveRightRailItemId = (projectId: string) =>
	useCoordinatorSurfaceStore(
		(state) => state.activeRightRailItemIdByProject[projectId] ?? null,
	);

export const useCoordinatorCurrentReferences = (projectId: string) =>
	useCoordinatorSurfaceStore(
		(state) => state.currentReferencesByProject[projectId] ?? [],
	);

export const useCoordinatorStreamingTurnId = (projectId: string) =>
	useCoordinatorSurfaceStore(
		(state) => state.streamingTurnIdByProject[projectId] ?? null,
	);

export const useCoordinatorPendingToolCalls = (projectId: string) =>
	useCoordinatorSurfaceStore(
		(state) => state.pendingToolCallsByProject[projectId] ?? [],
	);

export const useCoordinatorPreloadedComposerReference = (projectId: string) =>
	useCoordinatorSurfaceStore(
		(state) => state.preloadedComposerReferenceByProject[projectId] ?? null,
	);

export const useCoordinatorLastEventCursor = (projectId: string) =>
	useCoordinatorSurfaceStore(
		(state) => state.lastCoordinatorEventCursorByProject[projectId] ?? null,
	);
