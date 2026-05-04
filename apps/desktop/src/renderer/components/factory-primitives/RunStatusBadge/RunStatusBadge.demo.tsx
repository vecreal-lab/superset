import type { WorkOrderRunState } from "lib/types/factory-operator-console";
import { RunStatusBadge } from "./RunStatusBadge";

const states: WorkOrderRunState[] = [
	"queued",
	"running",
	"awaiting_approval",
	"blocked",
	"completed",
	"failed",
];

export function RunStatusBadgeDemo() {
	return (
		<div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-4)" }}>
			{states.map((state) => (
				<RunStatusBadge key={state} state={state} duration={42000} />
			))}
		</div>
	);
}
