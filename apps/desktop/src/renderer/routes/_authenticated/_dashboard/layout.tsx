import {
	createFileRoute,
	Outlet,
	useLocation,
	useMatchRoute,
	useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { env } from "renderer/env.renderer";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { DashboardSidebar } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar";
import { FactorySidebar } from "renderer/routes/_authenticated/_dashboard/factory/components/FactorySidebar";
import { useDevSeedV2Sidebar } from "renderer/routes/_authenticated/hooks/useDevSeedV2Sidebar";
import { useMigrateV1DataToV2 } from "renderer/routes/_authenticated/hooks/useMigrateV1DataToV2";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { WorkspaceSidebar } from "renderer/screens/main/components/WorkspaceSidebar";
import { DeleteWorkspaceDialog } from "renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/components";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
	MAX_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores/workspace-sidebar-state";
import { AddRepositoryModals } from "./components/AddRepositoryModals";
import { TopBar } from "./components/TopBar";

const FACTORY_SIDEBAR_WIDTH = 240;

export const Route = createFileRoute("/_authenticated/_dashboard")({
	component: DashboardLayout,
});

function DashboardLayout() {
	const navigate = useNavigate();
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();
	const { isV2CloudEnabled } = useIsV2CloudEnabled();
	const location = useLocation();
	const isFactoryRoute = location.pathname.startsWith("/factory");
	useDevSeedV2Sidebar();
	useMigrateV1DataToV2();
	// Get current workspace from route to pre-select project in new workspace modal
	const matchRoute = useMatchRoute();
	const currentWorkspaceMatch = matchRoute({
		to: "/workspace/$workspaceId",
		fuzzy: true,
	});
	const currentWorkspaceId =
		currentWorkspaceMatch !== false ? currentWorkspaceMatch.workspaceId : null;

	const { data: currentWorkspace } = electronTrpc.workspaces.get.useQuery(
		{ id: currentWorkspaceId ?? "" },
		{ enabled: !!currentWorkspaceId },
	);

	const {
		isOpen: isWorkspaceSidebarOpen,
		toggleCollapsed: toggleWorkspaceSidebarCollapsed,
		setOpen: setWorkspaceSidebarOpen,
		width: workspaceSidebarWidth,
		setWidth: setWorkspaceSidebarWidth,
		isResizing: isWorkspaceSidebarResizing,
		setIsResizing: setWorkspaceSidebarIsResizing,
		isCollapsed: isWorkspaceSidebarCollapsed,
	} = useWorkspaceSidebarStore();

	// Global hotkeys for dashboard
	useHotkey("OPEN_SETTINGS", () =>
		navigate({
			to:
				env.FACTORY_LOCAL_ONLY === "true"
					? "/settings/appearance"
					: "/settings/account",
		}),
	);
	useHotkey("SHOW_HOTKEYS", () => navigate({ to: "/settings/keyboard" }));
	useHotkey("TOGGLE_WORKSPACE_SIDEBAR", () => {
		if (!isWorkspaceSidebarOpen) {
			setWorkspaceSidebarOpen(true);
		} else {
			toggleWorkspaceSidebarCollapsed();
		}
	});
	useHotkey("NEW_WORKSPACE", () =>
		openNewWorkspaceModal(currentWorkspace?.projectId),
	);

	const [deleteTarget, setDeleteTarget] = useState<{
		workspaceId: string;
		workspaceName: string;
		workspaceType: "worktree" | "branch";
	} | null>(null);

	useHotkey(
		"CLOSE_WORKSPACE",
		() => {
			if (currentWorkspaceId && currentWorkspace) {
				setDeleteTarget({
					workspaceId: currentWorkspaceId,
					workspaceName: currentWorkspace.name,
					workspaceType: currentWorkspace.type,
				});
			}
		},
		{ enabled: !!currentWorkspaceId },
	);

	if (isFactoryRoute) {
		return (
			<div className="flex h-full w-full overflow-hidden">
				<div
					className="drag h-8 w-full shrink-0 absolute top-0 left-0 right-0 z-10"
					aria-hidden="true"
				/>
				<div
					className="shrink-0 border-r"
					style={{ width: `${FACTORY_SIDEBAR_WIDTH}px` }}
				>
					<FactorySidebar />
				</div>
				<div className="flex flex-1 min-h-0 min-w-0 flex-col pt-8">
					<Outlet />
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full w-full overflow-hidden">
			<div className="flex flex-1 flex-col min-w-0 min-h-0">
				<TopBar />
				<div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
					{isWorkspaceSidebarOpen && (
						<ResizablePanel
							width={workspaceSidebarWidth}
							onWidthChange={setWorkspaceSidebarWidth}
							isResizing={isWorkspaceSidebarResizing}
							onResizingChange={setWorkspaceSidebarIsResizing}
							minWidth={COLLAPSED_WORKSPACE_SIDEBAR_WIDTH}
							maxWidth={MAX_WORKSPACE_SIDEBAR_WIDTH}
							handleSide="right"
							clampWidth={false}
							onDoubleClickHandle={() =>
								setWorkspaceSidebarWidth(DEFAULT_WORKSPACE_SIDEBAR_WIDTH)
							}
						>
							{isV2CloudEnabled ? (
								<DashboardSidebar isCollapsed={isWorkspaceSidebarCollapsed()} />
							) : (
								<WorkspaceSidebar
									isCollapsed={isWorkspaceSidebarCollapsed()}
									activeProjectId={currentWorkspace?.projectId ?? null}
									activeProjectName={currentWorkspace?.project?.name ?? null}
								/>
							)}
						</ResizablePanel>
					)}
					<div className="flex flex-1 min-h-0 min-w-0">
						<Outlet />
					</div>
				</div>
			</div>
			<div id="workspace-right-sidebar-slot" className="flex h-full shrink-0" />
			<AddRepositoryModals />
			{deleteTarget && (
				<DeleteWorkspaceDialog
					workspaceId={deleteTarget.workspaceId}
					workspaceName={deleteTarget.workspaceName}
					workspaceType={deleteTarget.workspaceType}
					open={true}
					onOpenChange={(open) => {
						if (!open) setDeleteTarget(null);
					}}
				/>
			)}
		</div>
	);
}
