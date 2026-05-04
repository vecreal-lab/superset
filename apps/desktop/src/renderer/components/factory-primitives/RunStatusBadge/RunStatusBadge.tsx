import type { WorkOrderRunState } from "lib/types/factory-operator-console";
import { cx, monoTextStyle } from "../common";

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

function statusColor(state: WorkOrderRunState): string {
	if (state === "completed") return "var(--success)";
	if (state === "failed" || state === "blocked") return "var(--error)";
	if (state === "running" || state === "awaiting_approval") return "var(--accent)";
	return "var(--text-tertiary)";
}

export function RunStatusBadge({ state, duration, className }: RunStatusBadgeProps) {
	return (
		<span
			className={cx("factory-chip", className)}
			style={{
				...monoTextStyle,
				color: statusColor(state),
				borderColor: statusColor(state),
				padding: "0 var(--sp-4)",
				height: "var(--sp-10)",
				fontSize: "var(--sp-5)",
			}}
		>
			{statusLabels[state]}
			{typeof duration === "number" && (
				<span style={{ color: "var(--text-tertiary)" }}>{Math.round(duration / 1000)}s</span>
			)}
		</span>
	);
}
