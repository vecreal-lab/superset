import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";

export const DEFAULT_ACTIVE_PROJECT_ID = "software-factory";
export const LEGACY_ACTIVE_PROJECT_REDIRECTS: Record<string, string> = {
	"construction-pm": "vecreal/construction-pm",
};

interface ActiveProjectState {
	activeProjectId: string;
	setActiveProjectId: (projectId: string) => void;
}

export function projectFoundationPath(
	projectId: string,
	fileName: string,
): string {
	return `projects/${normalizeActiveProjectId(projectId)}/foundations/${fileName}`;
}

export function normalizeActiveProjectId(projectId?: string | null): string {
	const normalized = (projectId || "").trim() || DEFAULT_ACTIVE_PROJECT_ID;
	return LEGACY_ACTIVE_PROJECT_REDIRECTS[normalized] || normalized;
}

export const useActiveProjectStore = create<ActiveProjectState>()(
	devtools(
		persist(
			(set) => ({
				activeProjectId: DEFAULT_ACTIVE_PROJECT_ID,
				setActiveProjectId: (projectId) =>
					set({ activeProjectId: normalizeActiveProjectId(projectId) }),
			}),
			{
				name: "factory-active-project",
				version: 2,
				storage: createJSONStorage(() => localStorage),
				migrate: (persisted) => {
					if (
						!persisted ||
						typeof persisted !== "object" ||
						!("activeProjectId" in persisted)
					) {
						return { activeProjectId: DEFAULT_ACTIVE_PROJECT_ID };
					}
					const state = persisted as Partial<ActiveProjectState>;
					return {
						...state,
						activeProjectId: normalizeActiveProjectId(state.activeProjectId),
					};
				},
			},
		),
		{ name: "FactoryActiveProjectStore" },
	),
);

export const useActiveProjectId = () =>
	useActiveProjectStore((state) => normalizeActiveProjectId(state.activeProjectId));
export const useSetActiveProjectId = () =>
	useActiveProjectStore((state) => state.setActiveProjectId);

