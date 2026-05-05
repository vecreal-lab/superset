import type { AuthorAttribution } from "lib/types/factory-operator-console";
import { cx, inlineStyle, monoTextStyle } from "../common";

export interface AuthorChipProps {
	attribution: AuthorAttribution;
	size?: "sm" | "md";
	variant?: "inline" | "card-header";
	className?: string;
}

export function AuthorChip({
	attribution,
	size = "sm",
	variant = "inline",
	className,
}: AuthorChipProps) {
	const label = attribution.displayName || attribution.user;
	const roleLabel =
		attribution.role === "PROJECT_COORDINATOR"
			? "PC"
			: attribution.role === "UIUX_COORDINATOR"
				? "UIUX"
				: attribution.role;

	return (
		<span
			className={cx("factory-chip", className)}
			style={{
				...inlineStyle,
				height: size === "md" ? "var(--sp-10)" : "var(--sp-9)",
				padding:
					variant === "card-header"
						? "0 var(--sp-5)"
						: "0 var(--sp-4)",
				fontFamily: "var(--font-ui)",
				fontSize: size === "md" ? "var(--sp-7)" : "var(--sp-6)",
				fontWeight: 500,
			}}
		>
			<span>{label}</span>
			{attribution.isAgent && roleLabel && (
				<span
					className="factory-chip factory-chip--attention"
					style={{
						padding: "0 var(--sp-3)",
						height: "var(--sp-8)",
						fontFamily: "var(--font-mono)",
						fontSize: "var(--sp-5)",
						fontWeight: 600,
						...monoTextStyle,
					}}
				>
					{roleLabel}
				</span>
			)}
		</span>
	);
}
