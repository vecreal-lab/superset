import type {
	DependencyGraph as DependencyGraphModel,
	WorkOrderListItem,
} from "lib/types/factory-operator-console";
import { cardPaddingStyle, mutedTextStyle, stackStyle } from "../common";
import { DependencyEdge } from "./DependencyEdge";

export interface DependencyGraphProps {
	graph: DependencyGraphModel;
	layout?: "horizontal" | "tree" | "force";
	onNodeClick?: (workOrderId: string) => void;
}

function nodeStateLabel(node: WorkOrderListItem) {
	return node.state.replace(/_/g, " ");
}

export function DependencyGraph({
	graph,
	layout = "horizontal",
	onNodeClick,
}: DependencyGraphProps) {
	return (
		<section
			className="factory-card"
			aria-label="Dependency graph"
			data-layout={layout}
			style={{ ...cardPaddingStyle, ...stackStyle }}
		>
			<header>
				<strong>Dependency order</strong>
				<div style={mutedTextStyle}>
					{graph.nodes.length} work orders / {graph.edges.length} dependencies
				</div>
			</header>
			<div
				style={{
					display: "grid",
					gridTemplateColumns:
						layout === "tree"
							? "1fr"
							: "repeat(auto-fit, minmax(var(--sp-14), 1fr))",
					gap: "var(--sp-5)",
				}}
			>
				{graph.nodes.map((node) => (
					<button
						key={node.id}
						type="button"
						className="factory-button factory-button--ghost"
						onClick={() => onNodeClick?.(node.id)}
						style={{ justifyContent: "space-between" }}
					>
						<span>{node.id}</span>
						<span style={mutedTextStyle}>{nodeStateLabel(node)}</span>
					</button>
				))}
			</div>
			<div style={stackStyle}>
				{graph.edges.map((edge) => (
					<DependencyEdge key={`${edge.from}-${edge.to}`} edge={edge} />
				))}
			</div>
		</section>
	);
}
