import type {
	AuthorAttribution,
	DependencyEdge as DependencyEdgeModel,
	DependencyGraph as DependencyGraphModel,
	WorkOrderListItem,
} from "lib/types/factory-operator-console";
import { cardPaddingStyle, mutedTextStyle, stackStyle } from "../common";
import { DependencyEdge } from "./DependencyEdge";
import { DependencyGraph } from "./DependencyGraph";

const author: AuthorAttribution = {
	user: "yuriy",
	isAgent: false,
	displayName: "Yuriy",
};

const nodes: WorkOrderListItem[] = [
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
	{
		id: "WO-C26.3",
		title: "Coordinator route integration",
		status: "queued",
		rigorTier: 1,
		riskClassification: "medium",
		author,
		assignedTo: author,
		projectId: "software-factory",
		scope: "dashboard",
		state: "queued",
		lastActivityAt: "2026-05-04T18:00:00Z",
		hasOpenGate: false,
	},
];

const edges: DependencyEdgeModel[] = [
	{
		from: "WO-C26.1",
		to: "WO-C26.2",
		state: "satisfied",
		reason: "Architecture contracts are locked.",
	},
	{
		from: "WO-C26.2",
		to: "WO-C26.3",
		state: "pending",
		reason: "Shell seams are waiting for final audit closure.",
	},
	{
		from: "WO-C15.8",
		to: "WO-C26.3",
		state: "broken",
		reason: "Foundation-class commit flow is unavailable in this scenario.",
	},
];

const graph: DependencyGraphModel = {
	nodes,
	edges,
	parallelCohorts: [["WO-C26.3", "WO-C26.4"]],
	blockedQueue: ["WO-C26.3"],
};

const layouts = ["horizontal", "tree", "force"] as const;

export function DependencyEdgeDemo() {
	return (
		<div style={stackStyle}>
			<section className="factory-card" style={{ ...cardPaddingStyle, ...stackStyle }}>
				<header>
					<strong>Dependency edge states</strong>
					<div style={mutedTextStyle}>pending, satisfied, and broken</div>
				</header>
				{edges.map((edge) => (
					<DependencyEdge key={`${edge.from}-${edge.to}`} edge={edge} />
				))}
			</section>
			{layouts.map((layout) => (
				<DependencyGraph key={layout} graph={graph} layout={layout} />
			))}
		</div>
	);
}
