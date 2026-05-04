import type { DependencyEdge as DependencyEdgeModel } from "lib/types/factory-operator-console";
import { monoTextStyle } from "../common";

export interface DependencyEdgeProps {
	edge: DependencyEdgeModel;
}

function edgeColor(state: DependencyEdgeModel["state"]) {
	if (state === "satisfied") return "var(--success)";
	if (state === "broken") return "var(--error)";
	return "var(--text-tertiary)";
}

export function DependencyEdge({ edge }: DependencyEdgeProps) {
	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "1fr auto 1fr",
				alignItems: "center",
				gap: "var(--sp-4)",
				color: edgeColor(edge.state),
				...monoTextStyle,
				fontSize: "var(--sp-5)",
			}}
		>
			<span>{edge.from}</span>
			<span aria-hidden="true">-&gt;</span>
			<span>{edge.to}</span>
			{edge.reason && (
				<span style={{ gridColumn: "1 / -1", color: "var(--text-tertiary)" }}>
					{edge.reason}
				</span>
			)}
		</div>
	);
}
