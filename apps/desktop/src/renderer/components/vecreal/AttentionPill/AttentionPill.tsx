import type { CSSProperties, ReactNode } from "react";
import {
	colorTokens,
	focusTokens,
	radiusTokens,
	spacingTokens,
	type TokenEntry,
} from "../tokens";

export interface AttentionPillProps {
	children?: ReactNode;
	count?: number | "12+";
	variant?: "attention" | "warning" | "blocker" | "info";
	size?: "sm" | "md";
	isLive?: boolean;
	compact?: boolean;
}

function tokenVar(token: Pick<TokenEntry, "cssVariable" | "value">): string {
	return token.cssVariable ? `var(${token.cssVariable})` : token.value;
}

const toneColor: Record<NonNullable<AttentionPillProps["variant"]>, string> = {
	attention: "var(--accent)",
	warning: "var(--warning)",
	blocker: tokenVar(colorTokens.error),
	info: tokenVar(colorTokens.info),
};

const sizeStyles: Record<NonNullable<AttentionPillProps["size"]>, CSSProperties> = {
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

const countSize: Record<NonNullable<AttentionPillProps["size"]>, string> = {
	sm: tokenVar(spacingTokens["sp-8"]),
	md: tokenVar(spacingTokens["sp-9"]),
};

export function AttentionPill({
	children,
	count,
	variant = "attention",
	size = "sm",
	isLive,
	compact,
}: AttentionPillProps) {
	const accent = toneColor[variant];
	const countLabel = formatCount(count);
	const hasText = Boolean(children) && !compact;
	const isLongCount = Boolean(countLabel && countLabel.length > 1);
	const badgeStyle: CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: hasText || isLongCount ? "auto" : countSize[size],
		minWidth: countSize[size],
		height: countSize[size],
		paddingInline: hasText || isLongCount ? tokenVar(spacingTokens["sp-2"]) : 0,
		borderRadius: tokenVar(radiusTokens["r-full"]),
		background: accent,
		color: "var(--text-dark-primary)",
		boxShadow: `0 0 0 ${tokenVar(spacingTokens["sp-1"])} var(--bg-app)`,
		fontFamily: "var(--font-mono)",
		fontSize: tokenVar(spacingTokens["sp-5"]),
		fontWeight: 600,
		lineHeight: 1,
	};
	const pillStyle: CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		justifySelf: "start",
		alignSelf: "start",
		gap: tokenVar(spacingTokens["sp-2"]),
		width: "fit-content",
		maxWidth: "100%",
		border: hasText ? "var(--factory-border-width) solid var(--border)" : "0",
		borderRadius: hasText ? tokenVar(radiusTokens["r-3"]) : tokenVar(radiusTokens["r-full"]),
		background: hasText ? "var(--bg-soft)" : "transparent",
		color: "var(--text-primary)",
		fontFamily: "var(--font-ui)",
		fontWeight: 500,
		lineHeight: 1,
		letterSpacing: 0,
		whiteSpace: "nowrap",
		boxShadow: isLive ? tokenVar(focusTokens["focus-ring-soft"]) : undefined,
		...sizeStyles[size],
		paddingInline: hasText ? sizeStyles[size].paddingInline : 0,
		minHeight: hasText ? sizeStyles[size].minHeight : countSize[size],
	};
	const label = plainText(children ?? countLabel ?? "Needs attention");

	return (
		<span
			role="status"
			aria-live={isLive ? "polite" : "off"}
			aria-label={`${label} attention`}
			data-vecreal-component="AttentionPill"
			data-attention-variant={variant}
			data-attention-live={isLive ? "true" : "false"}
			style={pillStyle}
		>
			<span aria-hidden="true" style={badgeStyle}>
				{countLabel ?? "!"}
			</span>
			{hasText ? (
				<span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
					{children}
				</span>
			) : null}
		</span>
	);
}

function formatCount(count: AttentionPillProps["count"]): string | undefined {
	if (typeof count === "number") return count > 99 ? "99+" : String(count);
	return count;
}

function plainText(value: ReactNode): string {
	if (typeof value === "string" || typeof value === "number") return String(value);
	if (Array.isArray(value)) return value.map(plainText).join(" ");
	return "attention";
}
