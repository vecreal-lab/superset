import { Check } from "lucide-react";
import type { PipelineStage } from "lib/types/factory-operator-console";
import { PrimitiveIcon, cx, monoTextStyle } from "../common";

export interface PipelineStripProps {
	stages: PipelineStage[];
	currentStageId?: string;
	layout?: "horizontal" | "vertical";
	completedStageIds?: string[];
	failedStageIds?: string[];
}

export function PipelineStrip({
	stages,
	currentStageId,
	layout = "horizontal",
	completedStageIds = [],
	failedStageIds = [],
}: PipelineStripProps) {
	const activeIndex = stages.findIndex((stage) => stage.stageId === currentStageId);
	return (
		<ol
			aria-label="Pipeline stages"
			style={{
				display: "grid",
				gridTemplateColumns:
					layout === "horizontal"
						? `repeat(${Math.max(stages.length, 1)}, minmax(0, 1fr))`
						: "1fr",
				gap: "var(--sp-5)",
				listStyle: "none",
				padding: 0,
				margin: 0,
			}}
		>
			{stages.map((stage, index) => {
				const isCompleted =
					completedStageIds.includes(stage.stageId) ||
					(activeIndex > -1 && index < activeIndex);
				const isActive = stage.stageId === currentStageId;
				const isFailed = failedStageIds.includes(stage.stageId);
				return (
					<li
						key={stage.stageId}
						className={cx(
							isCompleted && "pipeline-step-completed",
							isActive && "pipeline-step-active",
							isFailed && "pipeline-step-failed",
						)}
						style={{
							display: "grid",
							justifyItems: "center",
							gap: "var(--sp-2)",
							color: isActive
								? "var(--accent)"
								: isCompleted
									? "var(--success)"
									: isFailed
										? "var(--error)"
										: "var(--text-tertiary)",
							...monoTextStyle,
							fontSize: "var(--sp-5)",
							textAlign: "center",
						}}
					>
						<span
							style={{
								display: "inline-grid",
								placeItems: "center",
								width: "var(--sp-10)",
								height: "var(--sp-10)",
								borderRadius: "var(--r-full)",
								border: "var(--factory-border-width) solid currentColor",
								background: isCompleted ? "var(--success)" : "transparent",
								color: isCompleted ? "var(--text-dark-primary)" : "currentColor",
							}}
						>
							{isCompleted ? <PrimitiveIcon icon={Check} /> : index + 1}
						</span>
						<b style={{ fontWeight: 500 }}>{stage.label}</b>
					</li>
				);
			})}
		</ol>
	);
}
