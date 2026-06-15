import { BulkActionsBar } from "./BulkActionsBar";

export function BulkActionsBarPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<BulkActionsBar selectedCount={2} actions={[{ id: "mark", label: "Mark reviewed" }]} />
		</div>
	);
}

export default BulkActionsBarPreview;
