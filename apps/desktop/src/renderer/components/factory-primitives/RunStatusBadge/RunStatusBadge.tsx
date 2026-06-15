import type { WorkOrderRunState } from "lib/types/factory-operator-console";
import {
	StatusBadge,
	type StatusBadgeVariant,
} from "renderer/components/vecreal/StatusBadge";

export interface RunStatusBadgeProps {
	state: WorkOrderRunState;
	duration?: number;
	className?: string;
}

const statusLabels: Record<WorkOrderRunState, string> = {
	queued: "Queued",
	ready: "Ready",
	blocked: "Blocked",
	running: "Running",
	awaiting_approval: "Awaiting approval",
	completed: "Completed",
	failed: "Failed",
	canceled: "Canceled",
};

function statusVariant(state: WorkOrderRunState): StatusBadgeVariant {
	if (state === "completed") return "success";
	if (state === "failed" || state === "blocked" || state === "canceled") return "error";
	if (state === "awaiting_approval") return "warning";
	if (state === "running") return "info";
	return "neutral";
}

export function RunStatusBadge({ state, duration, className }: RunStatusBadgeProps) {
	return (
		<StatusBadge
			className={className}
			variant={statusVariant(state)}
			size="sm"
			isLive={state === "running"}
			ariaLabel={`Run status: ${statusLabels[state]}`}
		>
			{statusLabels[state]}
			{typeof duration === "number" && (
				<span style={{ color: "var(--text-tertiary)" }}>{Math.round(duration / 1000)}s</span>
			)}
		</StatusBadge>
	);
}
