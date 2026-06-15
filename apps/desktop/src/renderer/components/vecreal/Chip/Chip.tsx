import type { CSSProperties, ReactNode } from "react";
import {
	colorTokens,
	radiusTokens,
	spacingTokens,
	type TokenEntry,
} from "../tokens";

export interface ChipProps {
	children?: ReactNode;
	label?: string;
	tone?: "neutral" | "clay" | "success" | "warning" | "error" | "info";
	size?: "xs" | "sm" | "md";
	selected?: boolean;
	disabled?: boolean;
	onRemove?: () => void;
	removeLabel?: string;
	avatarInitials?: string;
	className?: string;
	style?: CSSProperties;
}

function tokenVar(token: Pick<TokenEntry, "cssVariable" | "value">): string {
	return token.cssVariable ? `var(${token.cssVariable})` : token.value;
}

const toneColor: Record<NonNullable<ChipProps["tone"]>, string> = {
	neutral: "var(--text-secondary)",
	clay: "var(--accent)",
	success: tokenVar(colorTokens.success),
	warning: "var(--warning)",
	error: tokenVar(colorTokens.error),
	info: tokenVar(colorTokens.info),
};

const sizeStyles: Record<NonNullable<ChipProps["size"]>, CSSProperties> = {
	xs: {
		minHeight: tokenVar(spacingTokens["sp-8"]),
		paddingInline: tokenVar(spacingTokens["sp-3"]),
		fontSize: tokenVar(spacingTokens["sp-5"]),
	},
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

const avatarSizes: Record<NonNullable<ChipProps["size"]>, string> = {
	xs: tokenVar(spacingTokens["sp-7"]),
	sm: tokenVar(spacingTokens["sp-8"]),
	md: tokenVar(spacingTokens["sp-9"]),
};

export function Chip({
	children,
	label,
	tone = "neutral",
	size = "sm",
	selected,
	disabled,
	onRemove,
	removeLabel,
	avatarInitials,
	className,
	style,
}: ChipProps) {
	const content = children ?? label;
	const accent = toneColor[tone];
	const selectedBorder = tone === "neutral" ? "var(--border-strong)" : accent;
	const selectedColor = tone === "neutral" ? "var(--text-primary)" : accent;
	const chipStyle: CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		justifySelf: "start",
		alignSelf: "start",
		gap: tokenVar(spacingTokens["sp-2"]),
		width: "fit-content",
		maxWidth: "100%",
		border: "var(--factory-border-width) solid",
		borderColor: selected ? selectedBorder : "var(--border)",
		borderRadius: tokenVar(radiusTokens["r-3"]),
		background: selected ? "var(--bg-hover)" : "var(--bg-soft)",
		color: selected ? selectedColor : "var(--text-secondary)",
		fontFamily: "var(--font-ui)",
		fontWeight: 500,
		lineHeight: 1,
		letterSpacing: 0,
		whiteSpace: "nowrap",
		opacity: disabled ? "var(--disabled-opacity)" : undefined,
		...sizeStyles[size],
		...style,
	};
	const avatarStyle: CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: avatarSizes[size],
		height: avatarSizes[size],
		marginInlineStart: `calc(${sizeStyles[size].paddingInline} * -1 + ${tokenVar(spacingTokens["sp-1"])})`,
		borderRadius: tokenVar(radiusTokens["r-full"]),
		border: "var(--factory-border-width) solid var(--border)",
		background: "var(--bg-card)",
		color: "var(--text-secondary)",
		fontFamily: "var(--font-mono)",
		fontSize: tokenVar(spacingTokens["sp-5"]),
		fontWeight: 500,
		lineHeight: 1,
	};

	return (
		<span
			className={className}
			data-vecreal-component="Chip"
			data-tone={tone}
			data-selected={selected ? "true" : "false"}
			aria-disabled={disabled}
			style={chipStyle}
		>
			{avatarInitials ? (
				<span aria-hidden="true" style={avatarStyle}>
					{avatarInitials}
				</span>
			) : null}
			<span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
				{content}
			</span>
			{onRemove ? (
				<button
					type="button"
					aria-label={removeLabel ?? `Remove ${plainText(content)}`}
					onClick={onRemove}
					disabled={disabled}
					style={{
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						width: tokenVar(spacingTokens["sp-8"]),
						height: tokenVar(spacingTokens["sp-8"]),
						minHeight: tokenVar(spacingTokens["sp-8"]),
						padding: 0,
						border: 0,
						borderRadius: tokenVar(radiusTokens["r-full"]),
						background: "transparent",
						color: accent,
						fontFamily: "var(--font-ui)",
						fontSize: tokenVar(spacingTokens["sp-6"]),
						lineHeight: 1,
						cursor: disabled ? "not-allowed" : "pointer",
					}}
				>
					<span aria-hidden="true">x</span>
				</button>
			) : null}
		</span>
	);
}

function plainText(value: ReactNode): string {
	if (typeof value === "string" || typeof value === "number") return String(value);
	if (Array.isArray(value)) return value.map(plainText).join(" ");
	return "chip";
}
