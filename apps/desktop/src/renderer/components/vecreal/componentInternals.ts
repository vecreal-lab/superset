import type { CSSProperties, ReactNode } from "react";
import {
	brandMarkTokens,
	colorTokens,
	focusTokens,
	motionTokens,
	radiusTokens,
	shadowTokens,
	spacingTokens,
	type TokenEntry,
} from "./tokens";

export {
	brandMarkTokens,
	colorTokens,
	focusTokens,
	motionTokens,
	radiusTokens,
	shadowTokens,
	spacingTokens,
};

export function tokenVar(token: Pick<TokenEntry, "cssVariable" | "value">): string {
	return token.cssVariable ? `var(${token.cssVariable})` : token.value;
}

export const v = {
	bg: "var(--bg-card)",
	bgSoft: "var(--bg-soft)",
	bgHover: "var(--bg-hover)",
	border: "var(--border)",
	text: "var(--text-primary)",
	body: "var(--text-body)",
	muted: "var(--text-tertiary)",
	disabled: "var(--text-disabled)",
	font: "var(--font-ui)",
	mono: "var(--font-mono)",
	borderWidth: "var(--factory-border-width)",
	clayLight: tokenVar(colorTokens["clay-light"]),
	clayBright: tokenVar(colorTokens["clay-bright"]),
	clay: tokenVar(colorTokens.clay),
	success: tokenVar(colorTokens.success),
	warning: "var(--warning)",
	error: tokenVar(colorTokens.error),
	info: tokenVar(colorTokens.info),
	cardShadow: tokenVar(shadowTokens["shadow-card-light"]),
	modalShadow: tokenVar(shadowTokens["shadow-modal-light"]),
	focusRing: tokenVar(focusTokens["focus-ring"]),
	focusRingSoft: tokenVar(focusTokens["focus-ring-soft"]),
	fast: tokenVar(motionTokens["motion-fast"]),
	medium: tokenVar(motionTokens["motion-medium"]),
	slow: tokenVar(motionTokens["motion-slow"]),
	ease: tokenVar(motionTokens["ease-out"]),
};

export const s = {
	px2: tokenVar(spacingTokens["sp-2"]),
	px3: tokenVar(spacingTokens["sp-3"]),
	px4: tokenVar(spacingTokens["sp-4"]),
	px5: tokenVar(spacingTokens["sp-5"]),
	px6: tokenVar(spacingTokens["sp-6"]),
	px7: tokenVar(spacingTokens["sp-7"]),
	px8: tokenVar(spacingTokens["sp-8"]),
	px9: tokenVar(spacingTokens["sp-9"]),
	px10: tokenVar(spacingTokens["sp-10"]),
	px11: tokenVar(spacingTokens["sp-11"]),
};

export const r = {
	xs: tokenVar(radiusTokens["r-2"]),
	sm: tokenVar(radiusTokens["r-3"]),
	md: tokenVar(radiusTokens["r-5"]),
	lg: tokenVar(radiusTokens["r-6"]),
	pill: tokenVar(radiusTokens["r-full"]),
};

export function join(label: ReactNode): string {
	if (typeof label === "string" || typeof label === "number") return String(label);
	if (Array.isArray(label)) return label.map(join).join(" ");
	return "item";
}

export function mergeStyle(...styles: Array<CSSProperties | undefined>): CSSProperties {
	return Object.assign({}, ...styles.filter(Boolean));
}

export function srOnly(): CSSProperties {
	return {
		position: "absolute",
		width: "var(--sp-1)",
		height: "var(--sp-1)",
		padding: 0,
		margin: "calc(var(--sp-1) * -1)",
		overflow: "hidden",
		clip: "rect(0 0 0 0)",
		whiteSpace: "nowrap",
		border: 0,
	};
}

export const textBase: CSSProperties = {
	fontFamily: v.font,
	color: v.text,
	letterSpacing: 0,
};

export const buttonBase: CSSProperties = {
	...textBase,
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	gap: s.px4,
	border: `${v.borderWidth} solid ${v.border}`,
	borderRadius: r.sm,
	cursor: "pointer",
	textDecoration: "none",
	transition: `background ${v.fast} ${v.ease}, border-color ${v.fast} ${v.ease}, box-shadow ${v.fast} ${v.ease}`,
	whiteSpace: "nowrap",
};

export const overlaySurface: CSSProperties = {
	...textBase,
	display: "grid",
	gap: s.px6,
	padding: s.px9,
	border: `${v.borderWidth} solid ${v.border}`,
	borderRadius: r.lg,
	background: v.bg,
	boxShadow: v.modalShadow,
	color: v.text,
	maxWidth: "min(100%, calc(var(--sp-14) * 6))",
};
