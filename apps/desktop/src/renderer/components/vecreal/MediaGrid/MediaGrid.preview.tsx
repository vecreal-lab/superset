import { MediaGrid } from "./MediaGrid";

export function MediaGridPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<MediaGrid items={[{ id: "one", label: "Mockup one", status: "approved" }, { id: "two", label: "Mockup two", status: "pending" }]} />
		</div>
	);
}

export default MediaGridPreview;
