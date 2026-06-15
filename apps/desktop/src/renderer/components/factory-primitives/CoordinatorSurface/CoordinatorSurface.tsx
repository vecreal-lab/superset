import type { ReactNode } from "react";
import type { CoordinatorSurfaceContext } from "lib/types/factory-operator-console";
import { Card, PipelineStrip, StatusBadge } from "renderer/components/vecreal";

export interface CoordinatorSurfaceProps {
	context: CoordinatorSurfaceContext;
	children?: ReactNode;
	rightRail?: ReactNode;
}

export function CoordinatorSurface({
	context,
	children,
	rightRail,
}: CoordinatorSurfaceProps) {
	const stages = [
		{ id: "context", label: "Context", state: "complete" as const },
		{ id: "state", label: "State", state: "active" as const },
		{ id: "dispatch", label: "Dispatch via MCP", state: "pending" as const },
	];

	return (
		<section className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_22rem] overflow-hidden">
			<main className="min-w-0 overflow-y-auto p-6">
				<Card>
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div>
							<p className="m-0 font-mono text-[10px] uppercase text-muted-foreground">
								Visual coordinator
							</p>
							<h2 className="m-0 mt-1 text-lg font-semibold">{context.projectId}</h2>
							<p className="m-0 mt-2 text-sm text-muted-foreground">
								Project coordination chat moved to Claude Desktop through
								factory-mcp. This surface remains as a visual run-state wrapper.
							</p>
						</div>
						<StatusBadge variant="info" size="sm">
							visual-only
						</StatusBadge>
					</div>
					<PipelineStrip stages={stages} variant="full" />
					{children}
				</Card>
			</main>
			<aside className="min-h-0 overflow-y-auto border-l p-4">
				{rightRail ?? (
					<Card variant="compact">
						<h3 className="m-0 text-sm font-medium">Right rail</h3>
						<p className="m-0 text-xs text-muted-foreground">
							Persistent operator-console rail will land in a follow-up Cofounder
							track work order.
						</p>
					</Card>
				)}
			</aside>
		</section>
	);
}
