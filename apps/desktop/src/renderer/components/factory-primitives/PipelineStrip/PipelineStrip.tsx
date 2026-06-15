import { Check } from "lucide-react";
import type { PipelineStage } from "lib/types/factory-operator-console";
import {
	StatusBadge,
	type StatusBadgeVariant,
} from "renderer/components/vecreal/StatusBadge";
import { GateAdvancePulse } from "renderer/components/vecreal/GateAdvancePulse";
import { PrimitiveIcon, cx, monoTextStyle } from "../common";

export interface PipelineStripProps {
	stages: PipelineStage[];
	currentStageId?: string;
	layout?: "horizontal" | "vertical";
	completedStageIds?: string[];
	failedStageIds?: string[];
}

function statusVariantForStage(input: {
	isCompleted: boolean;
	isActive: boolean;
	isFailed: boolean;
}): StatusBadgeVariant {
	if (input.isFailed) return "error";
	if (input.isCompleted) return "success";
	if (input.isActive) return "info";
	return "neutral";
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
				const previousStage = stages[index - 1];
				const previousCompleted =
					Boolean(previousStage && completedStageIds.includes(previousStage.stageId)) ||
					(activeIndex > -1 && index - 1 < activeIndex);
				const isActive = stage.stageId === currentStageId;
				const isFailed = failedStageIds.includes(stage.stageId);
				const gateState = isFailed
					? "failed"
					: isCompleted
						? "done"
						: isActive
							? "active"
							: "pending";
				return (
					<li
						key={stage.stageId}
						className={cx(
							isCompleted && "pipeline-step-completed",
							isActive && "pipeline-step-active",
							isFailed && "pipeline-step-failed",
						)}
						style={{
							position: "relative",
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
						{layout === "horizontal" && index > 0 ? (
							<span
								aria-hidden="true"
								style={{
									position: "absolute",
									top: "calc(var(--sp-10) / 2)",
									right: "50%",
									width: "calc(100% + var(--sp-5))",
									height: "var(--factory-border-width)",
									background: previousCompleted ? "var(--success)" : "var(--border)",
									zIndex: 0,
								}}
							/>
						) : null}
						<span
							style={{
								position: "relative",
								zIndex: 1,
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
						<GateAdvancePulse state={gateState} label={stage.label} pulseOnMount>
							<StatusBadge
								variant={statusVariantForStage({ isCompleted, isActive, isFailed })}
								size="sm"
								isLive={isActive}
								ariaLabel={`Pipeline stage ${stage.label}: ${
									isFailed
										? "failed"
										: isCompleted
											? "completed"
											: isActive
												? "active"
												: "pending"
								}`}
							>
								{stage.label}
							</StatusBadge>
						</GateAdvancePulse>
					</li>
				);
			})}
		</ol>
	);
}
