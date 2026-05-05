import {
	createFileRoute,
	Outlet,
	useLocation,
	useMatchRoute,
	useNavigate,
} from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { env } from "renderer/env.renderer";
import { FactoryShell } from "renderer/components/FactoryShell";
import { TopBar as FactoryTopBar } from "renderer/components/TopBar";
import type { ProjectSwitcherNode } from "renderer/components/factory-primitives/ProjectSwitcher";
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
import { DEFAULT_FACTORY_PROJECT_ID } from "lib/stores/workspace";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
	MAX_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores/workspace-sidebar-state";
import { AddRepositoryModals } from "./components/AddRepositoryModals";
import { TopBar as DashboardTopBar } from "./components/TopBar";
import type { FactoryRow } from "./factory/components/FactoryView";

export const Route = createFileRoute("/_authenticated/_dashboard")({
	component: DashboardLayout,
});

function factoryProjectIdFromPathname(pathname: string): string {
	const match = pathname.match(/^\/factory\/projects\/([^/]+)/);
	if (!match) return DEFAULT_FACTORY_PROJECT_ID;
	try {
		return decodeURIComponent(match[1] || DEFAULT_FACTORY_PROJECT_ID);
	} catch {
		return match[1] || DEFAULT_FACTORY_PROJECT_ID;
	}
}

function rowDataText(row: FactoryRow, key: string): string | undefined {
	const value = row.data[key];
	return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function projectNodeForRow(row: FactoryRow): ProjectSwitcherNode {
	const id = rowDataText(row, "project_id") ?? row.id;
	return {
		id,
		name: row.title || id,
		kind: rowDataText(row, "project_type") ?? rowDataText(row, "node_type"),
		children: [],
	};
}

function buildFactoryProjectTree(rows: FactoryRow[] = []): ProjectSwitcherNode[] {
	if (rows.length === 0) {
		return [
			{
				id: DEFAULT_FACTORY_PROJECT_ID,
				name: "Software Factory",
				kind: "parent project",
			},
		];
	}

	const nodesByRowId = new Map<string, ProjectSwitcherNode>();
	for (const row of rows) {
		nodesByRowId.set(row.id, projectNodeForRow(row));
	}

	const roots: ProjectSwitcherNode[] = [];
	for (const row of rows) {
		const node = nodesByRowId.get(row.id);
		if (!node) continue;
		const parentId = rowDataText(row, "parent_id");
		const parent = parentId ? nodesByRowId.get(parentId) : undefined;
		if (parent) {
			parent.children = [...(parent.children ?? []), node];
		} else {
			roots.push(node);
		}
	}

	const sortNodes = (nodes: ProjectSwitcherNode[]) => {
		nodes.sort((a, b) => a.name.localeCompare(b.name));
		for (const node of nodes) sortNodes(node.children ?? []);
	};
	sortNodes(roots);
	return roots.length > 0 ? roots : Array.from(nodesByRowId.values());
}

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
	const { data: factoryProjects = [] } = electronTrpc.factory.dataset.useQuery(
		{ dataset: "projects" },
		{ enabled: isFactoryRoute },
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

	const factoryProjectTree = useMemo(
		() => buildFactoryProjectTree(factoryProjects as FactoryRow[]),
		[factoryProjects],
	);
	const currentFactoryProjectId = useMemo(
		() => factoryProjectIdFromPathname(location.pathname),
		[location.pathname],
	);
	const handleFactoryProjectSwitch = (projectId: string) => {
		void navigate({
			to: "/factory/projects/$projectId",
			params: { projectId },
		});
	};

	if (isFactoryRoute) {
		return (
			<FactoryShell
				topBar={
					<FactoryTopBar
						currentProjectId={currentFactoryProjectId}
						projectTree={factoryProjectTree}
						onProjectSwitch={handleFactoryProjectSwitch}
					/>
				}
				sidebar={<FactorySidebar />}
				statusStrip={<FactoryStatusStrip />}
			>
				<Outlet />
			</FactoryShell>
		);
	}

	return (
		<div className="flex h-full w-full overflow-hidden">
			<div className="flex flex-1 flex-col min-w-0 min-h-0">
				<DashboardTopBar />
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

function FactoryStatusStrip() {
	return (
		<footer
			aria-label="Factory status strip"
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				borderTop: "var(--factory-border-width) solid var(--border)",
				background: "var(--bg-app)",
				color: "var(--text-tertiary)",
				fontFamily: "var(--font-mono)",
				fontSize: "var(--sp-5)",
				padding: "0 var(--sp-8)",
			}}
		>
			<span>local-only cockpit</span>
			<span>
				FACTORY_LOCAL_ONLY={env.FACTORY_LOCAL_ONLY === "true" ? "true" : "false"}
			</span>
		</footer>
	);
}
