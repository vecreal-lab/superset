import { EmptyState } from "./EmptyState";

export function EmptyStatePreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<EmptyState title="Nothing here" message="Add a filter or clear the search." />
		</div>
	);
}

export default EmptyStatePreview;
