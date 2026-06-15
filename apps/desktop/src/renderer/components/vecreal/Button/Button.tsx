import type { CSSProperties, ReactNode } from "react";
import { buttonBase, mergeStyle, s, v } from "../componentInternals";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "clay";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
	children: ReactNode;
	variant?: ButtonVariant;
	size?: ButtonSize;
	disabled?: boolean;
	loading?: boolean;
	type?: "button" | "submit" | "reset";
	ariaLabel?: string;
	onClick?: () => void;
	className?: string;
	style?: CSSProperties;
}

const buttonSizes: Record<ButtonSize, CSSProperties> = {
	sm: { minHeight: s.px10, paddingInline: s.px5, fontSize: s.px6 },
	md: { minHeight: s.px11, paddingInline: s.px7, fontSize: s.px7 },
	lg: { minHeight: "calc(var(--sp-11) + var(--sp-4))", paddingInline: s.px9, fontSize: s.px8 },
};

const buttonVariants: Record<ButtonVariant, CSSProperties> = {
	primary: { background: "var(--bg-cta)", color: "var(--text-on-cta)", borderColor: "var(--bg-cta)" },
	secondary: { background: v.bgSoft, color: v.text, borderColor: v.border },
	ghost: { background: "transparent", color: v.body, borderColor: "transparent" },
	clay: { background: v.clayLight, color: "var(--bg-card-light)", borderColor: v.clayLight },
};

export function Button({
	children,
	variant = "secondary",
	size = "md",
	disabled,
	loading,
	type = "button",
	ariaLabel,
	onClick,
	className,
	style,
}: ButtonProps) {
	const isDisabled = disabled || loading;
	return (
		<button
			type={type}
			aria-label={ariaLabel}
			aria-busy={loading ? "true" : undefined}
			disabled={isDisabled}
			onClick={onClick}
			className={className}
			data-vecreal-component="Button"
			data-variant={variant}
			style={mergeStyle(buttonBase, buttonSizes[size], buttonVariants[variant], isDisabled ? { opacity: "var(--disabled-opacity)", cursor: "not-allowed" } : undefined, style)}
		>
			{loading ? <span aria-hidden="true">...</span> : null}
			{children}
		</button>
	);
}
