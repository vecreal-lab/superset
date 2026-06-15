import type { CSSProperties, ElementType, ReactNode } from "react";
import { mergeStyle, r, s, textBase, v } from "../componentInternals";

export interface CardProps {
	children: ReactNode;
	variant?: "default" | "compact" | "interactive" | "evidence";
	selected?: boolean;
	as?: ElementType;
	className?: string;
	style?: CSSProperties;
}

export function Card({
	children,
	variant = "default",
	selected,
	as: Tag = "section",
	className,
	style,
}: CardProps) {
	const pad = variant === "compact" ? s.px7 : s.px9;
	return (
		<Tag
			className={className}
			data-vecreal-component="Card"
			data-variant={variant}
			data-selected={selected ? "true" : "false"}
			style={mergeStyle({
				...textBase,
				display: "flex",
				flexDirection: "column",
				gap: s.px6,
				padding: pad,
				border: `${v.borderWidth} solid ${selected ? v.clayLight : v.border}`,
				borderRadius: r.md,
				background: variant === "evidence" ? v.bgSoft : v.bg,
				boxShadow: variant === "interactive" || selected ? v.cardShadow : undefined,
				color: v.text,
			}, style)}
		>
			{children}
		</Tag>
	);
}
