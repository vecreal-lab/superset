import { Wordmark } from "./Wordmark";

export function WordmarkPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<Wordmark size="titlebar" tone="dark" />
		</div>
	);
}

export default WordmarkPreview;
