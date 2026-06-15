import type { CSSProperties, ReactNode } from "react";
import {
	colorTokens,
	focusTokens,
	radiusTokens,
	spacingTokens,
	type TokenEntry,
} from "../tokens";

export type StatusBadgeVariant = "success" | "warning" | "error" | "info" | "neutral";
export type StatusBadgeSize = "sm" | "md";

export interface StatusBadgeProps {
	variant?: StatusBadgeVariant;
	size?: StatusBadgeSize;
	children: ReactNode;
	className?: string;
	isLive?: boolean;
	ariaLabel?: string;
}

interface VariantStyle {
	accent: string;
	border: string;
	background: string;
	label: string;
}

function tokenVar(token: Pick<TokenEntry, "cssVariable" | "value">): string {
	return token.cssVariable ? `var(${token.cssVariable})` : token.value;
}

const variants: Record<StatusBadgeVariant, VariantStyle> = {
	success: {
		accent: tokenVar(colorTokens.success),
		border: tokenVar(colorTokens.success),
		background: "var(--bg-soft)",
		label: "Success",
	},
	warning: {
		accent: "var(--warning)",
		border: "var(--warning)",
		background: "var(--bg-soft)",
		label: "Needs attention",
	},
	error: {
		accent: tokenVar(colorTokens.error),
		border: tokenVar(colorTokens.error),
		background: "var(--bg-soft)",
		label: "Error",
	},
	info: {
		accent: tokenVar(colorTokens.info),
		border: tokenVar(colorTokens.info),
		background: "var(--bg-soft)",
		label: "Information",
	},
	neutral: {
		accent: "var(--text-tertiary)",
		border: "var(--border)",
		background: "var(--bg-soft)",
		label: "Neutral",
	},
};

const sizes: Record<StatusBadgeSize, CSSProperties> = {
	sm: {
		minHeight: tokenVar(spacingTokens["sp-9"]),
		paddingInline: tokenVar(spacingTokens["sp-4"]),
		fontSize: tokenVar(spacingTokens["sp-5"]),
	},
	md: {
		minHeight: tokenVar(spacingTokens["sp-10"]),
		paddingInline: tokenVar(spacingTokens["sp-5"]),
		fontSize: tokenVar(spacingTokens["sp-6"]),
	},
};

const dotSize: Record<StatusBadgeSize, string> = {
	sm: tokenVar(spacingTokens["sp-2"]),
	md: tokenVar(spacingTokens["sp-3"]),
};

export function StatusBadge({
	variant = "neutral",
	size = "sm",
	children,
	className,
	isLive = false,
	ariaLabel,
}: StatusBadgeProps) {
	const tone = variants[variant];
	const style: CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		justifySelf: "start",
		alignSelf: "start",
		gap: tokenVar(spacingTokens["sp-2"]),
		width: "fit-content",
		maxWidth: "100%",
		border: "var(--factory-border-width) solid",
		borderColor: variant === "neutral" ? tone.border : "var(--border)",
		borderRadius: tokenVar(radiusTokens["r-3"]),
		background: tone.background,
		color: variant === "neutral" ? "var(--text-secondary)" : "var(--text-primary)",
		fontFamily: "var(--font-ui)",
		fontWeight: 500,
		letterSpacing: 0,
		lineHeight: 1,
		whiteSpace: "nowrap",
		boxShadow: isLive ? tokenVar(focusTokens["focus-ring-soft"]) : undefined,
		...sizes[size],
	};
	const dotStyle: CSSProperties = {
		width: dotSize[size],
		height: dotSize[size],
		borderRadius: tokenVar(radiusTokens["r-full"]),
		background: tone.accent,
		flex: "0 0 auto",
		boxShadow: isLive ? tokenVar(focusTokens["focus-ring-soft"]) : undefined,
	};

	return (
		<span
			role="status"
			aria-live={isLive ? "polite" : "off"}
			aria-label={ariaLabel ?? `${tone.label}: ${plainText(children)}`}
			className={className}
			data-vecreal-component="StatusBadge"
			data-status-variant={variant}
			data-status-live={isLive ? "true" : "false"}
			style={style}
		>
			<span aria-hidden="true" style={dotStyle} />
			<span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
				{children}
			</span>
		</span>
	);
}

function plainText(value: ReactNode): string {
	if (typeof value === "string" || typeof value === "number") return String(value);
	if (Array.isArray(value)) return value.map(plainText).join(" ");
	return "status";
}
