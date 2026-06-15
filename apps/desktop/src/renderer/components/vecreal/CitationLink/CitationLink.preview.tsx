import { CitationLink } from "./CitationLink";

export function CitationLinkPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<CitationLink href="/source.md" source="section 08">Source</CitationLink>
		</div>
	);
}

export default CitationLinkPreview;
