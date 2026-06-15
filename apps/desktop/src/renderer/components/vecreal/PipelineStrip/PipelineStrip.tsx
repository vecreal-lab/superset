import { StatusBadge, type StatusBadgeVariant } from "../StatusBadge";
import { s, textBase, v } from "../componentInternals";

export interface PipelineStage {
	id: string;
	label: string;
	state?: "empty" | "pending" | "active" | "complete" | "failed";
}

export interface PipelineStripProps {
	stages: PipelineStage[];
	variant?: "compact" | "rail" | "full";
	ariaLabel?: string;
}

export function PipelineStrip({ stages, variant = "compact", ariaLabel = "Pipeline progress" }: PipelineStripProps) {
	return (
		<ol
			aria-label={ariaLabel}
			data-vecreal-component="PipelineStrip"
			data-variant={variant}
			style={{
				...textBase,
				display: "flex",
				flexDirection: variant === "rail" ? "column" : "row",
				gap: s.px4,
				margin: 0,
				padding: 0,
				listStyle: "none",
			}}
		>
			{stages.map((stage, index) => {
				const state = stage.state ?? "pending";
				const variantTone: StatusBadgeVariant = state === "complete" ? "success" : state === "failed" ? "error" : state === "active" ? "warning" : "neutral";
				return (
					<li
						key={stage.id}
						aria-current={state === "active" ? "step" : undefined}
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: s.px3,
							minWidth: 0,
						}}
					>
						<StatusBadge variant={variantTone} size="sm" isLive={state === "active"}>
							{index + 1}
						</StatusBadge>
						<span style={{ color: state === "empty" ? v.muted : v.body, fontSize: s.px6, overflow: "hidden", textOverflow: "ellipsis" }}>
							{stage.label}
						</span>
					</li>
				);
			})}
		</ol>
	);
}
