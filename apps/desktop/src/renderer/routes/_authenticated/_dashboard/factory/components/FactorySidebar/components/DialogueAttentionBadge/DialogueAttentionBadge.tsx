import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";

interface DialogueAttentionBadgeProps {
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
		<Badge
			variant="outline"
			aria-label={`${displayCount} dialogues need your attention`}
			className={cn(
				"min-w-5 justify-center px-1.5 py-0 text-[10px] font-semibold shadow-none",
				className,
			)}
			style={
				hasMineAttention
					? {
							backgroundColor: "var(--bg-soft)",
							borderColor: "var(--accent)",
							color: "var(--accent)",
						}
					: undefined
			}
		>
			{displayCount}
		</Badge>
	);
}
