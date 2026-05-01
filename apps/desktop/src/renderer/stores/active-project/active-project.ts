import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";

export const DEFAULT_ACTIVE_PROJECT_ID = "software-factory";

interface ActiveProjectState {
	activeProjectId: string;
	setActiveProjectId: (projectId: string) => void;
}

export function projectFoundationPath(
	projectId: string,
	fileName: string,
): string {
	return `projects/${projectId}/foundations/${fileName}`;
}

export const useActiveProjectStore = create<ActiveProjectState>()(
	devtools(
		persist(
			(set) => ({
				activeProjectId: DEFAULT_ACTIVE_PROJECT_ID,
				setActiveProjectId: (projectId) =>
					set({ activeProjectId: projectId || DEFAULT_ACTIVE_PROJECT_ID }),
			}),
			{
				name: "factory-active-project",
				storage: createJSONStorage(() => localStorage),
			},
		),
		{ name: "FactoryActiveProjectStore" },
	),
);

export const useActiveProjectId = () =>
	useActiveProjectStore((state) => state.activeProjectId);
export const useSetActiveProjectId = () =>
	useActiveProjectStore((state) => state.setActiveProjectId);

