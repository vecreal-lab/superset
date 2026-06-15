import { DiffBlock } from "./DiffBlock";

export function DiffBlockPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<DiffBlock lines={[{ id: "1", type: "added", text: "new line" }, { id: "2", type: "removed", text: "old line" }]} />
		</div>
	);
}

export default DiffBlockPreview;
