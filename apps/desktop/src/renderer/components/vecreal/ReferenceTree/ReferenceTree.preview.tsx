import { ReferenceTree } from "./ReferenceTree";

export function ReferenceTreePreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<ReferenceTree nodes={[{ id: "identity", label: "Identity", state: "satisfied", children: [{ id: "mission", label: "Mission", state: "pending" }] }]} />
		</div>
	);
}

export default ReferenceTreePreview;
