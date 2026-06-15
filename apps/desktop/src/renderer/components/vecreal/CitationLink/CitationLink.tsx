import type { ReactNode } from "react";
import { s, textBase, v } from "../componentInternals";

export interface CitationLinkProps {
	href: string;
	children: ReactNode;
	source?: string;
	confidence?: "high" | "medium" | "low";
}

export function CitationLink({ href, children, source, confidence = "high" }: CitationLinkProps) {
	return (
		<a
			href={href}
			data-vecreal-component="CitationLink"
			data-confidence={confidence}
			style={{
				...textBase,
				display: "inline-flex",
				alignItems: "center",
				gap: s.px3,
				color: confidence === "low" ? v.warning : v.clayLight,
				textDecoration: "underline",
				textDecorationColor: "currentColor",
				textUnderlineOffset: s.px2,
			}}
		>
			<span>{children}</span>
			{source ? <span style={{ color: v.muted, fontSize: s.px6 }}>({source})</span> : null}
		</a>
	);
}
