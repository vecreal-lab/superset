import { brandMarkTokens, colorTokens, r, s, textBase, tokenVar, v } from "../componentInternals";

export interface WordmarkProps {
	size?: "titlebar" | "header" | "deck";
	tone?: "light" | "dark";
	decorative?: boolean;
	className?: string;
}

export function Wordmark({ size = "titlebar", tone = "dark", decorative, className }: WordmarkProps) {
	const fontSize = size === "deck" ? s.px11 : size === "header" ? s.px10 : s.px9;
	const color = tone === "dark" ? tokenVar(colorTokens["text-dark-primary"]) : tokenVar(colorTokens["text-light-primary"]);
	return (
		<span
			aria-label={decorative ? undefined : "Vecreal"}
			aria-hidden={decorative ? "true" : undefined}
			className={className}
			data-vecreal-component="Wordmark"
			style={{
				...textBase,
				display: "inline-flex",
				alignItems: "baseline",
				color,
				fontSize,
				fontWeight: 700,
				lineHeight: 1,
			}}
		>
			<span style={{ marginRight: tokenVar(brandMarkTokens["bk-v-margin-right"]) }}>V</span>
			<span>ecreal</span>
			<span
				aria-hidden="true"
				style={{
					width: tokenVar(brandMarkTokens["bk-dot-size"]),
					height: tokenVar(brandMarkTokens["bk-dot-size"]),
					marginLeft: tokenVar(brandMarkTokens["bk-dot-margin-left"]),
					marginBottom: tokenVar(brandMarkTokens["bk-dot-margin-bottom"]),
					borderRadius: r.pill,
					background: tone === "dark" ? v.clayBright : v.clayLight,
					display: "inline-block",
				}}
			/>
		</span>
	);
}
