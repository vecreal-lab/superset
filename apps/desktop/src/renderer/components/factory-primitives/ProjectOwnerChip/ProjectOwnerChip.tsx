import { UserRound } from "lucide-react";
import { PrimitiveIcon, cx, inlineStyle, monoTextStyle } from "../common";

export interface ProjectOwnerChipProps {
	owner: string;
	size?: "sm" | "md";
	className?: string;
}

export function ProjectOwnerChip({
	owner,
	size = "sm",
	className,
}: ProjectOwnerChipProps) {
	return (
		<span
			className={cx("factory-chip", className)}
			style={{
				...inlineStyle,
				...monoTextStyle,
				height: size === "md" ? "var(--sp-11)" : "var(--sp-10)",
				padding: "0 var(--sp-5)",
				fontSize: size === "md" ? "var(--sp-6)" : "var(--sp-5)",
			}}
			title="Project owner"
		>
			<PrimitiveIcon icon={UserRound} />
			{owner}
		</span>
	);
}
