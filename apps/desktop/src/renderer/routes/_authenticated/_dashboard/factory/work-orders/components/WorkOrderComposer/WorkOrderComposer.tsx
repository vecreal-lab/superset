import { Copy, Plus } from "lucide-react";
import { Button, Card, Chip, Overlay, StatusBadge } from "renderer/components/vecreal";
import type { ElectronRouterOutputs } from "renderer/lib/electron-trpc";

type ProjectOption = { value: string; label: string; count?: number };
type SaveResult =
	ElectronRouterOutputs["factory"]["workOrders"]["saveComposedWorkOrders"];

export interface WorkOrderComposerProps {
	defaultProjectId: string;
	projectOptions: ProjectOption[];
	currentUser: {
		user: string;
		displayName: string;
		role?: string;
	};
	onSaved: (result: SaveResult) => void;
}

const SPAWN_COMMAND = "factory-mcp spawn-wo";

export function WorkOrderComposer({
	defaultProjectId,
	projectOptions,
	currentUser,
}: WorkOrderComposerProps) {
	const projects = [
		defaultProjectId,
		...projectOptions.map((project) => project.value),
	].filter((value, index, all) => value !== "all" && all.indexOf(value) === index);

	return (
		<Overlay
			kind="drawer"
			title="Compose Work Order"
			description="Work-order drafting moved to Claude Desktop through factory-mcp."
			trigger={
				<Button variant="primary" size="sm">
					<Plus className="size-3.5" />
					New Work Order
				</Button>
			}
		>
			<div className="grid gap-4">
				<Card variant="compact">
					<div className="flex flex-wrap items-center gap-2">
						<StatusBadge variant="info" size="sm">
							visual-only cockpit
						</StatusBadge>
						<Chip tone="neutral" size="sm">
							{currentUser.displayName}
						</Chip>
					</div>
					<div>
						<h3 className="m-0 text-sm font-medium">Compose via Claude Desktop</h3>
						<p className="m-0 mt-2 text-sm text-muted-foreground">
							The cockpit no longer hosts intake or work-order chat. Start a
							Cofounder track session in Claude Desktop and ask factory-mcp to
							spawn the work order.
						</p>
					</div>
					<div className="rounded-md border bg-muted/20 p-3 font-mono text-xs">
						{SPAWN_COMMAND}
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							size="sm"
							variant="secondary"
							onClick={() => void navigator.clipboard?.writeText(SPAWN_COMMAND)}
						>
							<Copy className="size-3.5" />
							Copy command
						</Button>
					</div>
				</Card>
				<Card variant="compact">
					<h3 className="m-0 text-sm font-medium">Project context</h3>
					<p className="m-0 text-xs text-muted-foreground">
						Use these project IDs when spawning through factory-mcp.
					</p>
					<div className="flex flex-wrap gap-2">
						{projects.map((projectId) => (
							<Chip key={projectId} tone="neutral" size="sm">
								{projectId}
							</Chip>
						))}
					</div>
				</Card>
			</div>
		</Overlay>
	);
}
