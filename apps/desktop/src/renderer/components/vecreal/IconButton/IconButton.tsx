import type { CSSProperties, ReactNode } from "react";
import { buttonBase, mergeStyle, r, s, v } from "../componentInternals";

export interface IconButtonProps {
	children: ReactNode;
	label: string;
	variant?: "ghost" | "toolbar" | "chrome";
	size?: "sm" | "md";
	pressed?: boolean;
	disabled?: boolean;
	onClick?: () => void;
	className?: string;
	style?: CSSProperties;
}

export function IconButton({
	children,
	label,
	variant = "ghost",
	size = "md",
	pressed,
	disabled,
	onClick,
	className,
	style,
}: IconButtonProps) {
	const dimension = size === "sm" ? s.px10 : "calc(var(--sp-11) + var(--sp-2))";
	const variantStyle: CSSProperties =
		variant === "toolbar"
			? { background: v.bgSoft, borderColor: v.border }
			: variant === "chrome"
				? { background: "transparent", borderColor: "transparent", color: v.muted }
				: { background: "transparent", borderColor: "transparent" };

	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={pressed}
			disabled={disabled}
			onClick={onClick}
			className={className}
			data-vecreal-component="IconButton"
			data-variant={variant}
			style={mergeStyle(buttonBase, variantStyle, {
				width: dimension,
				height: dimension,
				minHeight: dimension,
				padding: 0,
				borderRadius: r.sm,
				color: pressed ? v.clayLight : v.body,
				boxShadow: pressed ? v.focusRingSoft : undefined,
			}, disabled ? { opacity: "var(--disabled-opacity)", cursor: "not-allowed" } : undefined, style)}
		>
			{children}
		</button>
	);
}
