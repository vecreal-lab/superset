import { PipelineStrip } from "./PipelineStrip";

export function PipelineStripPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<PipelineStrip stages={[{ id: "a", label: "Scope", state: "complete" }, { id: "b", label: "Build", state: "active" }]} />
		</div>
	);
}

export default PipelineStripPreview;
