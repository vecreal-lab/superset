import { cx, monoTextStyle } from "../common";

export interface DialogueAttentionBadgeProps {
	count: number;
	hasMineAttention: boolean;
	className?: string;
}

export function DialogueAttentionBadge({
	count,
	hasMineAttention,
	className,
}: DialogueAttentionBadgeProps) {
	if (count <= 0) return null;
	const displayCount = count > 99 ? "99+" : String(count);
	return (
		<span
			className={cx(
				"factory-badge",
				hasMineAttention && "factory-badge--attention",
				className,
			)}
			aria-label={`${displayCount} dialogues need your attention`}
			style={{
				...monoTextStyle,
				minWidth: "var(--sp-9)",
				height: "var(--sp-9)",
				padding: "0 var(--sp-2)",
				fontSize: "var(--sp-5)",
			}}
		>
			{displayCount}
		</span>
	);
}
