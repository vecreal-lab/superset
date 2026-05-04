import type { CSSProperties } from "react";
import type { AuthorAttribution } from "lib/types/factory-operator-console";
import { cx, initialsFor, inlineStyle, monoTextStyle } from "../common";

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
	const avatarSize = size === "md" ? "var(--sp-10)" : "var(--sp-9)";
	const style: CSSProperties = {
		...inlineStyle,
		fontSize: size === "md" ? "var(--sp-7)" : "var(--sp-6)",
	};

	return (
		<span
			className={cx("factory-chip", className)}
			style={{
				...style,
				padding: variant === "card-header" ? "var(--sp-2) var(--sp-4)" : 0,
				borderColor: variant === "inline" ? "transparent" : "var(--border)",
				background: variant === "inline" ? "transparent" : "var(--bg-soft)",
			}}
		>
			<span
				aria-hidden="true"
				style={{
					display: "inline-grid",
					placeItems: "center",
					width: avatarSize,
					height: avatarSize,
					borderRadius: "var(--r-full)",
					border: "var(--factory-border-width) solid var(--border)",
					background: "var(--bg-soft)",
					color: "var(--text-primary)",
					...monoTextStyle,
					fontSize: "var(--sp-5)",
				}}
			>
				{initialsFor(attribution.displayName || attribution.user)}
			</span>
			<span>{attribution.displayName || attribution.user}</span>
			{attribution.isAgent && attribution.role && (
				<span
					className="factory-chip factory-chip--attention"
					style={{
						padding: "0 var(--sp-3)",
						fontSize: "var(--sp-5)",
					}}
				>
					{attribution.role}
				</span>
			)}
		</span>
	);
}
