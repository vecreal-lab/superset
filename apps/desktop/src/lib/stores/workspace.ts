import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import type {
	ArtifactReference,
	CoordinatorMode,
	WorkspaceContext,
} from "lib/types/factory-operator-console";

export const DEFAULT_FACTORY_PROJECT_ID = "software-factory";
export const DEFAULT_RIGHT_RAIL_WIDTH_PX = 360;
export const MIN_RIGHT_RAIL_WIDTH_PX = 240;
export const MAX_RIGHT_RAIL_WIDTH_PX = 480;
export const COLLAPSED_RIGHT_RAIL_WIDTH_PX = 44;

export type FactoryThemeMode = "system" | "dark" | "light";
export type FactoryDensityMode = "compact" | "comfortable";
export type FactorySyncHealth = "connected" | "reconnecting" | "offline" | "unknown";

export interface ProjectScopedRailSelection {
	activeItemId?: string;
	expandedItemIds: string[];
}

interface FactoryWorkspaceStoreState {
	workspace: WorkspaceContext;
	activeProjectId: string;
	projectTreeVersion: string;
	sidebarCollapsed: boolean;
	activeSidebarItemId: string;
	rightRailCollapsed: boolean;
	rightRailWidthPx: number;
	rightRailLastExpandedWidthPx: number;
	rightRailSelectionByProject: Record<string, ProjectScopedRailSelection>;
	activeCoordinatorMode: CoordinatorMode;
	activeReferenceIds: string[];
	draftComposerTextByProject: Record<string, string>;
	activeDeckIdByProject: Record<string, string | undefined>;
	deckCommentDraftByKey: Record<string, string>;
	themeMode: FactoryThemeMode;
	reducedMotion: boolean;
	density: FactoryDensityMode;
	lastWorkspacePollAt?: string;
	syncHealth: FactorySyncHealth;
	setWorkspace: (workspace: WorkspaceContext) => void;
	setActiveProjectId: (projectId: string) => void;
	setSidebarCollapsed: (collapsed: boolean) => void;
	setActiveSidebarItemId: (itemId: string) => void;
	setRightRailCollapsed: (collapsed: boolean) => void;
	setRightRailWidthPx: (widthPx: number) => void;
	setRightRailActiveItemId: (projectId: string, itemId?: string) => void;
	toggleRightRailExpandedItem: (projectId: string, itemId: string) => void;
	setActiveCoordinatorMode: (mode: CoordinatorMode) => void;
	setActiveReferences: (references: ArtifactReference[]) => void;
	setDraftComposerText: (projectId: string, text: string) => void;
	setActiveDeckId: (projectId: string, deckId?: string) => void;
	setDeckCommentDraft: (
		projectId: string,
		deckId: string,
		slideId: string,
		text: string,
	) => void;
	setThemeMode: (mode: FactoryThemeMode) => void;
	setReducedMotion: (reducedMotion: boolean) => void;
	setDensity: (density: FactoryDensityMode) => void;
	setSyncHealth: (syncHealth: FactorySyncHealth) => void;
	setLastWorkspacePollAt: (timestamp?: string) => void;
}

function clampRightRailWidth(widthPx: number): number {
	return Math.max(
		MIN_RIGHT_RAIL_WIDTH_PX,
		Math.min(MAX_RIGHT_RAIL_WIDTH_PX, Math.round(widthPx)),
	);
}

function selectionForProject(
	state: FactoryWorkspaceStoreState,
	projectId: string,
): ProjectScopedRailSelection {
	return (
		state.rightRailSelectionByProject[projectId] ?? {
			activeItemId: undefined,
			expandedItemIds: [],
		}
	);
}

/**
 * Runtime boundary ADR: UI state belongs in this Zustand store. Orchestration
 * state belongs in the Project Coordinator runtime introduced by WO-C26.3-NEW.
 * The two sides communicate only through graph-shaped contracts exported from
 * `lib/types/factory-operator-console`.
 */
export const useFactoryWorkspaceStore = create<FactoryWorkspaceStoreState>()(
	devtools(
		persist(
			(set, get) => ({
				workspace: {
					workspaceId: DEFAULT_FACTORY_PROJECT_ID,
					projectsRoot: "projects",
					primaryOwner: "yuriy",
					isMultiUser: false,
				},
				activeProjectId: DEFAULT_FACTORY_PROJECT_ID,
				projectTreeVersion: "v0",
				sidebarCollapsed: false,
				activeSidebarItemId: "work-orders",
				rightRailCollapsed: false,
				rightRailWidthPx: DEFAULT_RIGHT_RAIL_WIDTH_PX,
				rightRailLastExpandedWidthPx: DEFAULT_RIGHT_RAIL_WIDTH_PX,
				rightRailSelectionByProject: {},
				activeCoordinatorMode: "general",
				activeReferenceIds: [],
				draftComposerTextByProject: {},
				activeDeckIdByProject: {},
				deckCommentDraftByKey: {},
				themeMode: "dark",
				reducedMotion: false,
				density: "compact",
				lastWorkspacePollAt: undefined,
				syncHealth: "connected",
				setWorkspace: (workspace) => set({ workspace }),
				setActiveProjectId: (projectId) =>
					set({ activeProjectId: projectId || DEFAULT_FACTORY_PROJECT_ID }),
				setSidebarCollapsed: (collapsed) =>
					set({ sidebarCollapsed: collapsed }),
				setActiveSidebarItemId: (itemId) => set({ activeSidebarItemId: itemId }),
				setRightRailCollapsed: (collapsed) =>
					set((state) => ({
						rightRailCollapsed: collapsed,
						rightRailWidthPx: collapsed
							? COLLAPSED_RIGHT_RAIL_WIDTH_PX
							: state.rightRailLastExpandedWidthPx,
					})),
				setRightRailWidthPx: (widthPx) =>
					set({
						rightRailCollapsed: false,
						rightRailWidthPx: clampRightRailWidth(widthPx),
						rightRailLastExpandedWidthPx: clampRightRailWidth(widthPx),
					}),
				setRightRailActiveItemId: (projectId, itemId) =>
					set((state) => ({
						rightRailSelectionByProject: {
							...state.rightRailSelectionByProject,
							[projectId]: {
								...selectionForProject(state, projectId),
								activeItemId: itemId,
							},
						},
					})),
				toggleRightRailExpandedItem: (projectId, itemId) =>
					set((state) => {
						const current = selectionForProject(state, projectId);
						const expandedItemIds = current.expandedItemIds.includes(itemId)
							? current.expandedItemIds.filter((id) => id !== itemId)
							: [...current.expandedItemIds, itemId];
						return {
							rightRailSelectionByProject: {
								...state.rightRailSelectionByProject,
								[projectId]: {
									...current,
									expandedItemIds,
								},
							},
						};
					}),
				setActiveCoordinatorMode: (mode) =>
					set({ activeCoordinatorMode: mode }),
				setActiveReferences: (references) =>
					set({ activeReferenceIds: references.map((ref) => ref.referenceId) }),
				setDraftComposerText: (projectId, text) =>
					set((state) => ({
						draftComposerTextByProject: {
							...state.draftComposerTextByProject,
							[projectId]: text,
						},
					})),
				setActiveDeckId: (projectId, deckId) =>
					set((state) => ({
						activeDeckIdByProject: {
							...state.activeDeckIdByProject,
							[projectId]: deckId,
						},
					})),
				setDeckCommentDraft: (projectId, deckId, slideId, text) =>
					set((state) => ({
						deckCommentDraftByKey: {
							...state.deckCommentDraftByKey,
							[`${projectId}:${deckId}:${slideId}`]: text,
						},
					})),
				setThemeMode: (themeMode) => set({ themeMode }),
				setReducedMotion: (reducedMotion) => set({ reducedMotion }),
				setDensity: (density) => set({ density }),
				setSyncHealth: (syncHealth) => set({ syncHealth }),
				setLastWorkspacePollAt: (lastWorkspacePollAt) =>
					set({ lastWorkspacePollAt }),
			}),
			{
				name: "factory-workspace-store",
				version: 1,
				storage: createJSONStorage(() => localStorage),
				partialize: (state) => ({
					workspace: state.workspace,
					activeProjectId: state.activeProjectId,
					projectTreeVersion: state.projectTreeVersion,
					sidebarCollapsed: state.sidebarCollapsed,
					activeSidebarItemId: state.activeSidebarItemId,
					rightRailCollapsed: state.rightRailCollapsed,
					rightRailWidthPx: state.rightRailWidthPx,
					rightRailLastExpandedWidthPx: state.rightRailLastExpandedWidthPx,
					rightRailSelectionByProject: state.rightRailSelectionByProject,
					activeCoordinatorMode: state.activeCoordinatorMode,
					activeReferenceIds: state.activeReferenceIds,
					draftComposerTextByProject: state.draftComposerTextByProject,
					activeDeckIdByProject: state.activeDeckIdByProject,
					deckCommentDraftByKey: state.deckCommentDraftByKey,
					themeMode: state.themeMode,
					reducedMotion: state.reducedMotion,
					density: state.density,
				}),
			},
		),
		{ name: "FactoryWorkspaceStore" },
	),
);

export const useFactoryActiveProjectId = () =>
	useFactoryWorkspaceStore((state) => state.activeProjectId);

export const useFactoryThemeMode = () =>
	useFactoryWorkspaceStore((state) => state.themeMode);

export const useFactoryRightRailLayout = () =>
	useFactoryWorkspaceStore((state) => ({
		collapsed: state.rightRailCollapsed,
		widthPx: state.rightRailWidthPx,
		lastExpandedWidthPx: state.rightRailLastExpandedWidthPx,
		setCollapsed: state.setRightRailCollapsed,
		setWidthPx: state.setRightRailWidthPx,
	}));
