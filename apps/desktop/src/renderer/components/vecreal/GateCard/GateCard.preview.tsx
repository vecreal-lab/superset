import { GateCard } from "./GateCard";

export function GateCardPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<GateCard title="Gate 3" summary="Review visual preview" status="pending" actions={[{ label: "Approve" }]} />
		</div>
	);
}

export default GateCardPreview;
