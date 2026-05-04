import type { AuthorAttribution } from "lib/types/factory-operator-console";
import { DependencyGraph } from "./DependencyGraph";

const author: AuthorAttribution = {
	user: "yuriy",
	isAgent: false,
	displayName: "Yuriy",
};

export function DependencyGraphDemo() {
	return (
		<DependencyGraph
			graph={{
				nodes: [
					{
						id: "WO-C26.1",
						title: "Architecture lock",
						status: "completed",
						rigorTier: 1,
						riskClassification: "medium",
						author,
						assignedTo: author,
						projectId: "software-factory",
						scope: "infrastructure",
						state: "completed",
						lastActivityAt: "2026-05-04T10:00:00Z",
						hasOpenGate: false,
					},
					{
						id: "WO-C26.2",
						title: "Shell and primitives",
						status: "in_flight",
						rigorTier: 1,
						riskClassification: "medium",
						author,
						assignedTo: author,
						projectId: "software-factory",
						scope: "infrastructure",
						state: "running",
						lastActivityAt: "2026-05-04T16:00:00Z",
						hasOpenGate: false,
					},
				],
				edges: [
					{
						from: "WO-C26.1",
						to: "WO-C26.2",
						state: "satisfied",
						reason: "Contracts are locked before primitives ship.",
					},
				],
				parallelCohorts: [["WO-C26.3", "WO-C26.4"]],
				blockedQueue: [],
			}}
		/>
	);
}
